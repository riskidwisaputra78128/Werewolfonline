// Transport: Online (Socket.IO server), P2P (PeerJS, tanpa server), Offline (bot) — API sama
import { io } from 'socket.io-client';
import { Peer } from 'peerjs';
import { Game } from '../../shared/engine.js';

class Emitter {
  constructor() { this.h = {}; }
  on(ev, fn) { (this.h[ev] ||= []).push(fn); return this; }
  fire(ev, ...a) { (this.h[ev] || []).forEach((f) => f(...a)); }
}

/** Menjalankan perintah pemain ke engine lokal */
function dispatch(g, sid, ev, p = {}) {
  const map = {
    start: () => g.start(sid), settings: () => g.setSettings(sid, p), moderator: () => g.setModerator(sid, !!p.on), addBot: () => g.addBot(sid),
    kick: () => g.kick(sid, p.target), act: () => g.act(sid, p), vote: () => g.vote(sid, p.target), hunter: () => g.hunterShoot(sid, p.target),
    chat: () => g.say(sid, p.text), advance: () => g.advance(sid), pause: () => g.pause(sid), restart: () => g.restart(sid),
  };
  return (map[ev] ? map[ev]() : { ok: false }) || { ok: true };
}

const genCode = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

// ======================= ONLINE (server Node) =======================
export class OnlineTransport extends Emitter {
  constructor(sid, url) {
    super();
    this.mode = 'online';
    this.socket = io(url || undefined, { auth: { sid }, transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 });
    for (const ev of ['state', 'rooms', 'kicked', 'left', 'fatal']) this.socket.on(ev, (d) => this.fire(ev, d));
    this.socket.on('connect', () => this.fire('status', 'online'));
    this.socket.on('disconnect', () => this.fire('status', 'offline'));
    this.socket.on('connect_error', () => this.fire('status', 'error'));
  }
  call(ev, payload) {
    return new Promise((res) => {
      if (!this.socket.connected) return res({ ok: false, error: 'Tidak terhubung ke server.' });
      const t = setTimeout(() => res({ ok: false, error: 'Server tidak merespons.' }), 8000);
      this.socket.emit(ev, payload ?? {}, (r) => { clearTimeout(t); res(r || { ok: true }); });
    });
  }
}

// ======================= P2P (PeerJS / WebRTC) =======================
const PEER_PREFIX = 'wwdesa3d-';
let iceCache;
/** Ambil server TURN dari window.WW_TURN_URL (Metered Open Relay) bila diisi */
async function iceServers() {
  if (iceCache !== undefined) return iceCache;
  const url = typeof window !== 'undefined' && window.WW_TURN_URL;
  iceCache = null;
  if (url) {
    try {
      const r = await fetch(url);
      const list = await r.json();
      if (Array.isArray(list) && list.length) iceCache = [{ urls: 'stun:stun.l.google.com:19302' }, ...list];
    } catch (e) { console.warn('[TURN] gagal ambil kredensial, pakai bawaan PeerJS', e); }
  }
  return iceCache;
}
async function peerOptions() {
  const ice = await iceServers();
  const extra = ice ? { config: { iceServers: ice } } : {};
  // ?peer=host:port untuk server PeerJS sendiri (opsional)
  const m = (typeof location !== 'undefined' && location.search.match(/[?&]peer=([^&]+)/)) || null;
  if (!m) return { debug: 1, ...extra };
  const [host, port] = decodeURIComponent(m[1]).split(':');
  return { host, port: +port || 9000, path: '/', secure: location.protocol === 'https:' && host !== 'localhost', debug: 1, ...extra };
}

export class P2PTransport extends Emitter {
  constructor(sid) {
    super();
    this.mode = 'p2p';
    this.sid = sid;
    this.role = null;     // 'host' | 'client'
    this.peer = null; this.conn = null; this.game = null;
    this.conns = new Map(); // sid -> conn (host)
    this.pending = new Map(); this.seq = 0;
  }

