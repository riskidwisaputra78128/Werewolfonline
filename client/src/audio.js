// Audio prosedural via WebAudio (tanpa file suara)
export class Audio {
  constructor() { this.ctx = null; this.muted = false; this.musicOn = localStorage.getItem('ww_music') !== '0'; this.theme = 'kampung'; this.night = 0; }
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.6; this.master.connect(this.ctx.destination);
      // angin: noise + lowpass
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      this.windFilter = this.ctx.createBiquadFilter(); this.windFilter.type = 'lowpass'; this.windFilter.frequency.value = 400;
      this.windGain = this.ctx.createGain(); this.windGain.gain.value = 0.08;
      src.connect(this.windFilter).connect(this.windGain).connect(this.master); src.start();
      // jangkrik malam
      this.cricketGain = this.ctx.createGain(); this.cricketGain.gain.value = 0;
      const osc = this.ctx.createOscillator(); osc.frequency.value = 4400;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 18; const lg = this.ctx.createGain(); lg.gain.value = 0.5;
      const am = this.ctx.createGain(); am.gain.value = 0.5;
      lfo.connect(lg).connect(am.gain); osc.connect(am).connect(this.cricketGain).connect(this.master);
      osc.start(); lfo.start();
      // hujan: noise highpass
      const rs = this.ctx.createBufferSource(); rs.buffer = buf; rs.loop = true; rs.playbackRate.value = 0.7;
      const rf = this.ctx.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 900;
      this.rainGain = this.ctx.createGain(); this.rainGain.gain.value = 0;
      rs.connect(rf).connect(this.rainGain).connect(this.master); rs.start();
      // musik
      this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = this.musicOn ? 0.5 : 0;
      const verb = this.ctx.createDelay(1); verb.delayTime.value = 0.32; const fb = this.ctx.createGain(); fb.gain.value = 0.33; const wet = this.ctx.createGain(); wet.gain.value = 0.35;
      this.musicBus.connect(this.master); this.musicBus.connect(verb); verb.connect(fb).connect(verb); verb.connect(wet).connect(this.master);
      this.step = 0; this.nextT = this.ctx.currentTime + 0.5;
      this.musicTimer = setInterval(() => this.schedule(), 120);
    } catch { this.ctx = null; }
  }
  setAmbience(night, t) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.windFilter.frequency.setTargetAtTime(300 + Math.sin(t * 0.2) * 150 + night * 200, now, 0.5);
    this.windGain.gain.setTargetAtTime(0.06 + night * 0.06, now, 0.5);
    this.cricketGain.gain.setTargetAtTime(night * 0.012 * (Math.sin(t * 0.7) > -0.3 ? 1 : 0), now, 0.3);
  }
  // ---------------- musik prosedural per tema ----------------
  setTheme(name) { this.theme = name; }
  setNight(n) { this.night = n; }
  setWeather(k) {
    this.weather = k; if (!this.ctx) return;
    const v = k === 'badai' ? 0.16 : k === 'hujan' ? 0.09 : 0;
    this.rainGain.gain.setTargetAtTime(v, this.ctx.currentTime, 1.2);
  }
  thunder(dist = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 0.35;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900 / dist, t); f.frequency.exponentialRampToValueAtTime(80, t + 3);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.7 / dist, t + 0.06); g.gain.exponentialRampToValueAtTime(0.001, t + 3.2);
    s.connect(f).connect(g).connect(this.master); s.start(t); s.stop(t + 3.3);
  }
  setMusic(on) { this.musicOn = on; if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.4); }
  note(freq, t, dur, type, vol, attack = 0.01) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.musicBus); o.start(t); o.stop(t + dur + 0.05);
  }
  schedule() {
    if (!this.ctx || !this.musicOn || this.muted || document.hidden) { if (this.ctx) this.nextT = this.ctx.currentTime + 0.2; return; }
    const S = MUSIC[this.theme] || MUSIC.kampung, night = (this.night || 0) > 0.5, beat = 60 / (night ? S.bpm * 0.8 : S.bpm) / 2;
    const scale = night ? S.night : S.day, root = S.root * (night ? 0.75 : 1);
    while (this.nextT < this.ctx.currentTime + 0.4) {
      const i = this.step++, t = this.nextT, bar = Math.floor(i / 8) % 4, pat = S.pattern;
      const deg = pat[i % pat.length] + (S.prog[bar] || 0);
      if (pat[i % pat.length] !== null && Math.random() > S.rest) {
        const f = root * Math.pow(2, (scale[((deg % scale.length) + scale.length) % scale.length] + 12 * Math.floor(deg / scale.length)) / 12);
        this.note(f * 2, t, S.len, S.lead, S.vol);
      }
      if (i % 8 === 0) this.note(root * Math.pow(2, (scale[(S.prog[bar] || 0) % scale.length]) / 12) / 2, t, beat * 7, S.bass, S.vol * 0.9, 0.08);
      if (S.perc && i % 2 === 0 && !night) this.tick(t, i % 4 === 0 ? 0.05 : 0.025);
      this.nextT += beat;
    }
  }
  tick(t, vol) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f).connect(g).connect(this.musicBus); s.start(t, Math.random()); s.stop(t + 0.06);
  }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.6; return this.muted; }

  tone(freq, dur, type = 'sine', vol = 0.2, glide = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur);
  }
  noise(dur, freq = 1200, vol = 0.3) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master); s.start(t); s.stop(t + dur);
  }
  howl() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    const vib = this.ctx.createOscillator(), vg = this.ctx.createGain();
    o.type = 'sawtooth'; vib.frequency.value = 5.5; vg.gain.value = 8;
    vib.connect(vg).connect(o.frequency);
    o.frequency.setValueAtTime(260, t); o.frequency.linearRampToValueAtTime(520, t + 0.8); o.frequency.linearRampToValueAtTime(480, t + 2.2); o.frequency.linearRampToValueAtTime(300, t + 3);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
    g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.25, t + 0.4); g.gain.linearRampToValueAtTime(0.2, t + 2.2); g.gain.exponentialRampToValueAtTime(0.001, t + 3.1);
    o.connect(f).connect(g).connect(this.master); o.start(t); vib.start(t); o.stop(t + 3.2); vib.stop(t + 3.2);
  }
  swing() { this.noise(0.15, 2500, 0.15); }
  hit() { this.noise(0.12, 600, 0.4); this.tone(110, 0.15, 'square', 0.08, 60); }
  hurt() { this.tone(180, 0.25, 'sawtooth', 0.12, 90); }
  pickup() { this.tone(880, 0.12, 'sine', 0.15); setTimeout(() => this.tone(1320, 0.15, 'sine', 0.12), 80); }
  level() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'triangle', 0.15), i * 110)); }
  growl() { this.noise(0.5, 200, 0.35); this.tone(70, 0.5, 'sawtooth', 0.12, 50); }
  shoot() { this.noise(0.08, 3000, 0.2); this.tone(400, 0.1, 'triangle', 0.06, 200); }
}

