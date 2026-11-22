// Suara: (1) obrolan mic antar pemain (WebRTC mesh via PeerJS), (2) bot & narator bicara (speechSynthesis),
// (3) ucapan pemain → teks (SpeechRecognition) supaya bot ikut "mendengar".
import { Peer } from 'peerjs';

const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const clean = (t) => String(t || '').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();

async function iceConfig() {
  const url = window.WW_TURN_URL;
  if (!url) return {};
  try { const list = await (await fetch(url)).json(); if (Array.isArray(list) && list.length) return { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, ...list] } }; } catch { /* */ }
  return {};
}

export class Voice {
  constructor({ onSpeaking, onTranscript, onState }) {
    this.onSpeaking = onSpeaking; this.onTranscript = onTranscript; this.onState = onState || (() => {});
    this.state = 'off';          // off | on | muted
    this.peer = null; this.calls = new Map(); this.audio = new Map(); this.local = null;
    this.room = null; this.me = null; this.v = null;
    this.speaking = new Set(); this.levels = new Map();
    this.ttsOn = localStorage.getItem('ww_tts') !== '0';
    this.sttOn = localStorage.getItem('ww_stt') !== '0';
    this.ttsBusy = 0; this.voices = [];
    if ('speechSynthesis' in window) { const load = () => (this.voices = speechSynthesis.getVoices()); load(); speechSynthesis.onvoiceschanged = load; }
    setInterval(() => this.tick(), 120);
    setInterval(() => this.reconnect(), 12000);
  }
  get supported() { return !!navigator.mediaDevices?.getUserMedia; }

  // ================= MIC =================
  /** dipanggil tiap state game berubah */
  update(v, roomKey, online) {
    this.v = v; this.online = online;
    if (roomKey !== this.room) { this.leave(); this.room = roomKey; }
    if (this.state === 'off') return;
    // kirim suara hanya kalau boleh bicara (malam: hanya serigala; tidur = mic mati)
    const can = !!v?.chatChannel && this.state === 'on';
    this.local?.getAudioTracks().forEach((t) => (t.enabled = can));
    if (!can) this.speaking.delete(v?.you);
    this.applyHearing();
    if (online && this.peer) for (const p of this.humans()) if (!this.calls.has(p.id)) this.call(p.id);
    this.stt(can);
  }
  humans() { return (this.v?.players || []).filter((p) => !p.isBot && p.id !== this.v.you && p.connected); }
  pid(sid) { return ('wwv-' + this.room + '-' + sid).replace(/[^A-Za-z0-9_-]/g, ''); }

