// Server multiplayer Werewolf — Express + Socket.IO
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { Game } from '../shared/engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingInterval: 10000, pingTimeout: 20000 });

/** @type {Map<string, Game>} */
const rooms = new Map();
const sessions = new Map(); // sessionId -> { code }

const genCode = () => {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c; do { c = Array.from({ length: 6 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c));
  return c;
};

// ---------- broadcast (digabung per tick) ----------
const dirty = new Set();
function markDirty(game) {
  if (!dirty.size) setImmediate(flush);
  dirty.add(game.code);
}
function flush() {
  for (const code of dirty) {
    const game = rooms.get(code);
    if (!game) continue;
    for (const [, s] of io.of('/').sockets) {
      if (s.data.code === code) s.emit('state', game.view(s.data.sid));
    }
  }
  dirty.clear();
  io.to('lobby').emit('rooms', roomList());
}
const roomList = () => [...rooms.values()].filter((g) => g.isPublic && g.humanCount > 0).map((g) => g.summary()).slice(0, 50);

function createGame(sid, name, opts) {
  const code = genCode();
  const game = new Game({ code, name: opts.roomName, hostId: sid, hostName: name, hostIsMod: !!opts.hostIsMod, isPublic: opts.isPublic !== false, onChange: markDirty });
  rooms.set(code, game);
  return game;
}

// ---------- socket ----------
io.on('connection', (socket) => {
  const sid = String(socket.handshake.auth?.sid || '').slice(0, 40);
  if (!/^[a-zA-Z0-9_-]{8,40}$/.test(sid)) { socket.emit('fatal', 'Sesi tidak valid'); return socket.disconnect(); }
  socket.data.sid = sid;
  socket.join('lobby');
  socket.emit('rooms', roomList());

  // sambung ulang otomatis ke room terakhir
  const prev = sessions.get(sid);
  if (prev && rooms.get(prev.code)?.players.has(sid)) attach(socket, rooms.get(prev.code));

  function attach(s, game) {
    // satu sesi hanya boleh di satu socket per room
    for (const [, other] of io.of('/').sockets) if (other !== s && other.data.sid === sid && other.data.code === game.code) { other.data.code = null; other.emit('kicked', 'Kamu membuka game di tab lain.'); }
    s.data.code = game.code;
    s.leave('lobby');
    sessions.set(sid, { code: game.code });
    game.setConnected(sid, true);
    markDirty(game);
  }
  const game = () => rooms.get(socket.data.code);
  const reply = (cb, r) => typeof cb === 'function' && cb(r || { ok: true });

  socket.on('rooms', (_p, cb) => reply(typeof _p === 'function' ? _p : cb, { ok: true, rooms: roomList() }));

  socket.on('create', (o = {}, cb) => {
    if (socket.data.code) leave();
    const name = String(o.name || '').trim();
    if (!name) return reply(cb, { ok: false, error: 'Isi nama dulu.' });
    const g = createGame(sid, name, o);
    attach(socket, g);
    reply(cb, { ok: true, code: g.code });
  });

  socket.on('join', (o = {}, cb) => {
    const code = String(o.code || '').trim().toUpperCase();
    const g = rooms.get(code);
    if (!g) return reply(cb, { ok: false, error: 'Room tidak ditemukan.' });
    if (g.kicked?.has(sid)) return reply(cb, { ok: false, error: 'Kamu telah dikeluarkan dari room ini oleh Host atau Moderator.' });
    if (socket.data.code && socket.data.code !== code) leave();
    const r = g.addPlayer(sid, String(o.name || '').trim() || 'Warga');
    if (!r.ok) return reply(cb, r);
    attach(socket, g);
    reply(cb, { ok: true, code });
  });

  function leave() {
    const g = game();
    if (!g) return;
    g.removePlayer(sid);
    socket.data.code = null;
    sessions.delete(sid);
    socket.join('lobby');
    socket.emit('left');
    cleanup(g);
  }
  socket.on('leave', (_p, cb) => { leave(); reply(typeof _p === 'function' ? _p : cb); });

  // aksi game: semua divalidasi oleh engine
  const on = (ev, fn) => socket.on(ev, (payload, cb) => {
    const g = game();
    if (!g) return reply(cb, { ok: false, error: 'Kamu belum masuk room.' });
    try { reply(cb, fn(g, payload || {}) || { ok: true }); } catch (e) { console.error(e); reply(cb, { ok: false, error: 'Kesalahan server' }); }
  });
  on('start', (g) => g.start(sid));
  on('settings', (g, p) => g.setSettings(sid, p));
  on('moderator', (g, p) => g.setModerator(sid, !!p.on));
  on('addBot', (g) => g.addBot(sid));
  on('kick', (g, p) => {
    const ok = g.kick(sid, p.target);
    if (ok) for (const [, s] of io.of('/').sockets) if (s.data.sid === p.target && s.data.code === g.code) {
      s.data.code = null; sessions.delete(p.target); s.join('lobby'); s.emit('kicked', 'Kamu telah dikeluarkan dari room oleh Host atau Moderator.');
    }
  });
  on('act', (g, p) => g.act(sid, p));
  on('vote', (g, p) => g.vote(sid, p.target));
  on('hunter', (g, p) => g.hunterShoot(sid, p.target));
  on('chat', (g, p) => g.say(sid, p.text));
  on('advance', (g) => g.advance(sid));
  on('pause', (g) => g.pause(sid));
  on('restart', (g) => g.restart(sid));

  socket.on('disconnect', () => {
    const g = game();
    if (!g) return;
    g.setConnected(sid, false);
    // di lobby: hapus pemain yang tidak kembali dalam 45 detik
    setTimeout(() => {
      const still = rooms.get(g.code);
      if (!still) return;
      const p = still.players.get(sid);
      const back = [...io.of('/').sockets.values()].some((s) => s.data.sid === sid && s.data.code === g.code);
      if (p && !back && (still.phase === 'lobby' || still.phase === 'end')) { still.removePlayer(sid); sessions.delete(sid); }
      cleanup(still);
    }, 45000);
  });
});

function cleanup(g) {
  if (g.humanCount === 0) {
    setTimeout(() => {
      if (rooms.get(g.code) === g && g.humanCount === 0) { g.destroy(); rooms.delete(g.code); markDirty(g); }
    }, 120000);
  }
}

// ---------- http ----------
app.get('/api/health', (_q, r) => r.json({ ok: true, rooms: rooms.size, online: io.engine.clientsCount }));
const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|socket\.io).*/, (_q, r) => r.sendFile(path.join(dist, 'index.html')));
} else {
  app.get('/', (_q, r) => r.send('Client belum di-build. Jalankan: npm run build'));
}

server.listen(PORT, () => console.log(`🐺 Werewolf Online jalan di http://localhost:${PORT}`));
