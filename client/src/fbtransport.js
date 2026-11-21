// Transport via Firebase Realtime Database (tanpa server sendiri).
// Browser host tetap menjalankan engine game, tapi semua pesan lewat Firebase,
// jadi pemain dari jaringan apa pun (data seluler, WiFi kantor) bisa join.
import { initializeApp } from 'firebase/app';
import {
  getDatabase, ref, set, get, push, remove, update, onValue, onChildAdded, onChildRemoved,
  onDisconnect, serverTimestamp, query, orderByChild, endAt, limitToFirst,
} from 'firebase/database';
import { Game } from '../../shared/engine.js';

class Emitter {
  constructor() { this.h = {}; }
  on(ev, fn) { (this.h[ev] ||= []).push(fn); return this; }
  fire(ev, ...a) { (this.h[ev] || []).forEach((f) => f(...a)); }
}

function dispatch(g, sid, ev, p = {}) {
  const map = {
    start: () => g.start(sid), settings: () => g.setSettings(sid, p), moderator: () => g.setModerator(sid, !!p.on), addBot: () => g.addBot(sid),
    kick: () => g.kick(sid, p.target), act: () => g.act(sid, p), vote: () => g.vote(sid, p.target), hunter: () => g.hunterShoot(sid, p.target),
    chat: () => g.say(sid, p.text), advance: () => g.advance(sid), pause: () => g.pause(sid), restart: () => g.restart(sid),
  };
  return (map[ev] ? map[ev]() : { ok: false }) || { ok: true };
}
const genCode = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
const SID_RE = /^[a-zA-Z0-9_-]{8,40}$/;

let db;
function database() {
  if (!db) db = getDatabase(initializeApp(window.WW_FIREBASE));
  return db;
}
export const hasFirebase = () => typeof window !== 'undefined' && !!window.WW_FIREBASE?.databaseURL;

export class FirebaseTransport extends Emitter {
  constructor(sid) {
    super();
    this.mode = 'firebase';
    this.sid = sid;
    this.role = null;              // 'host' | 'client'
    this.game = null; this.code = null;
    this.joined = new Set();       // host: sid pemain yang sudah join
    this.online = new Set();       // host: sid yang sedang tersambung
    this.lastView = new Map();     // host: cache view terakhir per sid
    this.pending = new Map(); this.seq = 0;
    this.unsubs = [];
  }
  r(path) { return ref(database(), `ww/rooms/${this.code}${path ? '/' + path : ''}`); }
  listen(unsub) { this.unsubs.push(unsub); }

  // ================= HOST =================
  async createRoom(name, opts) {
    this.destroy();
    this.role = 'host';
    try {
      for (let i = 0; ; i++) {
        this.code = genCode();
        const exists = (await get(this.r('meta'))).exists();
        if (!exists) break;
        if (i > 5) throw new Error('kode penuh');
      }
      await set(this.r('meta'), { host: this.sid, name: String(opts.roomName || '').slice(0, 40), hostOnline: true, t: serverTimestamp(), beat: serverTimestamp() });
      // kalau host menutup tab / internet putus, tandai offline (pemain menunggu sebentar)
      await onDisconnect(this.r('meta/hostOnline')).set(false);
      cleanupOldRooms();
    } catch (e) {
      console.error(e); this.role = null;
      return { ok: false, error: fbError(e) };
    }
    this.hostName = String(name || '').slice(0, 20);
    this.game = new Game({ code: this.code, name: opts.roomName, hostId: this.sid, hostName: name, hostIsMod: !!opts.hostIsMod, isPublic: opts.isPublic !== false, onChange: () => this.schedule() });
    this.lastListing = '';
    // detak jantung: room yang host-nya hilang tanpa sempat dihapus akan disaring & dibersihkan
    this.beat = setInterval(() => { if (this.game) update(this.r('meta'), { beat: serverTimestamp() }).catch(() => {}); }, 60000);

    this.listen(onChildAdded(this.r('cmd'), (snap) => { this.onCmd(snap.val()); remove(snap.ref).catch(() => {}); }));
    this.listen(onChildAdded(this.r('presence'), (snap) => this.onPresence(snap.key, true)));
    this.listen(onChildRemoved(this.r('presence'), (snap) => this.onPresence(snap.key, false)));
    this.watchConnection();
    this.schedule();
    return { ok: true, code: this.code };
  }