  // ---------- host ----------
  async createRoom(name, opts) {
    this.destroy();
    this.role = 'host';
    let code, tries = 0;
    for (;;) {
      code = genCode();
      try { this.peer = await openPeer(PEER_PREFIX + code); break; }
      catch (e) { if (e.type !== 'unavailable-id' || ++tries > 4) { this.role = null; return { ok: false, error: peerError(e) }; } }
    }
    this.code = code;
    this.game = new Game({ code, name: opts.roomName, hostId: this.sid, hostName: name, hostIsMod: !!opts.hostIsMod, isPublic: false, onChange: () => this.schedule() });
    this.peer.on('connection', (c) => this.onConn(c));
    this.peer.on('disconnected', () => { this.fire('status', 'reconnecting'); try { this.peer.reconnect(); } catch { /* */ } });
    this.peer.on('open', () => this.fire('status', 'online'));
    this.peer.on('error', (e) => { if (e.type === 'network' || e.type === 'server-error') this.fire('status', 'reconnecting'); });
    this.schedule();
    return { ok: true, code };
  }
  onConn(c) {
    c.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      const sid = String(msg.sid || c.metadata?.sid || '').slice(0, 40);
      if (!/^[a-zA-Z0-9_-]{8,40}$/.test(sid) || sid === this.sid) return c.close();
      if (msg.t !== 'call') return;
      const g = this.game; let r;
      try {
        if (msg.ev === 'join') {
          if (g.kicked?.has(sid)) r = { ok: false, error: 'Kamu telah dikeluarkan dari room ini oleh Host atau Moderator.' };
          else {
            r = g.addPlayer(sid, String(msg.p?.name || '').trim() || 'Warga');
            if (r.ok) { const old = this.conns.get(sid); if (old && old !== c) { try { old.send({ t: 'kicked', m: 'Kamu membuka game di tab lain.' }); old.close(); } catch { /* */ } } this.conns.set(sid, c); c._sid = sid; g.setConnected(sid, true); }
          }
        } else if (msg.ev === 'leave') { g.removePlayer(sid); this.conns.delete(sid); r = { ok: true }; setTimeout(() => c.close(), 100); }
        else if (c._sid !== sid) r = { ok: false, error: 'Belum bergabung.' };
        else {
          r = dispatch(g, sid, msg.ev, msg.p);
          if (msg.ev === 'kick' && r.ok !== false) this.dropKicked(msg.p?.target);
        }
      } catch (e) { console.error(e); r = { ok: false, error: 'Kesalahan di host.' }; }
      try { c.send({ t: 'reply', id: msg.id, r }); } catch { /* */ }
      this.schedule();
    });
    c.on('close', () => this.onConnClosed(c));
    c.on('error', () => this.onConnClosed(c));
  }
  onConnClosed(c) {
    const sid = c._sid;
    if (!sid || this.conns.get(sid) !== c) return;
    this.conns.delete(sid);
    const g = this.game; if (!g) return;
    g.setConnected(sid, false);
    setTimeout(() => {
      if (this.game !== g || this.conns.has(sid)) return;
      if (g.phase === 'lobby' || g.phase === 'end') g.removePlayer(sid);
    }, 30000);
  }
  dropKicked(target) {
    const c = this.conns.get(target);
    if (c) { try { c.send({ t: 'kicked', m: 'Kamu telah dikeluarkan dari room oleh Host atau Moderator.' }); } catch { /* */ } this.conns.delete(target); setTimeout(() => c.close(), 200); }
  }
  schedule() {
    if (this._sched) return;
    this._sched = true;
    queueMicrotask(() => {
      this._sched = false;
      const g = this.game; if (!g) return;
      this.fire('state', g.view(this.sid));
      for (const [sid, c] of this.conns) { if (c.open) { try { c.send({ t: 'state', v: g.view(sid) }); } catch { /* */ } } }
    });
  }

  // ---------- klien ----------
  async joinRoom(code, name) {
    this.destroy();
    this.role = 'client';
    this.code = code; this.name = name;
    try { this.peer = await openPeer(); } catch (e) { this.role = null; return { ok: false, error: peerError(e) }; }
    const r = await this.connect();
    if (!r.ok) { this.destroy(); return r; }
    this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch { /* */ } });
    return r;
  }
  connect() {
    return new Promise((res) => {
      const c = this.peer.connect(PEER_PREFIX + this.code, { reliable: true, serialization: 'json', metadata: { sid: this.sid } });
      let done = false;
      const fail = (error) => { if (!done) { done = true; res({ ok: false, error }); } };
      const timer = setTimeout(() => fail('Room tidak ditemukan atau host tidak bisa dihubungi. Cek kode room, atau coba jaringan lain.'), 15000);
      this.peer.once('error', (e) => { if (e.type === 'peer-unavailable') { clearTimeout(timer); fail('Room tidak ditemukan. Pastikan kode benar dan host masih membuka game.'); } });
      c.on('open', async () => {
        this.conn = c;
        const r = await this.call('join', { name: this.name });
        clearTimeout(timer);
        if (!done) { done = true; res(r.ok ? { ok: true, code: this.code } : r); }
        if (r.ok) this.fire('status', 'online');
      });
      c.on('data', (msg) => {
        if (msg?.t === 'state') this.fire('state', msg.v);
        else if (msg?.t === 'reply') { const p = this.pending.get(msg.id); if (p) { this.pending.delete(msg.id); p(msg.r); } }
        else if (msg?.t === 'kicked') { this.kicked = true; this.fire('kicked', msg.m); this.destroy(); }
      });
      c.on('close', () => { if (this.conn === c && !this.kicked && this.role === 'client') this.onLostHost(); });
    });
  }
  async onLostHost() {
    this.conn = null;
    this.fire('status', 'reconnecting');
    // coba sambung ulang beberapa kali (host mungkin refresh / jaringan putus sesaat)
    for (let i = 0; i < 6 && this.role === 'client'; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      if (this.role !== 'client') return;
      const r = await this.connect();
      if (r.ok) return;
    }
    if (this.role === 'client') { this.destroy(); this.fire('kicked', 'Koneksi ke host terputus. Host mungkin menutup game.'); }
  }

  call(ev, p = {}) {
    if (this.role === 'host') {
      if (ev === 'leave') { this.destroy(); this.fire('left'); return Promise.resolve({ ok: true }); }
      if (!this.game) return Promise.resolve({ ok: false, error: 'Belum ada room.' });
      const r = dispatch(this.game, this.sid, ev, p);
      if (ev === 'kick' && r.ok !== false) this.dropKicked(p.target);
      return Promise.resolve(r);
    }
    if (ev === 'leave') { const c = this.conn; this.role = null; if (c?.open) { try { c.send({ t: 'call', id: ++this.seq, ev: 'leave', sid: this.sid }); } catch { /* */ } } setTimeout(() => this.destroy(), 200); this.fire('left'); return Promise.resolve({ ok: true }); }
    return new Promise((res) => {
      if (!this.conn?.open) return res({ ok: false, error: 'Tidak terhubung ke host.' });
      const id = ++this.seq;
      const t = setTimeout(() => { this.pending.delete(id); res({ ok: false, error: 'Host tidak merespons.' }); }, 10000);
      this.pending.set(id, (r) => { clearTimeout(t); res(r || { ok: true }); });
      this.conn.send({ t: 'call', id, ev, p, sid: this.sid });
    });
  }

  destroy() {
    this.game?.destroy(); this.game = null;
    for (const c of this.conns.values()) { try { c.send({ t: 'kicked', m: 'Host menutup room.' }); c.close(); } catch { /* */ } }
    this.conns.clear();
    try { this.conn?.close(); } catch { /* */ }
    this.conn = null;
    try { this.peer?.destroy(); } catch { /* */ }
    this.peer = null;
    if (this.role !== 'client') this.role = null;
  }
}