  async toggle() {
    if (this.state === 'off') return this.join();
    this.state = this.state === 'on' ? 'muted' : 'on';
    this.update(this.v, this.room, this.online); this.onState(this.state);
  }
  async join() {
    this.state = 'on'; this.onState('connecting');
    try {
      this.local = await Promise.race([
        navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000)),
      ]);
    } catch {
      // tanpa izin mic: tetap ikut mendengar dengan aliran sunyi
      const ctx = this.ctx(); const d = ctx.createMediaStreamDestination(); this.local = d.stream; this.state = 'muted';
      this.onState('nomic');
    }
    this.watchLevel('me', this.local);
    if (this.online && this.room) {
      try {
        const opts = await iceConfig();
        this.peer = await new Promise((res, rej) => {
          const p = new Peer(this.pid(this.v.you), { debug: 0, ...opts });
          const t = setTimeout(() => rej(new Error('timeout')), 15000);
          p.once('open', () => { clearTimeout(t); res(p); });
          p.once('error', (e) => { clearTimeout(t); rej(e); });
        });
        this.peer.on('call', (c) => this.incoming(c));
        this.peer.on('error', (e) => { if (e.type !== 'peer-unavailable') console.warn('[voice]', e.type); });
        this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch { /* */ } });
      } catch (e) { console.warn('[voice] gagal', e); this.onState('error'); }
    }
    this.update(this.v, this.room, this.online);
    if (this.state !== 'off') this.onState(this.state);
  }
  sidOf(peerId) { return peerId.slice(('wwv-' + this.room + '-').replace(/[^A-Za-z0-9_-]/g, '').length); }
  call(sid) {
    if (!this.peer || this.peer.disconnected || !this.local) return;
    const c = this.peer.call(this.pid(sid), this.local);
    if (!c) return;
    c._sid = sid; c._mine = true; this.calls.set(sid, c); this.bind(c);
  }
  incoming(c) {
    const sid = this.sidOf(c.peer); c._sid = sid;
    const old = this.calls.get(sid);
    // dua pihak saling menelepon bersamaan → simpan panggilan dari sid yang lebih kecil (aturan sama di kedua sisi)
    if (old && old.open && old._mine && this.v.you < sid) { c.close(); return; }
    if (old && old !== c) { old._replaced = true; old.close(); }
    c.answer(this.local); this.calls.set(sid, c); this.bind(c);
  }
  bind(c) {
    c.on('stream', (s) => {
      let el = this.audio.get(c._sid);
      if (!el) { el = new Audio(); el.autoplay = true; this.audio.set(c._sid, el); }
      el.srcObject = s; el.play().catch(() => {});
      this.watchLevel(c._sid, s); this.applyHearing();
    });
    const gone = () => { if (this.calls.get(c._sid) === c) { this.calls.delete(c._sid); this.dropAudio(c._sid); } };
    c.on('close', gone); c.on('error', gone);
  }
  dropAudio(sid) { const el = this.audio.get(sid); if (el) { el.srcObject = null; this.audio.delete(sid); } this.levels.delete(sid); this.speaking.delete(sid); }
  reconnect() { if (this.state !== 'off' && this.online && this.peer && this.v) for (const p of this.humans()) if (!this.calls.has(p.id)) this.call(p.id); }
  /** siapa boleh mendengar siapa (sesuai aturan chat game) */
  canHear(spk) {
    const v = this.v; if (!v || !spk) return false;
    const me = v.players.find((p) => p.id === v.you);
    if (['lobby', 'reveal', 'end'].includes(v.phase) || spk.isMod || v.isMod) return true;
    if (!spk.alive) return !me || !me.alive;
    if (v.phase === 'night') return me?.alive && v.me?.role === 'werewolf' && spk.role === 'werewolf';
    return true;
  }
  applyHearing() {
    for (const [sid, el] of this.audio) { const p = this.v?.players.find((x) => x.id === sid); el.muted = !this.canHear(p); }
  }
  leave() {
    for (const c of this.calls.values()) try { c.close(); } catch { /* */ }
    this.calls.clear(); for (const sid of [...this.audio.keys()]) this.dropAudio(sid);
    this.peer?.destroy(); this.peer = null;
    this.local?.getTracks().forEach((t) => t.stop()); this.local = null;
    this.stt(false); this.speaking.clear();
    if (this.state !== 'off') { this.state = 'off'; this.onState('off'); }
  }

  // ---- indikator bicara ----
  ctx() { return (this._ctx = this._ctx || new (window.AudioContext || window.webkitAudioContext)()); }
  watchLevel(id, stream) {
    try {
      const ctx = this.ctx(); if (ctx.state === 'suspended') ctx.resume();
      const src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser(); an.fftSize = 512; src.connect(an);
      this.levels.set(id, { an, buf: new Uint8Array(an.fftSize), hold: 0 });
    } catch { /* */ }
  }
  tick() {
    let changed = false;
    for (const [id, l] of this.levels) {
      l.an.getByteTimeDomainData(l.buf);
      let s = 0; for (let i = 0; i < l.buf.length; i += 4) { const x = (l.buf[i] - 128) / 128; s += x * x; }
      const rms = Math.sqrt(s / (l.buf.length / 4)), key = id === 'me' ? this.v?.you : id;
      const p = this.v?.players.find((x) => x.id === key);
      const audible = id === 'me' ? this.state === 'on' && !!this.v?.chatChannel : this.canHear(p);
      if (rms > 0.035 && audible) l.hold = 4; else l.hold = Math.max(0, l.hold - 1);
      const on = l.hold > 0, had = this.speaking.has(key);
      if (on !== had) { on ? this.speaking.add(key) : this.speaking.delete(key); changed = true; }
    }
    if (changed) this.onSpeaking?.(this.speaking);
  }

  // ================= UCAPAN → TEKS =================
  stt(want) {
    want = want && this.sttOn && !!SR && this.ttsBusy === 0;
    if (want && !this.rec) {
      const r = new SR(); r.lang = 'id-ID'; r.continuous = true; r.interimResults = false;
      r.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) { const t = e.results[i][0].transcript.trim(); if (t.length > 1) this.onTranscript?.(t); } };
      r.onend = () => { this.rec = null; if (this.state === 'on') setTimeout(() => this.update(this.v, this.room, this.online), 300); };
      r.onerror = (e) => { if (e.error === 'not-allowed') this.sttOn = false; };
      try { r.start(); this.rec = r; } catch { /* */ }
    } else if (!want && this.rec) { const r = this.rec; this.rec = null; r.onend = null; try { r.abort(); } catch { /* */ } }
  }
  get sttSupported() { return !!SR; }

  // ================= BOT & NARATOR BICARA =================
  voiceFor(gender) {
    const id = this.voices.filter((v) => /^id|ind/i.test(v.lang));
    const pool = id.length ? id : this.voices.filter((v) => /^ms/i.test(v.lang));
    if (!pool.length) return null;
    const f = pool.filter((v) => /female|wanita|gadis|damayanti|zira|ayu/i.test(v.name)), m = pool.filter((v) => /male|pria|ardi|andika/i.test(v.name) && !/female/i.test(v.name));
    return (gender === 'f' ? f[0] : gender === 'm' ? m[0] : null) || pool[0];
  }
  say(text, who = {}) {
    if (!this.ttsOn || !('speechSynthesis' in window)) return;
    const t = clean(text).slice(0, 180); if (!t) return;
    if ((this.queued || 0) > 3) return; // jangan menumpuk
    this.queued = (this.queued || 0) + 1;
    const u = new SpeechSynthesisUtterance(t), h = hash(who.id || 'narator');
    u.lang = 'id-ID';
    const female = who.narrator ? false : h % 2 === 0;
    u.voice = this.voiceFor(who.narrator ? 'm' : female ? 'f' : 'm');
    u.pitch = who.narrator ? 0.7 : 0.75 + (h % 60) / 100;      // tiap bot nada berbeda
    u.rate = who.narrator ? 0.95 : 1 + ((h >> 8) % 25) / 100;
    u.volume = who.narrator ? 0.9 : 1;
    u.onstart = () => { this.ttsBusy++; this.stt(false); if (who.id) { this.speaking.add(who.id); this.onSpeaking?.(this.speaking); } };
    let done = false;
    const end = () => { if (done) return; done = true; this.queued = Math.max(0, this.queued - 1); this.ttsBusy = Math.max(0, this.ttsBusy - 1); if (who.id) { this.speaking.delete(who.id); this.onSpeaking?.(this.speaking); } if (!this.ttsBusy && this.v) this.update(this.v, this.room, this.online); };
    u.onend = end; u.onerror = end;
    speechSynthesis.speak(u);
  }
  setTts(on) { this.ttsOn = on; localStorage.setItem('ww_tts', on ? '1' : '0'); if (!on) this.stopTalk(); }
  setStt(on) { this.sttOn = on; localStorage.setItem('ww_stt', on ? '1' : '0'); if (this.v) this.update(this.v, this.room, this.online); }
  stopTalk() { try { speechSynthesis.cancel(); } catch { /* */ } this.ttsBusy = 0; this.queued = 0; }
}
