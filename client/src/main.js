import { Village, EMO_ICON, EMO_LABEL } from './village.js';
import { auth } from './auth.js';
import { Voice } from './voice.js';
import { VARIANTS } from './outfits.js';
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

// ID pemain per TAB (sessionStorage): tab berbeda = pemain berbeda, refresh di tab yang sama = pemain yang sama.
// (Dulu localStorage → semua tab satu browser dianggap pemain yang sama, nama & peran jadi tertukar.)
const SS = { get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* */ } } };
let sid = SS.get('ww_sid');
if (!sid) { sid = 's' + Math.random().toString(36).slice(2) + Date.now().toString(36); SS.set('ww_sid', sid); }
$('inName').value = LS.get('ww_name') || '';
const THEME_NAME = { kampung: '🌾 Kampung', pasar: '🏮 Pasar Desa', modern: '🏙️ Desa Modern', kantor: '🏢 Kantor TBR' };

const audio = new Audio();
addEventListener('pointerdown', () => audio.init(), { once: true });

auth.load();
const village = new Village($('scene'), { onPick: (id) => pickHandler?.(id), low: matchMedia('(max-width:700px)').matches || location.search.includes('low') });
village.controls.autoRotate = true;
window.__ww = { village, get game() { return T?.game; }, get voice() { return voice; } };
village.weather.onThunder = (d) => audio.thunder(d);
const voice = new Voice({
  onSpeaking: (s) => { village.speaking = s; },
  onTranscript: (t) => { if (T && V?.chatChannel) T.call('chat', { text: '🎙 ' + t }); },
  onState: (st) => renderMic(st),
});
village.speaking = voice.speaking; // untuk debug di konsol

