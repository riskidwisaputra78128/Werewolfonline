// Siklus cuaca: cerah · kabut · hujan · badai (petir). Disinkronkan dari engine (view.weather).
import * as THREE from 'three';

const N = 1400;
export class Weather {
  constructor(v) {
    this.v = v; this.kind = 'cerah'; this.rain = 0; this.fog = 0; this.storm = 0; this.flash = 0; this.nextBolt = 4; this.onThunder = null;
    const pos = new Float32Array(N * 6); this.drops = [];
    for (let i = 0; i < N; i++) this.drops.push({ x: (Math.random() - 0.5) * 60, y: Math.random() * 26, z: (Math.random() - 0.5) * 60, s: 0.8 + Math.random() * 0.5 });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc8d4e6, transparent: true, opacity: 0, depthWrite: false }));
    this.lines.frustumCulled = false; this.lines.visible = false; this.lines.renderOrder = 5;
    v.scene.add(this.lines);
  }
  set(kind) { this.kind = ['cerah', 'kabut', 'hujan', 'badai'].includes(kind) ? kind : 'cerah'; }
  /** dipanggil SETELAH applyTime (yang mengatur kabut & cahaya dasar) */
  update(dt, t) {
    const v = this.v, indoor = v.indoor, k = indoor ? 'cerah' : this.kind;
    const wantRain = k === 'hujan' ? 0.75 : k === 'badai' ? 1 : 0;
    const wantFog = k === 'kabut' ? 1 : k === 'hujan' ? 0.35 : k === 'badai' ? 0.5 : 0;
    const e = Math.min(1, dt * 0.8);
    this.rain += (wantRain - this.rain) * e; this.fog += (wantFog - this.fog) * e; this.storm += ((k === 'badai' ? 1 : 0) - this.storm) * e;
    if (!indoor && v.scene.fog) {
      v.scene.fog.density *= 1 + this.fog * 2.6;
      v.scene.fog.color.lerp(new THREE.Color(v.nightFactor > 0.5 ? 0x1a2030 : 0x8c96a0), this.fog * 0.55);
    }
    const dim = 1 - this.rain * 0.45;
    v.sun.intensity *= dim; v.hemi.intensity *= 1 - this.rain * 0.2;
    // petir
    if (this.storm > 0.6) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) { this.flash = 1; this.nextBolt = 5 + Math.random() * 9; const d = 0.4 + Math.random() * 1.4; setTimeout(() => this.onThunder?.(d), d * 1000); }
    }
    if (this.flash > 0) {
      const f = this.flash * (Math.random() < 0.3 ? 0.4 : 1);
      v.hemi.intensity += f * 2.5; v.hemi.color.lerp(new THREE.Color(0xdde6ff), f);
      this.flash = Math.max(0, this.flash - dt * 3.2);
    }
    // butiran hujan mengikuti kamera
    const show = this.rain > 0.02;
    this.lines.visible = show;
    if (!show) return;
    this.lines.material.opacity = 0.3 + this.rain * 0.4;
    const c = v.controls.target, pos = this.lines.geometry.attributes.position.array, n = Math.floor(N * (v.quality >= 3 ? 0.3 : v.quality >= 2 ? 0.5 : 1) * this.rain);
    const cam = v.camera.position, len = 0.55, wind = 0.18 + this.storm * 0.25;
    for (let i = 0; i < N; i++) {
      const d = this.drops[i], j = i * 6;
      if (i >= n) { pos[j + 1] = pos[j + 4] = -999; continue; }
      d.y -= dt * 22 * d.s; d.x += dt * wind * 22;
      if (d.y < 0) { d.y = 22 + Math.random() * 4; d.x = (Math.random() - 0.5) * 60; d.z = (Math.random() - 0.5) * 60; }
      const x = c.x + d.x, z = c.z + d.z;
      const dx = x - cam.x, dy = d.y - cam.y, dz = z - cam.z;
      if (dx * dx + dy * dy + dz * dz < 64) { pos[j + 1] = pos[j + 4] = -999; continue; } // jangan ada garis raksasa di depan lensa
      pos[j] = x; pos[j + 1] = d.y; pos[j + 2] = z;
      pos[j + 3] = x - wind * len; pos[j + 4] = d.y + len * 1.6; pos[j + 5] = z;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}
