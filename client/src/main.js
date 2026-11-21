import { Village } from './village.js';
import { OnlineTransport, OfflineTransport, P2PTransport } from './transport.js';
import { FirebaseTransport, hasFirebase, watchRooms } from './fbtransport.js';
import { ROLES, SPECIALS } from '../../shared/engine.js';
import { Audio } from './audio.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } } };
// 'server' = Node + Socket.IO · 'static' = P2P tanpa server (Netlify/Vercel/Apps Script) · 'offline' = demo vs bot
const MODE = typeof __MODE__ !== 'undefined' ? __MODE__ : 'server';
const GAS = typeof google !== 'undefined' && google.script; // berjalan di Google Apps Script

let sid = LS.get('ww_sid');
if (!sid) { sid = 's' + Math.random().toString(36).slice(2) + Date.now().toString(36); LS.set('ww_sid', sid); }
$('inName').value = LS.get('ww_name') || '';

const audio = new Audio();
addEventListener('pointerdown', () => audio.init(), { once: true });

const village = new Village($('scene'), { onPick: (id) => pickHandler?.(id), low: matchMedia('(max-width:700px)').matches || location.search.includes('low') });
village.controls.autoRotate = true;

let net = null, offline = new OfflineTransport(), T = null;
let V = null, offset = 0, pickHandler = null, lastLogT = 0, lastChatN = 0, unread = 0, lastPhase = '', revealShown = '', endShown = false;
let appUrl = location.origin + location.pathname;
if (GAS) { try { google.script.run.withSuccessHandler((u) => { if (u) appUrl = u; }).getAppUrl(); } catch { /* */ } }

// ================= LOBBY =================
function lobbyMsg(t) { $('lobbyMsg').textContent = t || ''; }
function setStatus(s) {
  const dot = $('dot');
  dot.className = 'dot ' + (s === 'online' ? 'on' : s === 'error' ? 'err' : '');
  if (MODE === 'static') {
    $('statusText').textContent = s === 'reconnecting' ? 'Koneksi terputus, mencoba menyambung ulang…' : (hasFirebase() ? 'Online via Firebase · siap main bareng' : 'Mode tanpa server · pemain tersambung langsung ke browser host');
    return;
  }
  $('statusText').textContent = s === 'online' ? 'Terhubung ke server — siap main online' : s === 'error' ? 'Server tidak terjangkau. Kamu tetap bisa latihan offline.' : 'Terputus, mencoba menyambung ulang…';
}
if (MODE === 'offline') {
  document.querySelectorAll('.online-only').forEach((e) => e.classList.add('hidden'));
  $('statusText').textContent = 'Versi demo offline — main melawan bot.';
} else if (MODE === 'static') {
  net = hasFirebase() ? new FirebaseTransport(sid) : new P2PTransport(sid);
  document.body.classList.add('static');
  document.querySelectorAll('.server-only').forEach((e) => e.classList.add('hidden'));
  if (hasFirebase()) {
    // daftar room otomatis di halaman awal (tanpa perlu masukkan kode)
    document.body.classList.add('fb');
    document.querySelectorAll('.list-only').forEach((e) => e.classList.remove('hidden'));
    startRoomWatch();
  }
  setStatus('online'); $('dot').className = 'dot on';
} else {
  net = new OnlineTransport(sid);
  net.on('rooms', renderRooms);
}
if (net) {
  net.on('status', (s) => { if (!V) setStatus(s); if (s === 'online' && MODE === 'server') refreshRooms(); if (V && s === 'reconnecting') banner('Koneksi terputus, mencoba menyambung ulang…', 'info'); });
  net.on('state', (v) => { if (T === net || (!T && MODE === 'server')) { T = net; onState(v); } });
  net.on('kicked', (m) => backToLobby(m));
  net.on('left', () => { if (T === net) backToLobby(); });
}
offline.on('state', (v) => { if (T === offline) onState(v); });
offline.on('left', () => backToLobby());

let stopRoomWatch = null;
function startRoomWatch() {
  if (stopRoomWatch) return;
  stopRoomWatch = watchRooms((rooms, err) => {
    if (err) { $('roomList').innerHTML = `<div class="empty">Daftar room tidak bisa dimuat: ${esc(err)}</div>`; return; }
    renderRooms(rooms);
  });
}
async function refreshRooms() {
  if (MODE === 'static' && hasFirebase()) { stopRoomWatch?.(); stopRoomWatch = null; startRoomWatch(); return; }
  if (MODE !== 'server' || !net) return; const r = await net.call('rooms'); if (r.ok) renderRooms(r.rooms); }