  onCmd(msg) {
    if (!msg || typeof msg !== 'object') return;
    const sid = String(msg.sid || '');
    if (!SID_RE.test(sid) || sid === this.sid) return;
    const g = this.game; if (!g) return;
    let r;
    try {
      if (msg.ev === 'join') {
        if (g.kicked?.has(sid)) r = { ok: false, error: 'Kamu telah dikeluarkan dari room ini oleh Host atau Moderator.' };
        else {
          r = g.addPlayer(sid, String(msg.p?.name || '').trim().slice(0, 20) || 'Warga');
          if (r.ok) { this.joined.add(sid); this.lastView.delete(sid); g.setConnected(sid, true); }
        }
      } else if (msg.ev === 'leave') {
        g.removePlayer(sid); this.dropPlayer(sid); r = { ok: true };
      } else if (!this.joined.has(sid)) r = { ok: false, error: 'Belum bergabung.' };
      else {
        r = dispatch(g, sid, msg.ev, msg.p || {});
        if (msg.ev === 'kick' && r.ok !== false) this.kickOut(msg.p?.target);
      }
    } catch (e) { console.error(e); r = { ok: false, error: 'Kesalahan di host.' }; }
    if (msg.id != null) set(this.r(`reply/${sid}/${msg.id}`), JSON.stringify(r ?? { ok: true })).catch(() => {});
    this.schedule();
  }

  onPresence(sid, on) {
    if (!SID_RE.test(sid) || sid === this.sid) return;
    const g = this.game; if (!g) return;
    if (on) { this.online.add(sid); if (this.joined.has(sid)) { g.setConnected(sid, true); this.lastView.delete(sid); this.schedule(); } return; }
    this.online.delete(sid);
    if (!this.joined.has(sid)) return;
    g.setConnected(sid, false);
    setTimeout(() => {
      if (this.game !== g || this.online.has(sid)) return;
      if (g.phase === 'lobby' || g.phase === 'end') { g.removePlayer(sid); this.dropPlayer(sid); }
    }, 30000);
  }

  dropPlayer(sid) {
    this.joined.delete(sid); this.lastView.delete(sid);
    remove(this.r(`view/${sid}`)).catch(() => {});
  }
  kickOut(target) {
    if (!target || !this.joined.has(target)) return;
    set(this.r(`kick/${target}`), 'Kamu telah dikeluarkan dari room oleh Host atau Moderator.').catch(() => {});
    this.dropPlayer(target);
  }

  schedule() {
    if (this._sched) return;
    this._sched = true;
    setTimeout(() => {
      this._sched = false;
      const g = this.game; if (!g) return;
      this.fire('state', g.view(this.sid));
      const patch = {};
      for (const sid of this.joined) {
        const v = JSON.stringify(g.view(sid));
        if (this.lastView.get(sid) !== v) { this.lastView.set(sid, v); patch[`view/${sid}`] = v; }
      }
      if (Object.keys(patch).length) update(this.r(), patch).catch((e) => console.warn('[fb] gagal kirim state', e));
      this.publishListing();
    }, 30);
  }

  /** Tulis ringkasan room ke meta room supaya tampil di halaman awal semua pemain */
  publishListing(force) {
    const g = this.game; if (!g || this.role !== 'host') return;
    const sm = g.summary();
    const humans = [...g.players.values()].filter((p) => !p.isBot && p.id !== g.modId).length;
    // jumlah di daftar room = semua orang di room, termasuk host yang jadi Moderator
    const item = { name: sm.name, hostName: this.hostName, players: g.players.size, humans, phase: sm.phase, phaseName: sm.phaseName, day: sm.day || 0, hasMod: sm.hasMod, pub: !!sm.isPublic };
    const key = JSON.stringify(item);
    if (!force && key === this.lastListing) return;
    this.lastListing = key;
    update(this.r('meta'), { ...item, beat: serverTimestamp() }).catch((e) => console.warn('[fb] gagal update daftar room', e));
  }

  watchConnection() {
    const cref = ref(database(), '.info/connected');
    let wasOn = false;
    this.listen(onValue(cref, (s) => {
      const on = !!s.val();
      if (on) {
        this.fire('status', 'online');
        if (wasOn === false && this.role) this.onReconnect();
      } else if (this.role) this.fire('status', 'reconnecting');
      wasOn = on;
    }));
  }
  async onReconnect() {
    try {
      if (this.role === 'host') {
        await update(this.r('meta'), { hostOnline: true });
        await onDisconnect(this.r('meta/hostOnline')).set(false);
        this.lastView.clear(); this.publishListing(true); this.schedule();
      } else if (this.role === 'client') {
        await set(this.r(`presence/${this.sid}`), true);
        await onDisconnect(this.r(`presence/${this.sid}`)).remove();
      }
    } catch { /* */ }
  }

