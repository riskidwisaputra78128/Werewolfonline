// Audio prosedural via WebAudio (tanpa file suara)
export class Audio {
  constructor() { this.ctx = null; this.muted = false; }
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
    } catch { this.ctx = null; }
  }
  setAmbience(night, t) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.windFilter.frequency.setTargetAtTime(300 + Math.sin(t * 0.2) * 150 + night * 200, now, 0.5);
    this.windGain.gain.setTargetAtTime(0.06 + night * 0.06, now, 0.5);
    this.cricketGain.gain.setTargetAtTime(night * 0.012 * (Math.sin(t * 0.7) > -0.3 ? 1 : 0), now, 0.3);
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