function renderRooms(rooms) {
  const el = $('roomList');
  el.innerHTML = rooms && rooms.length ? rooms.map((r) => `
    <div class="room ${r.phase === 'lobby' ? '' : 'busy'}"><div class="crest" aria-hidden="true">${r.phase === 'lobby' ? '🏡' : '🔥'}</div><div class="info"><b>${esc(r.name)}</b>${r.hasMod ? ' <span class="tag mod">Mod</span>' : ''}
      <small>${r.host ? 'Host ' + esc(r.host) + ' · ' : ''}${r.players}/16 pemain · ${esc(r.phaseName)}${r.day ? ' H-' + r.day : ''} · <span class="code">${esc(r.code)}</span></small>
      <span class="tag ${r.phase === 'lobby' ? '' : 'play'}">${r.phase === 'lobby' ? 'Lobby' : 'Sedang main'}</span></div>
      <button class="b-green" data-join="${esc(r.code)}" ${r.phase === 'lobby' ? '' : 'disabled'}>Gabung</button></div>`).join('')
    : '<div class="empty">Belum ada room aktif. Buat room baru — room-mu akan langsung muncul di sini untuk semua pemain.</div>';
  el.querySelectorAll('[data-join]').forEach((b) => (b.onclick = () => join(b.dataset.join)));
}
const myName = () => { const n = $('inName').value.trim(); if (n) LS.set('ww_name', n); return n; };
let busy = false;
async function join(code) {
  const name = myName(); if (!name) return lobbyMsg('Isi nama dulu.');
  if (busy) return; busy = true;
  lobbyMsg(MODE === 'static' ? 'Menghubungi host…' : 'Bergabung…'); T = net;
  const r = MODE === 'static' ? await net.joinRoom(code.toUpperCase(), name) : await net.call('join', { code: code.toUpperCase(), name });
  busy = false;
  if (!r.ok) { T = null; return lobbyMsg(r.error); }
  lobbyMsg('');
}
$('btnCreate').onclick = async () => {
  const name = myName(); if (!name) return lobbyMsg('Isi nama dulu.');
  if (busy) return; busy = true;
  T = net; lobbyMsg('Membuat room…');
  const opts = { name, roomName: $('inRoomName').value, hostIsMod: $('ckMod').checked, isPublic: $('ckPublic').checked };
  const r = MODE === 'static' ? await net.createRoom(name, opts) : await net.call('create', opts);
  busy = false;
  if (!r.ok) { T = null; lobbyMsg(r.error); } else lobbyMsg('');
};
$('btnRefresh').onclick = refreshRooms;
$('btnJoinCode').onclick = () => { const c = $('inCode').value.trim(); if (c.length < 6) return lobbyMsg('Masukkan kode room 6 huruf.'); join(c); };
$('inCode').onkeydown = (e) => { if (e.key === 'Enter') $('btnJoinCode').click(); };
$('btnOffline').onclick = () => {
  const name = myName() || 'Kamu';
  T = offline; offline.call('create', { name, bots: 7 });
};
// link undangan: #KODE atau ?room=KODE (Apps Script)
function applyInvite(code) {
  code = String(code || '').toUpperCase();
  if (/^[A-Z0-9]{6}$/.test(code) && MODE !== 'offline') { $('inCode').value = code; lobbyMsg(`Undangan ke room ${code} — isi nama lalu tekan Gabung Kode.`); }
}
applyInvite(location.hash.slice(1) || (location.search.match(/[?&]room=([A-Z0-9]{6})/i) || [])[1]);
if (GAS) { try { google.script.url.getLocation((l) => applyInvite(l.parameter?.room)); } catch { /* */ } }
const inviteUrl = (code) => GAS ? `${appUrl}?room=${code}` : `${appUrl}#${code}`;

function backToLobby(msg) {
  T = null; V = null; lastPhase = ''; revealShown = ''; endShown = false; lastLogT = 0; lastChatN = 0;
  $('hud').classList.add('hidden'); $('lobby').classList.remove('hidden');
  ['guide', 'reveal', 'end'].forEach((m) => $(m).classList.add('hidden'));
  village.sync([]); village.decorate({}); village.controls.autoRotate = true; village.setTimeOfDay(0.72);
  lobbyMsg(msg || '');
  if (!GAS) { try { history.replaceState(null, '', location.pathname + location.search.replace(/[?&]room=[A-Z0-9]+/i, '')); } catch { /* */ } }
  if (MODE === 'static') setStatus('online');
  refreshRooms();
}
// peringatan untuk host P2P saat menutup tab
addEventListener('beforeunload', (e) => { if (MODE === 'static' && net?.role === 'host' && V && V.players.some((p) => !p.isBot && p.id !== V.you)) { e.preventDefault(); e.returnValue = ''; } });