  // ================= KLIEN =================
  async joinRoom(code, name) {
    this.destroy();
    this.role = 'client';
    this.code = code;
    try {
      const meta = (await get(this.r('meta'))).val();
      if (!meta) { this.role = null; return { ok: false, error: 'Room tidak ditemukan. Pastikan kode benar dan host masih membuka game.' }; }
      await remove(this.r(`reply/${this.sid}`));
      await remove(this.r(`kick/${this.sid}`));
      await set(this.r(`presence/${this.sid}`), true);
      await onDisconnect(this.r(`presence/${this.sid}`)).remove();
    } catch (e) { console.error(e); this.role = null; return { ok: false, error: fbError(e) }; }

    this.listen(onChildAdded(this.r(`reply/${this.sid}`), (snap) => {
      const p = this.pending.get(snap.key);
      if (p) { this.pending.delete(snap.key); let r; try { r = JSON.parse(snap.val()); } catch { r = { ok: true }; } p(r); }
      remove(snap.ref).catch(() => {});
    }));
    this.listen(onValue(this.r(`view/${this.sid}`), (snap) => {
      const v = snap.val(); if (!v) return;
      try { this.fire('state', JSON.parse(v)); } catch { /* */ }
    }));
    this.listen(onValue(this.r(`kick/${this.sid}`), (snap) => {
      if (!snap.val() || this.role !== 'client') return;
      const m = snap.val(); remove(snap.ref).catch(() => {});
      this.destroy(); this.fire('kicked', m);
    }));
    let seen = false, lostTimer = null;
    const lost = (m) => { if (this.role === 'client') { this.destroy(); this.fire('kicked', m); } };
    this.listen(onValue(this.r('meta'), (snap) => {
      const meta = snap.val();
      if (!meta) { if (seen) lost('Host menutup room.'); return; }
      seen = true;
      if (meta.hostOnline === false) {
        this.fire('status', 'reconnecting');
        if (!lostTimer) lostTimer = setTimeout(() => lost('Koneksi host terputus. Host mungkin menutup game.'), 45000);
      } else if (lostTimer) { clearTimeout(lostTimer); lostTimer = null; this.fire('status', 'online'); }
    }));
    this.listen(() => clearTimeout(lostTimer));
    this.watchConnection();

    const r = await this.call('join', { name });
    if (!r.ok) { this.destroy(); return r; }
    this.fire('status', 'online');
    return { ok: true, code };
  }

  call(ev, p = {}) {
    if (this.role === 'host') {
      if (ev === 'leave') { this.destroy(); this.fire('left'); return Promise.resolve({ ok: true }); }
      if (!this.game) return Promise.resolve({ ok: false, error: 'Belum ada room.' });
      const r = dispatch(this.game, this.sid, ev, p);
      if (ev === 'kick' && r.ok !== false) this.kickOut(p.target);
      return Promise.resolve(r);
    }
    if (this.role !== 'client') return Promise.resolve({ ok: false, error: 'Belum ada room.' });
    if (ev === 'leave') {
      push(this.r('cmd'), { sid: this.sid, ev: 'leave', p: {} }).catch(() => {});
      this.destroy(); this.fire('left');
      return Promise.resolve({ ok: true });
    }
    return new Promise((res) => {
      const id = String(++this.seq) + '_' + Date.now().toString(36);
      const t = setTimeout(() => { this.pending.delete(id); res({ ok: false, error: 'Host tidak merespons. Pastikan host masih membuka game.' }); }, 12000);
      this.pending.set(id, (r) => { clearTimeout(t); res(r || { ok: true }); });
      push(this.r('cmd'), { sid: this.sid, ev, p: p ?? {}, id }).catch((e) => { clearTimeout(t); this.pending.delete(id); res({ ok: false, error: fbError(e) }); });
    });
  }