// skala: semitone dari root. pelog/slendro ala gamelan untuk kampung & pasar
const MUSIC = {
  kampung: { bpm: 84, root: 196, day: [0, 2, 4, 7, 9], night: [0, 1, 5, 7, 8], pattern: [0, 2, 4, 2, 5, 4, 2, null], prog: [0, 2, 3, 1], lead: 'triangle', bass: 'sine', vol: 0.05, len: 0.9, rest: 0.15, perc: false },
  pasar: { bpm: 112, root: 220, day: [0, 2, 4, 7, 9], night: [0, 1, 5, 7, 8], pattern: [0, 4, 2, 4, 5, 4, 7, 4], prog: [0, 3, 1, 4], lead: 'square', bass: 'triangle', vol: 0.028, len: 0.35, rest: 0.1, perc: true },
  modern: { bpm: 92, root: 174.6, day: [0, 2, 4, 7, 11], night: [0, 3, 5, 7, 10], pattern: [0, null, 4, null, 2, 5, null, 4], prog: [0, 3, 4, 2], lead: 'sine', bass: 'sine', vol: 0.06, len: 1.4, rest: 0.25, perc: false },
  kantor: { bpm: 76, root: 164.8, day: [0, 3, 5, 7, 10], night: [0, 1, 3, 7, 8], pattern: [0, 2, null, 4, 3, null, 2, null], prog: [0, 2, 4, 3], lead: 'triangle', bass: 'sine', vol: 0.05, len: 0.7, rest: 0.2, perc: true },
};