// ================= STATE =================
const TIME = { lobby: 0.72, reveal: 0.8, night: 0.97, dawn: 0.27, day: 0.42, vote: 0.6, verdict: 0.68, end: 0.74 };
const PHASE_ICON = { lobby: '🌲', reveal: '🃏', night: '🌙', dawn: '🌅', day: '☀️', vote: '🗳️', verdict: '⚖️', hunter: '🏹', end: '🏁' };

function onState(v) {
  const first = !V;
  V = v; offset = v.now - Date.now();
  if (first) {
    $('lobby').classList.add('hidden'); $('hud').classList.remove('hidden');
    village.controls.autoRotate = false;
    if (T === net && !GAS) { try { history.replaceState(null, '', location.pathname + location.search + '#' + v.code); } catch { /* */ } }
    if (MODE === 'static' && net.role === 'host') banner('Kamu host room ini — biarkan tab ini tetap terbuka selama permainan.', 'info');
    lastLogT = v.log.at(-1)?.t || 0;
    lastChatN = v.chat.at(-1)?.n || 0;
  }
  if (v.phase !== lastPhase) onPhaseChange(v, lastPhase);
  lastPhase = v.phase;
  village.sync(v.players, { reveal: v.phase === 'end' });
  if (TIME[v.phase] != null) village.setTimeOfDay(v.phase === 'end' && v.winner === 'wolf' ? 0.95 : TIME[v.phase]);
  // banner pengumuman
  const last = v.log.at(-1);
  if (last && last.t > lastLogT) { lastLogT = last.t; banner(last.text, last.kind); if (last.kind === 'death') audio.hit(); }
  // chat baru
  for (const m of v.chat) if (m.n > lastChatN) {
    if (!m.sys && m.channel === 'all') village.bubble(m.id, m.text);
    if ($('chat').classList.contains('hidden') && !m.sys) unread++;
  }
  lastChatN = v.chat.at(-1)?.n || lastChatN;
  render();
}
function onPhaseChange(v, prev) {
  if (v.phase === 'night') { audio.howl(); }
  else if (v.phase === 'reveal' && revealShown !== v.code + v.day) { revealShown = v.code + v.day; showReveal(); }
  else if (v.phase === 'end' && !endShown) { endShown = true; setTimeout(() => { village.howl(); showEnd(); }, 1200); audio.level(); }
  else if (prev) audio.tone(660, 0.25, 'triangle', 0.1);
  if (v.phase !== 'end') endShown = false;
  if (v.phase === 'lobby') $('end').classList.add('hidden');
}
let bannerTimer;
function banner(text, kind) {
  const b = $('banner'); b.textContent = text; b.className = kind || ''; b.style.opacity = 1;
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => (b.style.opacity = 0), kind === 'win' ? 9000 : 5000);
}

// ================= RENDER =================
const P = (id) => V.players.find((p) => p.id === id);
const me = () => P(V.you);
const roleOf = (r) => ROLES[r] || { name: '—', icon: '🎭' };

function render() {
  if (!V) return;
  const v = V, mine = v.me;
  // chip
  $('chipPhase').textContent = `${PHASE_ICON[v.phase] || '•'} ${v.name} · ${v.phaseName}${v.day && v.phase !== 'lobby' ? ' H-' + v.day : ''}`;
  const myRole = v.isMod ? 'moderator' : mine?.role;
  $('chipRole').textContent = myRole ? `${roleOf(myRole).icon} ${roleOf(myRole).name}${mine && !mine.alive && !v.isMod ? ' (mati)' : ''}` : '🎭 Belum ada peran';
  $('chipCode').textContent = T === offline ? '🤖 Offline' : `🔗 Room: ${v.code}`;
  $('unread').textContent = unread; $('unread').classList.toggle('hidden', !unread);
  renderDock(); renderWarga(); renderChat(); decorate();
}