  destroy() {
    for (const u of this.unsubs) { try { u(); } catch { /* */ } }
    this.unsubs = [];
    const code = this.code, role = this.role;
    clearInterval(this.beat); this.beat = null;
    if (code && role === 'host') {
      remove(this.r()).catch(() => {}); onDisconnect(this.r()).cancel().catch(() => {});
    }
    if (code && role === 'client') { remove(this.r(`presence/${this.sid}`)).catch(() => {}); onDisconnect(this.r(`presence/${this.sid}`)).cancel().catch(() => {}); }
    this.game?.destroy(); this.game = null;
    this.joined.clear(); this.online.clear(); this.lastView.clear();
    for (const p of this.pending.values()) p({ ok: false, error: 'Dibatalkan.' });
    this.pending.clear();
    this.role = null;
  }
}

const STALE_MS = 3 * 60e3; // tanpa detak > 3 menit = host sudah pergi

/**
 * Pantau daftar room aktif. Membaca daftar kode lewat REST "shallow" (hanya kunci, sangat ringan),
 * lalu meta tiap room. Room yang host-nya keluar / room kosong tidak ditampilkan dan dibersihkan.
 * @returns fungsi untuk berhenti memantau
 */
export function watchRooms(cb) {
  let offset = 0, stopped = false, timer = null, busy = false;
  const offUnsub = onValue(ref(database(), '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });
  const base = String(window.WW_FIREBASE.databaseURL).replace(/\/$/, '');
  const getJSON = async (path, q = '') => { const r = await fetch(`${base}/${path}.json${q}`, { cache: 'no-store' }); if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { code: r.status === 401 ? 'PERMISSION_DENIED' : 'http' }); return r.json(); };
  const poll = async () => {
    if (stopped || busy) return; busy = true;
    try {
      const keys = Object.keys((await getJSON('ww/rooms', '?shallow=true')) || {}).filter((k) => /^[A-Z0-9]{6}$/.test(k));
      const metas = await Promise.all(keys.map((k) => getJSON(`ww/rooms/${k}/meta`).catch(() => null)));
      const now = Date.now() + offset, rooms = [];
      keys.forEach((code, i) => {
        const m = metas[i];
        const last = m ? (m.beat || m.t || 0) : 0;
        // m.beat ada = versi baru (detak tiap menit); tanpa beat cukup andalkan hostOnline + umur 6 jam
        const fresh = m && (m.beat ? now - m.beat < STALE_MS : now - (m.t || 0) < 6 * 3600e3);
        const alive = m && m.hostOnline !== false && fresh;
        if (!alive) { // host sudah pergi: bersihkan room yatim (beri waktu host menyambung ulang)
          if (!m || now - last > STALE_MS) remove(ref(database(), `ww/rooms/${code}`)).catch(() => {});
          return;
        }
        // room tetap tampil walau 0 pemain: host yang jadi Moderator memang tidak dihitung sebagai pemain
        if (m.pub === false) return;
        rooms.push({ code, name: m.name || 'Desa ' + code, host: m.hostName, players: m.players ?? '?', humans: m.humans, phase: m.phase || 'lobby', phaseName: m.phaseName || 'Lobby', day: m.day || 0, hasMod: !!m.hasMod, t: last });
      });
      const rank = (p) => (p === 'lobby' ? 0 : p === 'end' ? 1 : 2);
      rooms.sort((a, b) => rank(a.phase) - rank(b.phase) || b.t - a.t);
      if (!stopped) cb(rooms);
    } catch (e) { console.warn('[fb] daftar room', e); if (!stopped) cb(null, fbError(e)); }
    busy = false;
    if (!stopped) timer = setTimeout(poll, document.hidden ? 15000 : 5000);
  };
  poll();
  return () => { stopped = true; clearTimeout(timer); offUnsub(); };
}

/** Hapus room lama (host-nya sudah lama pergi) supaya database tetap bersih */
async function cleanupOldRooms() {
  try {
    const q = query(ref(database(), 'ww/rooms'), orderByChild('meta/t'), endAt(Date.now() - 6 * 3600e3), limitToFirst(20));
    const snap = await get(q);
    snap.forEach((c) => { remove(c.ref).catch(() => {}); });
  } catch { /* */ }
}

function fbError(e) {
  const m = String(e?.code || e?.message || e);
  if (/permission/i.test(m)) return 'Akses database ditolak. Cek Rules di Firebase Realtime Database.';
  return 'Gagal terhubung ke database. Cek koneksi internet, lalu coba lagi.';
}