async function openPeer(id) {
  const opts = await peerOptions();
  return new Promise((res, rej) => {
    const p = id ? new Peer(id, opts) : new Peer(opts);
    const t = setTimeout(() => { p.destroy(); rej({ type: 'timeout' }); }, 15000);
    p.once('open', () => { clearTimeout(t); res(p); });
    p.once('error', (e) => { clearTimeout(t); p.destroy(); rej(e); });
  });
}
function peerError(e) {
  if (e?.type === 'browser-incompatible') return 'Browser ini tidak mendukung WebRTC. Gunakan Chrome/Edge/Firefox terbaru.';
  if (e?.type === 'timeout' || e?.type === 'network' || e?.type === 'server-error' || e?.type === 'socket-error') return 'Tidak bisa terhubung ke layanan PeerJS. Cek koneksi internet, lalu coba lagi.';
  return 'Gagal membuat koneksi (' + (e?.type || 'unknown') + ').';
}

// ======================= OFFLINE (vs bot) =======================
export class OfflineTransport extends Emitter {
  constructor() { super(); this.mode = 'offline'; this.game = null; }
  call(ev, p = {}) {
    const me = 'me_local';
    const ok = (r) => Promise.resolve(r || { ok: true });
    if (ev === 'create') {
      this.game?.destroy();
      this.game = new Game({ code: 'OFFLINE', name: 'Desa Latihan', hostId: me, hostName: p.name, hostIsMod: false, isPublic: false, onChange: (gm) => queueMicrotask(() => this.fire('state', gm.view(me))) });
      for (let i = 0; i < (p.bots ?? 7); i++) this.game.addBot(me);
      return ok({ ok: true, code: 'OFFLINE' });
    }
    if (ev === 'rooms') return ok({ ok: true, rooms: [] });
    if (ev === 'leave') { this.game?.destroy(); this.game = null; this.fire('left'); return ok(); }
    if (!this.game) return ok({ ok: false, error: 'Belum ada game.' });
    return ok(dispatch(this.game, me, ev, p));
  }
}