function decorate() {
  const v = V, d = {}, mine = v.me;
  for (const p of v.players) {
    d[p.id] = { you: p.id === v.you };
    if (p.role && (p.id === v.you || p.role === 'werewolf' || !p.alive || v.isMod || v.phase === 'end')) d[p.id].role = roleOf(p.role).icon;
  }
  if (v.tally) for (const [id, n] of Object.entries(v.tally)) if (d[id]) d[id].badge = `${n} 🗳`;
  if (v.votes?.[v.you] && d[v.votes[v.you]]) d[v.votes[v.you]].ring = '#f5b942';
  if (v.night) {
    if (v.night.target && d[v.night.target]) d[v.night.target].ring = '#ef4444';
    if (v.night.choice && d[v.night.choice]) d[v.night.choice].ring = '#38bdf8';
    if (v.night.poison && d[v.night.poison]) d[v.night.poison].ring = '#a855f7';
  }
  if (mine?.notes) for (const n of mine.notes) if (d[n.target]) d[n.target].badge = n.wolf ? '🐺 !' : '✓ warga';
  for (const id of currentTargets) if (d[id]) d[id].selectable = true;
  village.decorate(d);
}

let currentTargets = [];
function targetButtons(list, onPickFn, selected, counts) {
  currentTargets = list.map((p) => p.id);
  pickHandler = (id) => { if (currentTargets.includes(id)) onPickFn(id); };
  return `<div class="targets">${list.map((p) => `<button data-t="${p.id}" class="${selected === p.id ? 'sel' : ''}" style="--c:${p.color}"><i></i>${esc(p.name)}${counts?.[p.id] ? `<span class="n">${counts[p.id]}</span>` : ''}</button>`).join('')}</div>`;
}
function bindTargets(el, fn) { el.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => fn(b.dataset.t))); }

async function send(ev, payload) {
  const r = await T.call(ev, payload);
  if (r && r.ok === false && r.error) banner(r.error, 'info');
  return r;
}