let net = null, offline = new OfflineTransport(), T = null, stopRoomWatch = null;
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
    <div class="room ${r.phase === 'lobby' || r.phase === 'end' ? '' : 'busy'}"><div class="crest" aria-hidden="true">${r.phase === 'lobby' ? '🏡' : r.phase === 'end' ? '🏁' : '🔥'}</div><div class="info"><b>${esc(r.name)}</b>${r.hasMod ? ' <span class="tag mod">Mod</span>' : ''}
      <small>${r.theme && THEME_NAME[r.theme] ? THEME_NAME[r.theme] + ' · ' : ''}${r.host ? 'Host ' + esc(r.host) + (r.hasMod ? ' (Moderator)' : '') + ' · ' : ''}${r.players}/16 pemain · ${esc(r.phaseName)}${r.day ? ' H-' + r.day : ''} · <span class="code">${esc(r.code)}</span></small>
      <span class="tag ${r.phase === 'lobby' || r.phase === 'end' ? '' : 'play'}">${r.phase === 'lobby' ? 'Lobby' : r.phase === 'end' ? 'Selesai · bisa gabung' : 'Sedang main'}</span></div>
      <button class="b-green" data-join="${esc(r.code)}" ${r.phase === 'lobby' || r.phase === 'end' ? '' : 'disabled'}>Gabung</button></div>`).join('')
    : '<div class="empty">Belum ada room aktif. Buat room baru — room-mu akan langsung muncul di sini untuk semua pemain.</div>';
  el.querySelectorAll('[data-join]').forEach((b) => (b.onclick = () => join(b.dataset.join)));
}
const sendProfile = () => T?.call('profile', auth.profile());
const myName = () => { const n = $('inName').value.trim(); if (n) LS.set('ww_name', n); return n; };
let busy = false;
async function join(code) {
  const name = myName(); if (!name) return lobbyMsg('Isi nama dulu.');
  if (busy) return; busy = true;
  lobbyMsg(MODE === 'static' ? 'Menghubungi host…' : 'Bergabung…'); T = net;
  const r = MODE === 'static' ? await net.joinRoom(code.toUpperCase(), name) : await net.call('join', { code: code.toUpperCase(), name });
  busy = false;
  if (!r.ok) { T = null; return lobbyMsg(r.error); }
  lobbyMsg(''); sendProfile();
}
$('btnCreate').onclick = async () => {
  const name = myName(); if (!name) return lobbyMsg('Isi nama dulu.');
  if (busy) return; busy = true;
  T = net; lobbyMsg('Membuat room…');
  const opts = { name, roomName: $('inRoomName').value, hostIsMod: $('ckMod').checked, isPublic: $('ckPublic').checked };
  const r = MODE === 'static' ? await net.createRoom(name, opts) : await net.call('create', opts);
  busy = false;
  if (!r.ok) { T = null; lobbyMsg(r.error); } else { lobbyMsg(''); send('settings', { theme: $('inTheme').value }); sendProfile(); }
};
$('btnRefresh').onclick = refreshRooms;
$('btnJoinCode').onclick = () => { const c = $('inCode').value.trim(); if (c.length < 6) return lobbyMsg('Masukkan kode room 6 huruf.'); join(c); };
$('inCode').onkeydown = (e) => { if (e.key === 'Enter') $('btnJoinCode').click(); };
$('btnOffline').onclick = () => {
  const name = myName() || 'Kamu';
  T = offline; offline.call('create', { name, bots: 7 }); offline.call('profile', { look: auth.look() ?? -1 });
  setTimeout(() => offline.call('settings', { theme: $('inTheme').value, botLevel: $('inBotLevel').value, botChat: true }), 50);
};
// pratinjau tema di latar lobby
$('inTheme').value = LS.get('ww_theme') || 'kampung';
$('inBotLevel').value = LS.get('ww_botlevel') || 'normal';
$('inBotLevel').onchange = () => LS.set('ww_botlevel', $('inBotLevel').value);
village.setTheme($('inTheme').value);
$('inTheme').onchange = () => { LS.set('ww_theme', $('inTheme').value); village.setTheme($('inTheme').value); };
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
  village.setPodium([]); village.sync([]); village.setTheme($('inTheme').value); village.decorate({}); village.controls.autoRotate = true; village.setTimeOfDay(0.72);
  lobbyMsg(msg || '');
  if (!GAS) { try { history.replaceState(null, '', location.pathname + location.search.replace(/[?&]room=[A-Z0-9]+/i, '')); } catch { /* */ } }
  if (MODE === 'static') setStatus('online');
  voice.leave(); voice.stopTalk();
  refreshRooms(); $('emobar').classList.add('hidden'); audio.setWeather('cerah'); village.weather.set('cerah'); renderAcct(); loadLb();
}
// peringatan untuk host P2P saat menutup tab
addEventListener('beforeunload', (e) => { if (MODE === 'static' && net?.role === 'host' && V && V.players.some((p) => !p.isBot && p.id !== V.you)) { e.preventDefault(); e.returnValue = ''; } });

// ================= STATE =================
const TIME = { lobby: 0.72, reveal: 0.8, night: 0.97, dawn: 0.27, day: 0.42, vote: 0.6, verdict: 0.68, end: 0.74 };
const WEATHER_ICON = { kabut: '🌫', hujan: '🌧', badai: '⛈' };
const PHASE_ICON = { lobby: '🌲', reveal: '🃏', night: '🌙', dawn: '🌅', day: '☀️', vote: '🗳️', verdict: '⚖️', hunter: '🏹', end: '🏁' };

function onState(v) {
  const first = !V;
  V = v; offset = v.now - Date.now();
  if (first) {
    $('lobby').classList.add('hidden'); $('hud').classList.remove('hidden');
    stopRoomWatch?.(); stopRoomWatch = null; // tidak perlu cek daftar room selama bermain
    village.controls.autoRotate = false;
    if (T === net && !GAS) { try { history.replaceState(null, '', location.pathname + location.search + '#' + v.code); } catch { /* */ } }
    if (MODE === 'static' && net.role === 'host') banner('Kamu host room ini — biarkan tab ini tetap terbuka selama permainan.', 'info');
    lastLogT = v.log.at(-1)?.t || 0;
    lastChatN = v.chat.at(-1)?.n || 0;
  }
  if (v.phase !== lastPhase) onPhaseChange(v, lastPhase);
  lastPhase = v.phase;
  village.setTheme(v.settings?.theme || 'kampung');
  village.weather.set(v.weather); audio.setTheme(v.settings?.theme || 'kampung'); audio.setWeather(village.indoor ? 'cerah' : v.weather); audio.setNight(v.phase === 'night' || (v.phase === 'end' && v.winner === 'wolf') ? 1 : 0);
  if (v.phase === 'end') reportResult();
  voice.update(v, T === offline ? 'OFFLINE' : v.code, T !== offline && T === net);
  village.setPodium(v.phase === 'end' && v.podium ? v.podium.filter((r) => r.winner).slice(0, 3).map((r) => r.id) : []);
  village.sync(v.players, { reveal: v.phase === 'end' });
  if (TIME[v.phase] != null) village.setTimeOfDay(v.phase === 'end' && v.winner === 'wolf' ? 0.95 : TIME[v.phase]);
  // pengumuman: semua log baru ditampilkan BERGANTIAN; log kematian tampil bersamaan dengan animasinya
  const fresh = v.log.filter((e) => e.t > lastLogT);
  if (fresh.length) {
    lastLogT = fresh.at(-1).t;
    const deathIds = [];
    if (!first) for (const e of fresh) if (['phase', 'death', 'win'].includes(e.kind)) voice.say(e.text, { narrator: true });
    for (const e of fresh) {
      if (e.kind === 'death' && e.who && village.avatars.has(e.who)) { deathLog.set(e.who, e); deathIds.push(e.who); }
      else queueBanner(e.text, e.kind);
    }
    if (deathIds.length) setTimeout(() => {
      village.orderDeaths(deathIds);
      // korban yang tidak punya animasi (mis. sudah tidak terlihat) tetap diumumkan lewat antrean
      for (const id of deathIds) if (!village.hasPendingDeath(id) && deathLog.has(id)) { queueBanner(deathLog.get(id).text, 'death'); deathLog.delete(id); }
    }, 0);
  }
  // chat baru
  for (const m of v.chat) if (m.n > lastChatN) {
    if (!m.sys && m.channel === 'all') village.bubble(m.id, m.text);
    if (!m.sys && m.id !== v.you && v.players.find((p) => p.id === m.id)?.isBot) voice.say(m.text, { id: m.id });
    if ($('chat').classList.contains('hidden') && !m.sys) unread++;
  }
  lastChatN = v.chat.at(-1)?.n || lastChatN;
  render();
}
function onPhaseChange(v, prev) {
  if (v.phase === 'night') { audio.howl(); }
  else if (v.phase === 'reveal' && revealShown !== v.code + v.day) { revealShown = v.code + v.day; showReveal(); }
  else if (v.phase === 'end' && !endShown) { endShown = true; afterDeaths(() => village.howl(), 600); afterDeaths(() => { if (V?.phase === 'end') showEnd(); }, 3800); audio.level(); }
  else if (prev) audio.tone(660, 0.25, 'triangle', 0.1);
  if (v.phase !== 'end') endShown = false;
  if (v.phase === 'lobby') $('end').classList.add('hidden');
}
let bannerTimer, bannerBusyUntil = 0;
const deathsPlaying = () => village.deathQueue.length > 0 || !!village.cine;
/** jalankan fn setelah antrean animasi kematian kosong (dicek berkala) */
function afterDeaths(fn, extra = 0) { const tick = () => (deathsPlaying() ? setTimeout(tick, 300) : setTimeout(fn, extra)); tick(); }
const bannerQ = [], deathLog = new Map();
function banner(text, kind, ms) {
  const b = $('banner'); b.textContent = text; b.className = kind || ''; b.style.opacity = 1;
  ms = ms || (kind === 'win' ? 9000 : 4200);
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { b.style.opacity = 0; setTimeout(nextBanner, 350); }, ms);
  bannerBusyUntil = Date.now() + ms + 350;
}
function queueBanner(text, kind) {
  if (kind === 'info' && !V) return banner(text, kind); // pesan kecil di luar game langsung tampil
  // pengumuman fase/info yang lebih lama tidak relevan lagi → cukup simpan yang terbaru
  if (kind !== 'death') for (let i = bannerQ.length - 1; i >= 0; i--) if (bannerQ[i].kind !== 'death') bannerQ.splice(i, 1);
  bannerQ.push({ text, kind, at: Date.now() });
  if (Date.now() > bannerBusyUntil) nextBanner();
}
function nextBanner() {
  if (Date.now() < bannerBusyUntil - 400) return;
  let n; while ((n = bannerQ.shift()) && n.kind !== 'death' && n.kind !== 'win' && Date.now() - n.at > 9000) { /* lewati yang basi */ }
  // pengumuman menang ditahan sampai semua animasi kematian selesai
  if (n && n.kind === 'win' && deathsPlaying()) { bannerQ.unshift(n); setTimeout(nextBanner, 400); return; }
  if (n) banner(n.text, n.kind);
}
// saat animasi kematian seseorang dimulai → tampilkan pengumumannya, ditahan selama animasi
village.onDeathStart = (id, dur) => {
  const e = deathLog.get(id); if (!e) return;
  deathLog.delete(id); audio.hit();
  banner(e.text, 'death', Math.max(3500, dur * 1000));
};

// ================= RENDER =================
const P = (id) => V.players.find((p) => p.id === id);
const me = () => P(V.you);
const roleOf = (r) => ROLES[r] || { name: '—', icon: '🎭' };

function render() {
  if (!V) return;
  const v = V, mine = v.me;
  // chip
  $('chipPhase').textContent = `${PHASE_ICON[v.phase] || '•'} ${v.name} · ${v.phaseName}${v.day && v.phase !== 'lobby' ? ' H-' + v.day : ''}${WEATHER_ICON[v.weather] ? ' ' + WEATHER_ICON[v.weather] : ''}`;
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
    if (mine?.role === 'hunter' && v.night.choice && d[v.night.choice]) d[v.night.choice].ring = '#ff2020';
  }
  if (mine?.notes) for (const n of mine.notes) if (d[n.target]) d[n.target].badge = n.wolf ? '🐺 !' : '✓ warga';
  if (v.phase === 'end' && v.podium) v.podium.filter((r) => r.winner).slice(0, 3).forEach((r, i) => { if (d[r.id]) d[r.id].badge = ['🥇', '🥈', '🥉'][i] + ' ' + r.score; });
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
          <div>🩺 Dilindungi Doctor: ${nm(mn.protect)} · 🛡️ Dikawal Guardian: ${nm(mn.guard)} · 🎯 Bidikan Sniper: ${nm(mn.snipe)}</div>
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
      } else if (r === 'hunter') {
        title = '🎯 Bidik dengan sniper';
        hint = n.choice ? `Membidik <b>${esc(P(n.choice)?.name)}</b>. Sentuh lagi untuk batal.` : n.done ? 'Kamu memilih tidak menembak malam ini.' : 'Pilih target, atau tahan tembakan malam ini. Tembakanmu datang dari kegelapan — identitasmu tetap rahasia.';
        body = targetButtons(others, (id) => send('act', { target: id }), n.choice) + `<div class="row"><button id="hSkipN" class="${n.done && !n.choice ? 'b-violet' : ''}">🙅 Tidak menembak</button></div>`;
        after = (e) => { bindTargets(e, (id) => send('act', { target: id })); e.querySelector('#hSkipN').onclick = () => send('act', { type: 'skip' }); };
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
      <div class="row"><label class="ck"><input type="checkbox" id="sBotChat" ${s.botChat !== false ? 'checked' : ''} /> 🤖 Bot ikut ngobrol</label>
        <label for="sBotLevel" style="font-weight:700">Level bot:</label><select id="sBotLevel" style="width:auto">${[['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']].map(([k, n]) => `<option value="${k}" ${(s.botLevel || 'normal') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="row"><label for="sTheme" style="font-weight:700">Tema desa:</label><select id="sTheme" style="width:auto">${Object.entries(THEME_NAME).map(([k, n]) => `<option value="${k}" ${s.theme === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
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
  el.querySelector('#sTheme')?.addEventListener('change', (e) => set({ theme: e.target.value }));
  el.querySelector('#sBotChat')?.addEventListener('change', (e) => set({ botChat: e.target.checked }));
  el.querySelector('#sBotLevel')?.addEventListener('change', (e) => set({ botLevel: e.target.value }));
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
// warna cahaya tiap peran (bingkai tome) & jumlah ujung bintang sigil
const ROLE_GLOW = {
  werewolf: ['255,45,35', 7], seer: ['170,110,255', 6], doctor: ['70,230,140', 4], hunter: ['255,170,60', 3], judge: ['255,215,120', 8],
  guardian: ['90,170,255', 6], witch: ['120,255,120', 5], villager: ['230,200,150', 4], moderator: ['190,140,255', 8],
};
const glowVars = (r) => { const c = (ROLE_GLOW[r] || ROLE_GLOW.villager)[0]; return `--g:rgba(${c},.5);--g2:rgba(${c},.28)`; };
/** Sigil SVG prosedural: cincin rune + bintang n-ujung, warna sesuai peran */
function sigil(r, cls = 'sig', unknown) {
  const [c, n] = unknown ? ['255,59,48', 6] : (ROLE_GLOW[r] || ROLE_GLOW.villager);
  const col = `rgb(${c})`, pts = [];
  const step = n % 2 ? 2 : (n === 4 ? 1 : n === 6 ? 2 : 3);
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + ((i * step) % n) / n * Math.PI * 2; pts.push(`${(100 + Math.cos(a) * 62).toFixed(1)},${(100 + Math.sin(a) * 62).toFixed(1)}`); }
  let ticks = '';
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, r1 = 80, r2 = i % 3 ? 85 : 89; ticks += `M${(100 + Math.cos(a) * r1).toFixed(1)} ${(100 + Math.sin(a) * r1).toFixed(1)}L${(100 + Math.cos(a) * r2).toFixed(1)} ${(100 + Math.sin(a) * r2).toFixed(1)}`; }
  let dots = '';
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; dots += `<circle cx="${(100 + Math.cos(a) * 62).toFixed(1)}" cy="${(100 + Math.sin(a) * 62).toFixed(1)}" r="5"/>`; }
  return `<svg class="${cls}" viewBox="0 0 200 200" aria-hidden="true"><g fill="none" stroke="${col}" stroke-width="1.6" style="filter:drop-shadow(0 0 4px ${col})">
    <circle cx="100" cy="100" r="92" stroke-width="2.4"/><circle cx="100" cy="100" r="76"/><circle cx="100" cy="100" r="62" stroke-opacity=".6"/>
    <path d="${ticks}"/><polyline points="${pts.join(' ')}" stroke-width="2"/>${dots}<circle cx="100" cy="100" r="22" stroke-opacity=".7"/></g></svg>`;
}
function roleCard(r, big) {
  const R = ROLES[r];
  return `<div class="rc ${big ? 'big' : ''}" data-flip data-tilt style="${big ? '--g:rgba(255,59,48,.5);--g2:rgba(255,59,48,.3)' : glowVars(r)}">
    <div class="in"><div class="f" style="${glowVars(r)}${big ? ';--g:rgba(255,59,48,.5)' : ''}">${sigil(r, 'sig', big)}<div class="ic">${big ? '❔' : R.icon}</div><div class="nm">${big ? 'Kartu Rahasia' : R.name}</div><div class="fx">${big ? '' : R.faction}</div><div class="tap">↻ Sentuh untuk membuka</div></div>
    <div class="b"><div class="ic">${R.icon}</div><div class="nm">${R.name}</div><div class="fx">${R.faction}</div><p>${R.desc}</p></div></div></div>`;
}
function bindFlip(root) { root.querySelectorAll('[data-flip]').forEach((c) => (c.onclick = () => c.classList.toggle('flip'))); bindTilt(root); }
/** efek 3D: kartu miring mengikuti kursor/jari */
function bindTilt(root) {
  root.querySelectorAll('[data-tilt]').forEach((el) => {
    if (el._tilt) return; el._tilt = true;
    const inner = el.querySelector('.in') || el;
    const move = (e) => {
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      const base = el.classList.contains('flip') ? 180 : 0;
      inner.style.transition = 'transform .08s';
      inner.style.transform = `rotateY(${base + x * 22}deg) rotateX(${-y * 16}deg)`;
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', () => { inner.style.transition = ''; inner.style.transform = ''; });
    el.addEventListener('click', () => { inner.style.transition = ''; inner.style.transform = ''; });
  });
}
$('guideCards').innerHTML = Object.keys(ROLES).map((r) => roleCard(r)).join('');
bindFlip($('guideCards'));
// rak "Kitab Peran" di lobby + segel rune di judul
$('tomes').innerHTML = Object.keys(ROLES).map((r) => `<div class="tome" data-tilt data-role="${r}" style="${glowVars(r)}" title="${esc(ROLES[r].name)}">${sigil(r, '')}<div class="ic">${ROLES[r].icon}</div><div class="nm">${ROLES[r].name}</div></div>`).join('');
$('tomes').querySelectorAll('.tome').forEach((t) => (t.onclick = () => {
  $('guide').classList.remove('hidden');
  const card = [...$('guideCards').children][Object.keys(ROLES).indexOf(t.dataset.role)];
  card?.classList.add('flip'); card?.scrollIntoView({ block: 'center' });
}));
bindTilt($('tomes'));
$('seal').outerHTML = sigil('werewolf', 'seal').replace('<svg', '<svg id="seal"');
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
  const wolfWin = V.winner === 'wolf';
  $('endTitle').textContent = wolfWin ? 'Serigala Berkuasa' : 'Desa Terselamatkan';
  $('endSub').textContent = wolfWin ? '🐺 Tim Werewolf menang — podium untuk para pemangsa paling berjasa.' : '🎉 Tim Warga menang — podium untuk pahlawan desa paling berjasa.';
  const rows = V.podium || [];
  const winners = rows.filter((r) => r.winner), top = winners.slice(0, 3), rest = rows.filter((r) => !top.includes(r));
  const medal = ['🥇', '🥈', '🥉'];
  $('podium').innerHTML = top.map((r, i) => `<div class="pod r${i + 1}" style="${glowVars(r.role)};--c:${r.color}">
      <div class="medal">${medal[i]}</div>
      <div class="who"><i></i><b>${esc(r.name)}</b></div>
      <div class="rl">${roleOf(r.role).icon} ${roleOf(r.role).name} · ${r.alive ? 'selamat' : '☠ gugur'}</div>
      <div class="score">✦ ${r.score} poin kontribusi</div>
      <ul>${r.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`).join('');
  $('endList').innerHTML = rest.map((r) => `<div class="pi ${r.winner ? '' : 'lose'} ${r.alive ? '' : 'dead'}" style="--c:${r.color}"><div class="nm">${esc(r.name)} <span class="muted" style="font-weight:600">· ${r.score} poin</span>
      <small>${roleOf(r.role).icon} ${roleOf(r.role).name} · ${r.winner ? 'tim menang' : 'tim kalah'}</small>
      <ul style="margin-top:4px">${r.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div></div>`).join('');
  $('btnAgain').classList.toggle('hidden', !V.canControl);
  $('end').classList.remove('hidden', 'mini'); $('btnMin').textContent = '▼ Lihat podium';
  $('replay').classList.add('hidden'); $('btnReplay').classList.toggle('hidden', !(V.timeline && V.timeline.length));
}
$('btnRoles').onclick = () => { $('guide').classList.remove('hidden'); };
$('btnMin').onclick = () => { const c = $('end').classList.toggle('mini'); $('btnMin').textContent = c ? '▲ Kontribusi' : '▼ Lihat podium'; };
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


// ================= AKUN · PROFIL · PERINGKAT =================
const GROUPS = [['Orang Tua', 0, 3, '👴'], ['Nenek', 3, 6, '👵'], ['Laki-laki Muda', 6, 9, '🧑'], ['Gadis Stylish', 9, 13, '💃'], ['Anak-anak', 13, 16, '🧒']];
const lookIcon = (i) => (i == null ? '🎲' : (GROUPS.find((g) => i >= g[1] && i < g[2]) || GROUPS[0])[3]);
const lookName = (i) => (i == null ? 'Acak' : VARIANTS[i]?.name || 'Acak');
function renderLook() { $('lookName').textContent = lookName(auth.look()); }
renderLook();
$('btnLook').onclick = () => {
  const cur = auth.look();
  $('looks').innerHTML = `<button data-l="" class="${cur == null ? 'on' : ''}"><b>🎲</b>Acak<small>dipilihkan otomatis</small></button>` +
    GROUPS.map(([g, a, b, ic]) => `<h4>${ic} ${g}</h4>` + VARIANTS.slice(a, b).map((vr, k) => `<button data-l="${a + k}" class="${cur === a + k ? 'on' : ''}"><b>${ic}</b>${esc(vr.name)}<small>${esc(g)}</small></button>`).join('')).join('');
  $('looks').querySelectorAll('[data-l]').forEach((b) => (b.onclick = async () => {
    const val = b.dataset.l === '' ? null : Number(b.dataset.l);
    $('lookM').classList.add('hidden'); auth.setLook(val).then(() => {}); renderLook(); renderAcct();
    if (T) T.call('profile', T === offline ? { look: val ?? -1 } : auth.profile());
  }));
  $('lookM').classList.remove('hidden');
};

function renderAcct() {
  const el = $('acct');
  if (!auth.enabled) { el.classList.add('hidden'); $('lbShelf').classList.add('hidden'); return; }
  el.classList.remove('hidden'); $('lbShelf').classList.remove('hidden');
  if (auth.user) {
    const t = auth.stats?.titles || [];
    el.innerHTML = `<div class="av">${lookIcon(auth.look())}</div><div class="who"><b>${esc(auth.user.name)}</b><small>@${esc(auth.user.username)}${auth.stats ? ` · ${auth.stats.games} main · ${auth.stats.wins} menang` : ''}</small><div>${t.map((x) => `<span class="t">${esc(x)}</span>`).join('')}</div></div>
      <button id="btnProf">👤 Profil</button><button id="btnOut">Keluar</button>`;
    $('btnProf').onclick = openProfile; $('btnOut').onclick = () => { auth.logout(); renderAcct(); loadLb(); };
    if (!$('inName').value.trim()) $('inName').value = auth.user.name;
  } else {
    el.innerHTML = `<div class="av">🎭</div><div class="who"><b>Main sebagai tamu</b><small>Daftar akun supaya skor, julukan &amp; peringkat tercatat.</small></div>
      <button id="btnIn" class="b-cyan">Masuk</button><button id="btnReg">Daftar</button>`;
    $('btnIn').onclick = () => openAuth(false); $('btnReg').onclick = () => openAuth(true);
  }
}
let regMode = false;
function openAuth(reg) {
  regMode = reg;
  $('tabLogin').classList.toggle('on', !reg); $('tabReg').classList.toggle('on', reg);
  document.querySelectorAll('#authM .reg-only').forEach((e) => e.classList.toggle('hidden', !reg));
  $('auGo').textContent = reg ? 'Daftar & Masuk' : 'Masuk';
  $('auPass').autocomplete = reg ? 'new-password' : 'current-password';
  $('auMsg').textContent = ''; if (reg && !$('auName').value) $('auName').value = $('inName').value.trim();
  $('authM').classList.remove('hidden'); setTimeout(() => $('auUser').focus(), 50);
}
$('tabLogin').onclick = () => openAuth(false); $('tabReg').onclick = () => openAuth(true);
$('authForm').onsubmit = async (e) => {
  e.preventDefault();
  const u = $('auUser').value.trim().toLowerCase(), p = $('auPass').value;
  if (regMode && p !== $('auPass2').value) return ($('auMsg').textContent = 'Ulangi password tidak sama.');
  $('auGo').disabled = true; $('auMsg').textContent = regMode ? 'Mendaftarkan…' : 'Memeriksa…';
  const r = regMode ? await auth.register(u, $('auName').value.trim(), p) : await auth.login(u, p);
  $('auGo').disabled = false;
  if (!r.ok) return ($('auMsg').textContent = r.error);
  $('authM').classList.add('hidden'); $('auPass').value = $('auPass2').value = '';
  $('inName').value = auth.user.name; LS.set('ww_name', auth.user.name);
  renderLook(); await auth.refresh(); renderAcct(); loadLb();
  if (T && T !== offline) sendProfile();
};
const ROLE_LABEL = (r) => { const k = Object.keys(ROLES).find((x) => ROLES[x].name === r); return k ? `${ROLES[k].icon} ${r}` : r; };
async function openProfile() {
  $('profM').classList.remove('hidden'); $('profBody').innerHTML = '<div class="empty">Memuat…</div>';
  const r = await auth.refresh();
  if (!r.ok) { $('profBody').innerHTML = `<div class="empty">${esc(r.error || 'Gagal memuat.')}</div>`; renderAcct(); return; }
  const s = r.stats, rate = s.games ? Math.round((s.wins / s.games) * 100) : 0;
  const fav = Object.entries(s.roles).sort((a, b) => b[1].games - a[1].games)[0];
  $('profBody').innerHTML = `<div class="acct" style="margin-top:10px"><div class="av">${lookIcon(auth.look())}</div><div class="who"><b>${esc(r.user.name)}</b><small>@${esc(r.user.username)} · karakter: ${esc(lookName(auth.look()))}</small><div>${s.titles.map((x) => `<span class="t">${esc(x)}</span>`).join('')}</div></div></div>
    <div class="stats"><div><b>${s.games}</b><small>Main</small></div><div><b>${s.wins}</b><small>Menang</small></div><div><b>${rate}%</b><small>Rasio menang</small></div><div><b>${s.points}</b><small>Total poin</small></div><div><b>${s.alive}</b><small>Selamat</small></div></div>
    <h3 class="cinzel" style="margin:6px 0">Peran ${fav ? `· favorit: ${esc(ROLE_LABEL(fav[0]))}` : ''}</h3>
    <div class="prof-roles">${Object.entries(s.roles).sort((a, b) => b[1].games - a[1].games).map(([k, x]) => `<div><span>${esc(ROLE_LABEL(k))}</span><span class="muted">${x.games}× main · ${x.wins} menang</span></div>`).join('') || '<div class="muted">Belum ada permainan tercatat.</div>'}</div>
    <h3 class="cinzel" style="margin:12px 0 6px">10 permainan terakhir</h3>
    <div class="prof-recent">${s.recent.map((g) => `<div><span>${g.won ? '🏆' : '💀'} ${esc(ROLE_LABEL(g.role))}</span><span class="muted">${g.points} poin · ${new Date(g.at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span></div>`).join('') || '<div class="muted">—</div>'}</div>
    <details style="margin-top:12px"><summary class="muted" style="cursor:pointer">🔑 Ganti password</summary><form id="pwForm" class="auth-form"><input id="pwOld" type="password" placeholder="Password lama" autocomplete="current-password" /><input id="pwNew" type="password" placeholder="Password baru (min. 6)" autocomplete="new-password" /><button>Simpan</button><div class="msg" id="pwMsg"></div></form></details>`;
  $('pwForm').onsubmit = async (e) => { e.preventDefault(); $('pwMsg').textContent = 'Menyimpan…'; const x = await auth.changePassword($('pwOld').value, $('pwNew').value); $('pwMsg').textContent = x.ok ? '✔ Password diganti.' : x.error; };
  renderAcct();
}
async function loadLb() {
  if (!auth.enabled) return;
  const r = await auth.leaderboard();
  if (!r.ok) { $('lbList').innerHTML = `<div class="empty">${esc(r.error)}</div>`; return; }
  $('lbSince').textContent = 'sejak Senin ' + new Date(r.since).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  const medal = ['🥇', '🥈', '🥉'];
  $('lbList').innerHTML = r.top.length ? r.top.map((x, i) => `<div class="r ${auth.user && x.id === auth.user.id ? 'me' : ''}"><span class="n">${medal[i] || i + 1}</span><span><b>${esc(x.name)}</b> <small>@${esc(x.username)}</small></span><small>${x.games} main · ${x.wins} menang</small><span class="p">${x.points} poin</span></div>`).join('')
    : '<div class="empty">Belum ada skor minggu ini. Main dengan akun supaya namamu muncul di sini!</div>';
}
$('btnLb').onclick = loadLb;
renderAcct(); loadLb();
if (auth.token) auth.refresh().then(() => { renderAcct(); renderLook(); });

// host melaporkan hasil game ke Google Sheet (hanya pemain yang login; offline tidak dicatat)
const reported = new Set();
function reportResult() {
  if (!auth.enabled || T === offline || !T?.game?.resultReport) return;
  const rep = T.game.resultReport(); if (!rep || reported.has(rep.gameId)) return;
  reported.add(rep.gameId);
  auth.report(rep).then((r) => { if (r.ok && r.saved) { banner(`📊 Skor ${r.saved} pemain berakun tercatat di peringkat mingguan.`, 'info'); } });
}

// ================= EMOTE =================
$('emobar').innerHTML = Object.keys(EMO_ICON).map((k, i) => `<button data-e="${k}" title="${EMO_LABEL[k]} (tombol ${i + 1})"><b>${EMO_ICON[k]}</b>${EMO_LABEL[k]}</button>`).join('');
let emoCool = 0;
function emote(k) { if (!T || !V || Date.now() < emoCool) return; emoCool = Date.now() + 1300; T.call('emote', { k }); }
$('emobar').querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => { emote(b.dataset.e); $('emobar').classList.add('hidden'); $('tEmote').classList.remove('on'); }));
$('tEmote').onclick = () => { const h = $('emobar').classList.toggle('hidden'); $('tEmote').classList.toggle('on', !h); const d = $('dock'); document.documentElement.style.setProperty('--dockH', (d?.offsetHeight || 100) + 'px'); };
addEventListener('keydown', (e) => {
  if (!V || /input|textarea|select/i.test(document.activeElement?.tagName || '')) return;
  const i = Number(e.key) - 1, k = Object.keys(EMO_ICON)[i];
  if (k && !e.ctrlKey && !e.metaKey && !e.altKey) emote(k);
});

// ================= MUSIK =================
const setMusicBtn = () => { $('tSound').classList.toggle('on', audio.musicOn); $('tSound').title = audio.musicOn ? 'Musik: nyala' : 'Musik: mati'; };
setMusicBtn();
$('tSound').onclick = () => { audio.init(); audio.setMusic(!audio.musicOn); LS.set('ww_music', audio.musicOn ? '1' : '0'); setMusicBtn(); };

// ================= REPLAY =================
const PH_NAME = { night: 'Malam', dawn: 'Fajar', day: 'Siang', vote: 'Voting', verdict: 'Vonis', hunter: 'Hunter', end: 'Akhir' };
let rpTimer = null;
function renderReplay(upto = Infinity) {
  const tl = V?.timeline || []; let html = '', lastHead = '';
  tl.slice(0, upto).forEach((e) => {
    const night = e.ph === 'night' || e.ph === 'dawn', head = e.ph === 'end' ? '🏁 Akhir permainan' : `${night ? '🌙 Malam' : '☀️ Hari'} ke-${e.day}`;
    if (head !== lastHead) { html += `<li class="hd">${head}</li>`; lastHead = head; }
    html += `<li class="${night ? 'night' : 'day'} ${e.secret ? 'secret' : ''}"><b>${e.icon}</b><span>${esc(e.text)}${e.secret ? '<small>aksi rahasia — baru terungkap sekarang</small>' : ''}</span></li>`;
  });
  $('tl').innerHTML = html; $('tl').scrollTop = $('tl').scrollHeight;
}
$('btnReplay').onclick = () => { if ($('replay').classList.toggle('hidden')) return; renderReplay(); $('replay').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
$('rpAll').onclick = () => { clearInterval(rpTimer); renderReplay(); };
$('rpPlay').onclick = () => {
  clearInterval(rpTimer); let i = 0; const n = V?.timeline?.length || 0; renderReplay(0);
  rpTimer = setInterval(() => { i++; renderReplay(i); audio.tone(520 + (i % 5) * 80, 0.12, 'triangle', 0.05); if (i >= n) clearInterval(rpTimer); }, 900);
};


// ================= SUARA: MIC · BOT BICARA · UCAPAN→TEKS =================
function renderMic(st) {
  const b = $('tMic'); b.classList.remove('live', 'muted', 'on');
  const map = { off: ['🎙', ' Mic', 'Nyalakan obrolan suara'], connecting: ['⏳', ' Mic', 'Menyambungkan suara…'], on: ['🎙', ' Mic nyala', 'Mic nyala — klik untuk bisu'], muted: ['🔇', ' Bisu', 'Mic bisu (tetap mendengar) — klik untuk bicara'], nomic: ['🔇', ' Dengar saja', 'Izin mic ditolak — hanya mendengar'], error: ['⚠', ' Mic', 'Suara gagal tersambung, coba lagi'] };
  const [ic, lb, title] = map[st] || map.off;
  b.innerHTML = `${ic}<span class="lbl">${lb}</span>`; b.title = title;
  if (st === 'on') b.classList.add('live'); if (st === 'muted' || st === 'nomic') b.classList.add('muted');
  if (st === 'nomic') banner('Izin mikrofon ditolak. Kamu tetap bisa mendengar pemain lain. Izinkan mic lewat ikon 🔒 di address bar.', 'info');
  if (st === 'error') { banner('Obrolan suara gagal tersambung. Cek koneksi lalu tekan 🎙 lagi.', 'info'); voice.leave(); }
}
$('tMic').onclick = () => {
  if (!voice.supported) return banner('Browser ini tidak mendukung mikrofon.', 'info');
  audio.init(); voice.toggle();
  if (voice.state === 'off' && T === offline) banner('Mode latihan: ucapanmu diubah jadi teks supaya bot bisa membalas.', 'info');
};
let lastMicLong = 0;
$('tMic').oncontextmenu = (e) => { e.preventDefault(); if (voice.state !== 'off') { voice.leave(); banner('Keluar dari obrolan suara.', 'info'); } };
const renderTalk = () => { $('tTalk').classList.toggle('on', voice.ttsOn); $('tTalk').title = voice.ttsOn ? 'Bot & narator bicara: nyala' : 'Bot & narator bicara: mati'; };
renderTalk();
$('tTalk').onclick = () => { voice.setTts(!voice.ttsOn); renderTalk(); if (voice.ttsOn) voice.say('Suara bot dinyalakan.', { narrator: true }); };
$('ckStt').checked = voice.sttOn; $('ckStt').disabled = !voice.sttSupported;
if (!voice.sttSupported) $('ckStt').parentElement.title = 'Browser ini belum mendukung ucapan→teks (pakai Chrome/Edge)';
$('ckStt').onchange = () => voice.setStt($('ckStt').checked);