function renderDock() {
  const v = V, mine = v.me, el = $('dock');
  currentTargets = []; pickHandler = null;
  const alive = v.players.filter((p) => p.alive && !p.isMod);
  const others = alive.filter((p) => p.id !== v.you);
  let title = v.phaseName, hint = '', body = '', after = null;
  const amAlive = mine?.alive && !v.isMod;
  const ctrl = v.canControl && v.phase !== 'lobby' && v.phase !== 'end'
    ? `<div class="row"><button class="b-violet" id="dAdv">⏭ Lanjut fase</button><button id="dPause">${v.paused ? '▶ Lanjutkan timer' : '⏸ Jeda timer'}</button><button class="b-red" id="dRestart">↺ Ulang game</button></div>` : '';

  switch (v.phase) {
    case 'lobby': {
      const n = v.players.filter((p) => !p.isMod).length;
      title = `Lobby · ${n}/16 pemain`;
      hint = v.canControl ? `Rencana peran: ${v.planned}. Atur di panel Warga, tambahkan bot jika kurang (min. 4).` : 'Menunggu Host memulai permainan…';
      if (v.canControl) body = `<div class="row"><button id="dBot">🤖 Tambah bot</button><button class="b-green grow" id="dStart">▶ Mulai Game</button>${T === net ? '<button id="dInvite">🔗 Salin undangan</button>' : ''}</div>`;
      else if (T === net) body = `<div class="row"><button id="dInvite">🔗 Salin link undangan</button></div>`;
      break;
    }
    case 'reveal': hint = 'Peran sudah dibagikan. Malam pertama segera tiba.'; body = '<button id="dShowRole" class="b-cyan">🃏 Lihat kartu peranku</button>'; break;
    case 'night': {
      if (v.isMod) {
        const mn = v.modNight || {};
        hint = 'Pantau aksi malam. Fase berakhir otomatis saat semua selesai.';
        const nm = (id) => (id ? esc(P(id)?.name) : '—');
        body = `<div class="notes">
          <div>🐺 Target serigala: <b>${nm(mn.wolfTarget)}</b></div>
          <div>🩺 Dilindungi Doctor: ${nm(mn.protect)} · 🛡️ Dikawal Guardian: ${nm(mn.guard)}</div>
          <div>🔮 Terawang Seer: ${Object.values(mn.see || {}).map(nm).join(', ') || '—'} · 🧪 Heal: ${mn.heal ? 'ya' : 'tidak'} · Racun: ${nm(mn.poison)}</div>
          <div>Sudah beraksi: ${(mn.done || []).length}/${(mn.actors || []).length}</div></div>`;
        break;
      }
      if (!amAlive) { hint = mine && !mine.alive ? '👻 Kamu sudah mati. Chat dengan sesama arwah.' : 'Kamu menonton.'; break; }
      const r = mine.role, n = v.night || {};
      if (r === 'werewolf') {
        title = '🐺 Pilih mangsa';
        hint = 'Diskusikan di chat serigala. Suara terbanyak menentukan korban.';
        const counts = {}; Object.values(n.wolfVotes || {}).forEach((t) => (counts[t] = (counts[t] || 0) + 1));
        const pool = others.filter((p) => p.role !== 'werewolf');
        body = targetButtons(pool, (id) => send('act', { target: id }), n.wolfVotes?.[v.you], counts);
        after = (e) => bindTargets(e, (id) => send('act', { target: id }));
      } else if (r === 'seer') {
        title = '🔮 Terawang satu warga';
        if (n.done) hint = 'Kamu sudah menerawang malam ini.'; else { body = targetButtons(others, (id) => send('act', { target: id }), n.choice); after = (e) => bindTargets(e, (id) => send('act', { target: id })); }
      } else if (r === 'doctor') {
        title = '🩺 Lindungi satu warga';
        hint = n.done ? `Melindungi ${esc(P(n.choice)?.name)}. Kamu bisa mengganti pilihan.` : 'Boleh diri sendiri, tapi tidak orang yang sama dua malam berturut-turut.';
        const pool = alive.filter((p) => p.id !== mine.lastProtect);
        body = targetButtons(pool, (id) => send('act', { target: id }), n.choice); after = (e) => bindTargets(e, (id) => send('act', { target: id }));
      } else if (r === 'guardian') {
        title = '🛡️ Kawal satu warga';
        hint = 'Jika warga ini diserang serigala, kamu yang gugur menggantikannya.';
        body = targetButtons(others, (id) => send('act', { target: id }), n.choice); after = (e) => bindTargets(e, (id) => send('act', { target: id }));
      } else if (r === 'witch') {
        title = '🧪 Ramuan Witcher';
        const victim = n.victim ? P(n.victim) : null;
        hint = victim ? `Serigala mengincar <b>${esc(victim.name)}</b> malam ini.` : 'Menunggu serigala memilih korban…';
        if (n.done) hint += ' Kamu sudah selesai.';
        body = `<div class="row">
          ${mine.potions?.heal ? `<button id="wHeal" class="${n.heal ? 'b-green' : ''}" ${victim ? '' : 'disabled'}>💚 ${n.heal ? 'Akan diselamatkan' : 'Selamatkan korban'}</button>` : '<span class="muted">Penyembuh terpakai</span>'}
          <button id="wDone" class="b-cyan" ${n.done ? 'disabled' : ''}>✔ Selesai</button></div>
          ${mine.potions?.poison ? `<div class="hint">☠ Racun (sekali pakai) — sentuh lagi untuk batal:</div>${targetButtons(others, (id) => send('act', { type: 'poison', target: id }), n.poison)}` : ''}`;
        after = (e) => {
          bindTargets(e, (id) => send('act', { type: 'poison', target: id }));
          e.querySelector('#wHeal')?.addEventListener('click', () => send('act', { type: 'heal' }));
          e.querySelector('#wDone')?.addEventListener('click', () => send('act', { type: 'done' }));
        };
      } else { title = '😴 Kamu tertidur'; hint = 'Peranmu tidak beraksi di malam hari. Tunggu fajar…'; }
      break;
    }
    case 'dawn': case 'verdict': hint = esc(v.log.at(-1)?.text || ''); break;
    case 'day': hint = amAlive ? 'Diskusikan di chat siapa yang mencurigakan. Voting dimulai saat waktu habis.' : 'Kamu menonton diskusi warga.'; break;
    case 'vote': {
      const myVote = v.votes?.[v.you];
      if (amAlive) {
        title = '🗳️ Pilih siapa yang dieksekusi';
        hint = mine.role === 'judge' ? '⚖️ Suaramu bernilai 2.' : `Suara terkumpul: ${Object.keys(v.votes || {}).length}/${alive.length}`;
        body = targetButtons(others, (id) => send('vote', { target: id }), myVote, v.tally) + `<div class="row"><button id="vSkip" class="${myVote === 'skip' ? 'b-violet' : ''}">🙅 Abstain${v.tally?.skip ? ' (' + v.tally.skip + ')' : ''}</button></div>`;
        after = (e) => { bindTargets(e, (id) => send('vote', { target: id })); e.querySelector('#vSkip').onclick = () => send('vote', { target: 'skip' }); };
      } else hint = `Voting berlangsung. Suara: ${Object.keys(v.votes || {}).length}/${alive.length}`;
      break;
    }
    case 'hunter': {
      const h = P(v.hunterId);
      if (v.hunterId === v.you) {
        title = '🏹 Panah terakhirmu'; hint = 'Pilih siapa yang ikut kamu bawa.';
        body = targetButtons(others, (id) => send('hunter', { target: id })) + '<button id="hSkip">Turunkan busur</button>';
        after = (e) => { bindTargets(e, (id) => send('hunter', { target: id })); e.querySelector('#hSkip').onclick = () => send('hunter', { target: null }); };
      } else hint = `${esc(h?.name)} sang Hunter sedang membidik…`;
      break;
    }
    case 'end':
      title = v.winner === 'village' ? '🎉 Warga menang!' : '🐺 Werewolf menang!';
      hint = v.canControl ? 'Tekan Main lagi untuk kembali ke lobby dengan pemain yang sama.' : 'Menunggu Host memulai ronde baru.';
      body = `<div class="row"><button id="dEndShow">📜 Lihat semua peran</button>${v.canControl ? '<button class="b-green grow" id="dAgain">🔁 Main lagi</button>' : ''}</div>`;
      break;
  }
  if (mine?.notes?.length && mine.role === 'seer') body += `<div class="notes">${mine.notes.map((n) => `<div class="${n.wolf ? 'wolf' : ''}">${esc(n.text)}</div>`).join('')}</div>`;
  el.innerHTML = `<div class="title"><b>${title}</b><span class="muted" style="font-size:13px">${v.paused ? '⏸ dijeda' : ''}</span></div>${hint ? `<div class="hint">${hint}</div>` : ''}${body}${ctrl}`;
  after?.(el);
  const on = (id, fn) => { const b = el.querySelector('#' + id); if (b) b.onclick = fn; };
  on('dBot', () => send('addBot'));
  on('dStart', () => send('start'));
  on('dInvite', copyInvite);
  on('dShowRole', showReveal);
  on('dAdv', () => send('advance'));
  on('dPause', () => send('pause'));
  on('dRestart', () => { if (confirmInline('dRestart')) send('restart'); });
  on('dAgain', () => send('restart'));
  on('dEndShow', showEnd);
}
// konfirmasi 2-ketuk tanpa dialog browser
const armed = {};
function confirmInline(id) {
  if (armed[id] && Date.now() - armed[id] < 3000) { armed[id] = 0; return true; }
  armed[id] = Date.now(); banner('Tekan sekali lagi untuk konfirmasi', 'info'); return false;
}

function renderWarga() {
  const v = V, el = $('wargaBody');
  if ($('warga').classList.contains('hidden')) return;
  const focus = document.activeElement?.id;
  let html = '';
  if (v.phase === 'lobby' && v.canControl) {
    const s = v.settings;
    html += `<div class="box accent"><b>⚙ Pengaturan Role (Host)</b>
      <div class="row"><label for="sWolves" style="font-weight:700">Werewolf:</label><select id="sWolves" style="width:auto">${[1, 2, 3, 4, 5].map((n) => `<option ${s.wolves === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="grid2">${SPECIALS.map((r) => `<label class="ck"><input type="checkbox" data-role="${r}" ${s.roles[r] ? 'checked' : ''}/> ${ROLES[r].icon} ${ROLES[r].name}</label>`).join('')}</div>
      <div class="grid3"><div><label for="tN">Malam (dtk)</label><input id="tN" type="number" min="15" max="300" value="${s.timers.night}"/></div><div><label for="tD">Diskusi</label><input id="tD" type="number" min="15" max="300" value="${s.timers.day}"/></div><div><label for="tV">Voting</label><input id="tV" type="number" min="15" max="300" value="${s.timers.vote}"/></div></div>
      <label class="ck"><input type="checkbox" id="sReveal" ${s.revealRoles ? 'checked' : ''}/> Ungkap peran saat pemain mati</label>
      ${MODE === 'server' || (MODE === 'static' && hasFirebase()) ? `<label class="ck"><input type="checkbox" id="sPublic" ${v.isPublic ? 'checked' : ''}/> Room publik (tampil di daftar)</label>` : ''}
      ${v.isHost ? `<label class="ck"><input type="checkbox" id="sMod" ${v.modId === v.you ? 'checked' : ''}/> Saya jadi Moderator (tidak ikut bermain)</label>` : ''}
      <div class="muted" style="font-size:13px">Rencana: ${esc(v.planned)}</div></div>`;
  }
  const myRole = v.isMod ? 'moderator' : v.me?.role;
  if (myRole) html += `<div class="box"><div><span class="muted">Peran kamu:</span> <b>${roleOf(myRole).icon} ${roleOf(myRole).name}</b></div><div class="muted" style="font-size:13.5px">${esc(roleOf(myRole).desc)}</div></div>`;
  const list = [...v.players].sort((a, b) => (b.isMod - a.isMod) || (b.alive - a.alive));
  html += `<b>👥 Daftar Warga (${v.players.filter((p) => !p.isMod).length})</b><div class="plist">${list.map((p) => `
    <div class="pi ${p.alive || p.isMod ? '' : 'dead'}" style="--c:${p.color}">
      <div class="nm">${esc(p.name)} ${p.isHost ? '👑' : ''}${p.id === v.you ? ' (Kamu)' : ''}
        <small>${p.isMod ? '🎙️ Moderator' : p.role ? `${roleOf(p.role).icon} ${roleOf(p.role).name}` : '❔ Peran rahasia'} · ${p.isMod ? 'memandu' : p.alive ? 'hidup' : '☠ mati'}${p.connected ? '' : ' · ⚠ terputus'}${p.isBot ? ' · bot' : ''}</small></div>
      ${v.canControl && p.id !== v.you ? `<button class="b-red" data-kick="${p.id}">Keluarkan</button>` : ''}
    </div>`).join('')}</div>`;
  el.innerHTML = html;
  const set = (o) => send('settings', o);
  el.querySelector('#sWolves')?.addEventListener('change', (e) => set({ wolves: +e.target.value }));
  el.querySelectorAll('[data-role]').forEach((c) => (c.onchange = () => set({ roles: { [c.dataset.role]: c.checked } })));
  for (const [id, k] of [['tN', 'night'], ['tD', 'day'], ['tV', 'vote']]) el.querySelector('#' + id)?.addEventListener('change', (e) => set({ timers: { [k]: +e.target.value } }));
  el.querySelector('#sReveal')?.addEventListener('change', (e) => set({ revealRoles: e.target.checked }));
  el.querySelector('#sPublic')?.addEventListener('change', (e) => set({ isPublic: e.target.checked }));
  el.querySelector('#sMod')?.addEventListener('change', (e) => send('moderator', { on: e.target.checked }));
  el.querySelectorAll('[data-kick]').forEach((b) => (b.onclick = () => { if (confirmInline('k' + b.dataset.kick)) send('kick', { target: b.dataset.kick }); }));
  if (focus && el.querySelector('#' + focus)) el.querySelector('#' + focus).focus();
}

function renderChat() {
  const v = V;
  const modeTxt = { all: 'umum', wolf: '🐺 rahasia serigala', ghost: '👻 arwah' }[v.chatChannel] || '😴 tertidur';
  $('chatMode').textContent = '· ' + modeTxt;
  const inp = $('chatIn');
  inp.disabled = !v.chatChannel;
  inp.placeholder = { all: 'Ketik pesan untuk desa…', wolf: 'Bisik ke sesama serigala…', ghost: 'Bicara dengan sesama arwah…' }[v.chatChannel] || 'Kamu tertidur, tidak bisa bicara malam ini';
  if ($('chat').classList.contains('hidden')) return;
  const log = $('chatLog');
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  log.innerHTML = v.chat.map((m) => m.sys
    ? `<div class="cm sys ${m.channel}">${m.channel === 'wolf' ? '<span class="ch wolf">Serigala</span>' : ''}${esc(m.text)}</div>`
    : `<div class="cm ${m.channel} ${m.mod ? 'mod' : ''}" style="--c:${m.color}">${m.channel === 'wolf' ? '<span class="ch wolf">Serigala</span>' : m.channel === 'ghost' ? '<span class="ch ghost">Arwah</span>' : ''}${m.mod ? '<span class="ch mod">Mod</span>' : ''}<b>${esc(m.name)}:</b> ${esc(m.text)}</div>`).join('');
  if (atBottom) log.scrollTop = log.scrollHeight;
}
$('chatForm').onsubmit = async (e) => {
  e.preventDefault();
  const t = $('chatIn').value.trim(); if (!t) return;
  $('chatIn').value = '';
  await send('chat', { text: t });
};

// ================= MODAL & TOMBOL =================
function roleCard(r, big) {
  const R = ROLES[r];
  return `<div class="rc ${big ? 'big' : ''} ${r === 'werewolf' ? 'wolf' : r === 'moderator' ? 'mod' : ''}" data-flip>
    <div class="in"><div class="f"><div class="ic">${big ? '❔' : R.icon}</div><div class="nm">${big ? 'Kartu Rahasia' : R.name}</div><div class="fx">${big ? '' : R.faction}</div><div class="tap">↻ Sentuh untuk putar</div></div>
    <div class="b"><div class="ic">${R.icon}</div><div class="nm">${R.name}</div><div class="fx">${R.faction}</div><p style="margin-top:10px">${R.desc}</p></div></div></div>`;
}
function bindFlip(root) { root.querySelectorAll('[data-flip]').forEach((c) => (c.onclick = () => c.classList.toggle('flip'))); }
$('guideCards').innerHTML = Object.keys(ROLES).map((r) => roleCard(r)).join('');
bindFlip($('guideCards'));
function showReveal() {
  if (!V) return;
  const r = V.isMod ? 'moderator' : V.me?.role;
  if (!r) return;
  $('revealCard').innerHTML = roleCard(r, true);
  bindFlip($('revealCard'));
  let extra = '';
  if (r === 'werewolf') { const mates = V.players.filter((p) => p.role === 'werewolf' && p.id !== V.you); extra = mates.length ? `Rekan serigalamu: <b>${mates.map((m) => esc(m.name)).join(', ')}</b>` : 'Kamu satu-satunya serigala.'; }
  $('revealCard').insertAdjacentHTML('beforeend', extra ? `<p class="muted">${extra}</p>` : '');
  $('reveal').classList.remove('hidden');
}
function showEnd() {
  if (!V) return;
  $('endTitle').textContent = V.winner === 'village' ? '🎉 Warga Menang!' : '🐺 Werewolf Menang!';
  $('endList').innerHTML = V.players.filter((p) => !p.isMod).map((p) => `<div class="pi ${p.alive ? '' : 'dead'}" style="--c:${p.color}"><div class="nm">${esc(p.name)}<small>${roleOf(p.role).icon} ${roleOf(p.role).name} · ${p.alive ? 'selamat' : '☠ mati'}</small></div></div>`).join('');
  $('btnAgain').classList.toggle('hidden', !V.canControl);
  $('end').classList.remove('hidden');
}
$('btnAgain').onclick = () => { send('restart'); $('end').classList.add('hidden'); };
document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => { $(b.dataset.close).classList.add('hidden'); if (['warga', 'chat'].includes(b.dataset.close)) { $('hud').classList.remove('panel'); ['tWarga', 'tChat'].forEach((x) => $(x).classList.remove('on')); } }));
$('chipRole').onclick = showReveal;
$('chipCode').onclick = copyInvite;
function copyInvite() {
  if (T !== net || !V) return;
  const url = inviteUrl(V.code);
  navigator.clipboard?.writeText(url).then(() => banner('Link undangan disalin: ' + url, 'info'), () => banner('Kode room: ' + V.code, 'info'));
}
function toggle(id, btn) {
  const el = $(id), show = el.classList.contains('hidden');
  ['warga', 'chat'].forEach((x) => $(x).classList.add('hidden'));
  ['tWarga', 'tChat'].forEach((x) => $(x).classList.remove('on'));
  if (show) { el.classList.remove('hidden'); $(btn).classList.add('on'); }
  $('hud').classList.toggle('panel', show);
  if (id === 'chat' && show) { unread = 0; }
  render();
  if (id === 'chat' && show) { const log = $('chatLog'); log.scrollTop = log.scrollHeight; setTimeout(() => $('chatIn').focus(), 50); }
}
$('tWarga').onclick = () => toggle('warga', 'tWarga');
$('tChat').onclick = () => toggle('chat', 'tChat');
$('tCard').onclick = () => $('guide').classList.remove('hidden');
$('tFs').onclick = () => { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); } catch { /* */ } };
$('tLeave').onclick = () => { if (confirmInline('leave')) T?.call('leave').then(() => backToLobby()); };
$('cL').onclick = () => village.rotate(-0.4); $('cR').onclick = () => village.rotate(0.4);
$('cIn').onclick = () => village.zoom(0.85); $('cOut').onclick = () => village.zoom(1.18);
addEventListener('keydown', (e) => { if (e.key === 'Escape') ['guide', 'reveal', 'end'].forEach((m) => $(m).classList.add('hidden')); });

// timer
setInterval(() => {
  const c = $('chipTimer');
  if (!V || (!V.deadline && !V.paused)) return c.classList.add('hidden');
  const left = V.paused ? V.pausedLeft : Math.max(0, V.deadline - (Date.now() + offset));
  const s = Math.ceil(left / 1000);
  c.textContent = `${V.paused ? '⏸' : '⏱'} ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  c.classList.remove('hidden');
}, 250);
