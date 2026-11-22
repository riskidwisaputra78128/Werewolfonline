// Efek visual: lingkaran rune, partikel, animasi kematian per penyebab, podium pemenang, color grading
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makePlayerWerewolf } from './characters.js';

/**
 * Bebaskan memori GPU dari objek yang dibuang (geometri & material). Tekstur tidak dibuang karena
 * dipakai bersama (cache). Geometri bertanda userData.shared (milik model GLB sumber) juga dilewati.
 */
export function disposeDeep(obj) {
  if (!obj) return;
  obj.parent?.remove(obj);
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
    if (o.isSkinnedMesh) o.skeleton?.dispose();
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) if (!m.userData?.shared) m.dispose();
  });
}
const canvas = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
function rod(a, b, r, mat) {
  const d = b.clone().sub(a), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 5), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

// ---------------------------------------------------------------- tekstur
const spriteCache = {};
export function glow(rgb = '255,80,60') {
  if (spriteCache[rgb]) return spriteCache[rgb];
  const s = 64, [c, x] = canvas(s), g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(0.3, `rgba(${rgb},.55)`); g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (spriteCache[rgb] = t);
}
function smokeTex() {
  if (spriteCache.smoke) return spriteCache.smoke;
  const s = 128, [c, x] = canvas(s);
  for (let i = 0; i < 22; i++) {
    const r = 14 + Math.random() * 30, px = s / 2 + (Math.random() - 0.5) * 50, py = s / 2 + (Math.random() - 0.5) * 50;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (spriteCache.smoke = t);
}

/** Lingkaran sihir bergaya rune (heksagram, cincin glyph, garis radial) */
export function runeCircleTexture(rgb = '255,70,55', size = 1024, seed = 7) {
  const ck = `rune${rgb}|${size}|${seed}`; if (spriteCache[ck]) return spriteCache[ck];
  const [c, x] = canvas(size), m = size / 2;
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  x.translate(m, m);
  const stroke = (w, a = 1) => { x.lineWidth = w; x.strokeStyle = `rgba(${rgb},${a})`; x.shadowColor = `rgba(${rgb},1)`; x.shadowBlur = w * 6; x.stroke(); };
  const ring = (r, w, a) => { x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); stroke(w, a); };
  ring(m * 0.97, 6, 1); ring(m * 0.92, 2.5, 0.9); ring(m * 0.74, 3, 1); ring(m * 0.70, 1.5, 0.8); ring(m * 0.36, 3, 0.9);
  // cincin glyph
  const n = 28;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2; x.save(); x.rotate(a); x.translate(0, -m * 0.83);
    x.beginPath();
    const k = 2 + Math.floor(rnd() * 3);
    for (let j = 0; j < k; j++) {
      const x0 = (rnd() - 0.5) * 26, y0 = (rnd() - 0.5) * 34, x1 = (rnd() - 0.5) * 26, y1 = (rnd() - 0.5) * 34;
      x.moveTo(x0, y0); x.lineTo(x1, y1);
    }
    stroke(3.2, 0.95); x.restore();
  }
  // garis radial
  for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2, r0 = m * 0.92, r1 = m * (i % 6 ? 0.95 : 0.97); x.beginPath(); x.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); x.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); stroke(2, 0.8); }
  // heksagram
  const star = (rot) => { x.beginPath(); for (let i = 0; i <= 3; i++) { const a = rot + (i / 3) * Math.PI * 2; const px = Math.cos(a) * m * 0.70, py = Math.sin(a) * m * 0.70; i ? x.lineTo(px, py) : x.moveTo(px, py); } stroke(4, 1); };
  star(-Math.PI / 2); star(Math.PI / 2);
  for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i / 6) * Math.PI * 2; x.beginPath(); x.arc(Math.cos(a) * m * 0.70, Math.sin(a) * m * 0.70, m * 0.06, 0, Math.PI * 2); stroke(3, 1); }
  // simbol tengah: mata/bulan sabit
  x.beginPath(); x.arc(0, 0, m * 0.18, 0, Math.PI * 2); stroke(3, 1);
  x.beginPath(); x.arc(m * 0.06, 0, m * 0.15, Math.PI * 0.5, Math.PI * 1.5, true); stroke(3, 1);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; x.beginPath(); x.moveTo(Math.cos(a) * m * 0.38, Math.sin(a) * m * 0.38); x.lineTo(Math.cos(a) * m * 0.66, Math.sin(a) * m * 0.66); stroke(1.4, 0.6); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (spriteCache[ck] = t);
}

function clawTex() {
  if (spriteCache.claw) return spriteCache.claw;
  const s = 256, [c, x] = canvas(s);
  for (let i = 0; i < 3; i++) {
    const ox = 70 + i * 50;
    const g = x.createLinearGradient(ox - 40, 30, ox + 30, 230);
    g.addColorStop(0, 'rgba(255,40,30,0)'); g.addColorStop(0.45, 'rgba(255,230,220,1)'); g.addColorStop(1, 'rgba(255,20,20,0)');
    x.strokeStyle = g; x.lineCap = 'round'; x.shadowColor = '#ff1a1a'; x.shadowBlur = 18;
    x.lineWidth = 11; x.beginPath(); x.moveTo(ox - 40, 30); x.quadraticCurveTo(ox + 20, 110, ox + 10, 230); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (spriteCache.claw = t);
}
function pillarTex(rgb) {
  if (spriteCache['pillar' + rgb]) return spriteCache['pillar' + rgb];
  // garis-garis energi vertikal yang memudar ke atas
  const [c, x] = canvas(128, 256);
  for (let i = 0; i < 128; i++) {
    const a = Math.pow(Math.random(), 2.2) * 0.9;
    const g = x.createLinearGradient(0, 256, 0, 0);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(0.3 + Math.random() * 0.4, `rgba(${rgb},${a * 0.4})`); g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g; x.fillRect(i, 0, 1, 256);
  }
  const b = x.createLinearGradient(0, 256, 0, 180); b.addColorStop(0, `rgba(255,220,200,.6)`); b.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = b; x.fillRect(0, 180, 128, 76);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (spriteCache['pillar' + rgb] = t);
}
function numeralTex(txt) {
  const [c, x] = canvas(256, 128);
  x.fillStyle = '#2a2420'; x.fillRect(0, 0, 256, 128);
  x.font = '700 84px Cinzel, Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = '#ffcf6b'; x.shadowBlur = 16; x.fillStyle = '#ffd98a'; x.fillText(txt, 128, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- sistem partikel
class Burst {
  constructor(scene, o) {
    this.o = o = Object.assign({ n: 40, rgb: '255,80,60', size: 0.3, speed: 2, up: 1, life: 1.2, gravity: -1, spread: 1, drag: 0.6, delay: 0, blending: THREE.AdditiveBlending, swirl: 0, radius: 0.2, map: null, opacity: 1 }, o);
    const pos = new Float32Array(o.n * 3);
    this.p = []; for (let i = 0; i < o.n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * o.radius, h = (Math.random() - 0.3) * o.spread;
      const v = new THREE.Vector3(Math.cos(a) * (0.3 + Math.random()) * o.spread, o.up * (0.4 + Math.random()), Math.sin(a) * (0.3 + Math.random()) * o.spread).multiplyScalar(o.speed);
      this.p.push({ x: Math.cos(a) * r, y: h * 0.2, z: Math.sin(a) * r, v, a });
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.PointsMaterial({ map: o.map || glow(o.rgb), size: o.size, transparent: true, depthWrite: false, blending: o.blending, opacity: 0 });
    if (o.map) this.mat.color.set(`rgb(${o.rgb})`);
    this.pts = new THREE.Points(g, this.mat); this.pts.position.copy(o.at); this.pts.frustumCulled = false;
    scene.add(this.pts); this.scene = scene; this.t = -o.delay;
  }
  update(dt) {
    this.t += dt; const o = this.o; if (this.t < 0) return true;
    const k = this.t / o.life; if (k >= 1) return false;
    const pa = this.pts.geometry.attributes.position;
    this.p.forEach((q, i) => {
      q.v.y += o.gravity * dt; q.v.multiplyScalar(1 - o.drag * dt);
      if (o.swirl) { const ang = o.swirl * dt; const x = q.x, z = q.z; q.x = x * Math.cos(ang) - z * Math.sin(ang); q.z = x * Math.sin(ang) + z * Math.cos(ang); }
      q.x += q.v.x * dt; q.y += q.v.y * dt; q.z += q.v.z * dt;
      pa.setXYZ(i, q.x, q.y, q.z);
    });
    pa.needsUpdate = true;
    this.mat.opacity = o.opacity * Math.min(1, k * 8) * (1 - ease(seg(k, 0.55, 1)));
    return true;
  }
  dispose() { this.scene.remove(this.pts); this.pts.geometry.dispose(); this.mat.dispose(); }
}

class Timed { // efek generik berbasis fungsi update(t) → false kalau selesai
  constructor(fn, dispose) { this.t = 0; this.fn = fn; this.d = dispose; }
  update(dt) { this.t += dt; return this.fn(this.t, dt) !== false; }
  dispose() { this.d?.(); }
}

// ---------------------------------------------------------------- pass color grading + vignette
export function gradePass() {
  return new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.9 }, uRed: { value: 0 }, uFlash: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uVig, uRed, uFlash; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        float l = dot(c.rgb, vec3(.299,.587,.114));
        c.rgb = mix(vec3(l), c.rgb, 1.08);                       // sedikit lebih jenuh
        c.rgb *= mix(vec3(1.0), vec3(1.10,.93,.88), .35);         // nuansa hangat-merah
        c.rgb = mix(c.rgb, c.rgb * vec3(1.35,.55,.5), uRed);     // denyut merah (kematian)
        vec2 d = vUv - .5; float v = smoothstep(.85, .2, length(d * vec2(1.0, .85)));
        c.rgb *= mix(1.0, v, uVig);
        c.rgb += uFlash * vec3(1.0,.85,.8);
        c.rgb += (h(vUv * 800. + uTime) - .5) * .025;            // butiran film
        gl_FragColor = c;
      }`,
  });
}

// ---------------------------------------------------------------- manajer efek
export class FX {
  constructor(village) {
    this.v = village; this.scene = village.scene; this.list = [];
    // Kumpulan lampu tetap: menambah/menghapus lampu saat main memaksa SEMUA shader dikompilasi ulang (lag beberapa detik)
    this.pool = Array.from({ length: 4 }, () => { const l = new THREE.PointLight(0xffffff, 0, 14, 1.6); l.userData.busy = false; this.scene.add(l); return l; });
  }
  acquire(color, pos, dist = 14) {
    const l = this.pool.find((x) => !x.userData.busy); if (!l) return null;
    l.userData.busy = true; l.color.set(color); l.position.copy(pos); l.distance = dist; l.intensity = 0; return l;
  }
  release(l) { if (l) { l.intensity = 0; l.userData.busy = false; } }
  add(e) { this.list.push(e); return e; }
  burst(o) { return this.add(new Burst(this.scene, o)); }
  light(pos, color, peak, dur, dist = 14) {
    const l = this.acquire(color, pos, dist); if (!l) return null;
    return this.add(new Timed((t) => { l.intensity = peak * Math.sin(Math.min(1, t / dur) * Math.PI); return t < dur; }, () => this.release(l)));
  }
  update(dt) {
    // PENTING: efek yang memunculkan efek lain saat update (cakar → darah, konfeti podium, jejak panah)
    // dulu ikut terbuang dari daftar → tidak pernah dihapus & tetap digambar (draw call menumpuk tiap ronde).
    // Sekarang efek baru yang muncul selama update ditampung di daftar baru lalu digabung.
    const cur = this.list; this.list = [];
    const keep = [];
    for (const e of cur) { if (e.update(dt)) keep.push(e); else e.dispose(); }
    this.list = keep.concat(this.list);
  }

  /** Ambience: lingkaran rune di lapangan, kabut tanah, bara api, debu sihir merah */
  ambience(heightAt) {
    const rt = runeCircleTexture();
    const mat = new THREE.MeshBasicMaterial({ map: rt, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5, color: 0xff5544, polygonOffset: true, polygonOffsetFactor: -2 });
    const circle = new THREE.Mesh(new THREE.CircleGeometry(5.3, 64), mat);
    circle.rotation.x = -Math.PI / 2; circle.position.y = heightAt(0, 0) + 0.12; this.scene.add(circle);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), mat.clone()); inner.material.map = runeCircleTexture('255,170,90', 512, 31);
    inner.rotation.x = -Math.PI / 2; inner.position.y = circle.position.y + 0.01; this.scene.add(inner);
    this.circle = circle; this.innerCircle = inner;
    // kabut tanah
    this.fog = [];
    for (let i = 0; i < 18; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex(), color: 0x8a90a8, transparent: true, depthWrite: false, opacity: 0 }));
      const a = Math.random() * Math.PI * 2, d = 9 + Math.random() * 30;
      s.userData = { a, d, sp: (Math.random() - 0.5) * 0.03, base: 0.05 + Math.random() * 0.07 };
      s.scale.set(14 + Math.random() * 10, 4 + Math.random() * 2, 1);
      s.position.set(Math.cos(a) * d, heightAt(Math.cos(a) * d, Math.sin(a) * d) + 1.2, Math.sin(a) * d);
      this.scene.add(s); this.fog.push(s);
    }
    // bara api naik + debu sihir
    const mk = (n, rgb, size) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); const p = new THREE.Points(g, new THREE.PointsMaterial({ map: glow(rgb), size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); p.frustumCulled = false; this.scene.add(p); return p; };
    this.embers = mk(70, '255,150,60', 0.14); this.emberD = Array.from({ length: 70 }, () => ({ life: Math.random(), a: Math.random() * 6.3, r: Math.random() * 0.5, s: 0.25 + Math.random() * 0.4, w: 1 + Math.random() * 2 }));
    this.motes = mk(160, '255,60,50', 0.12); this.moteD = Array.from({ length: 160 }, () => { const a = Math.random() * 6.3, d = 3 + Math.random() * 26; return { a, d, y: 0.3 + Math.random() * 4, ph: Math.random() * 10, gy: heightAt(Math.cos(a) * d, Math.sin(a) * d) }; });
    this.heightAt = heightAt;
  }
  ambienceUpdate(dt, t, night) {
    if (!this.circle) return;
    this.circle.rotation.z += dt * 0.03; this.innerCircle.rotation.z -= dt * 0.08;
    const pulse = 0.85 + Math.sin(t * 1.7) * 0.15;
    this.circle.material.opacity = (0.22 + night * 0.6) * pulse * (this.circleBoost || 1);
    this.innerCircle.material.opacity = (0.18 + night * 0.5) * pulse;
    for (const s of this.fog) {
      const u = s.userData; u.a += u.sp * dt;
      s.position.x = Math.cos(u.a) * u.d; s.position.z = Math.sin(u.a) * u.d;
      s.material.opacity = u.base * (0.5 + night * 0.8);
      s.material.color.copy(this.scene.fog.color).multiplyScalar(1.4);
    }
    const ep = this.embers.geometry.attributes.position, fy = this.heightAt(0, 0);
    this.emberD.forEach((d, i) => { d.life += dt * d.s; if (d.life > 1) { d.life = 0; d.a = Math.random() * 6.3; d.r = Math.random() * 0.5; } const y = d.life * 6; ep.setXYZ(i, Math.cos(d.a + y * d.w) * (d.r + y * 0.12), fy + 0.4 + y, Math.sin(d.a + y * d.w) * (d.r + y * 0.12)); });
    ep.needsUpdate = true; this.embers.material.opacity = 0.9;
    const mp = this.motes.geometry.attributes.position;
    this.moteD.forEach((d, i) => { const a = d.a + t * 0.02; mp.setXYZ(i, Math.cos(a) * d.d + Math.sin(t * 0.4 + d.ph) * 0.6, d.gy + d.y + Math.sin(t * 0.8 + d.ph) * 0.35, Math.sin(a) * d.d); }); // tinggi tanah sudah dihitung sekali (hemat CPU)
    mp.needsUpdate = true; this.motes.material.opacity = 0.15 + night * 0.75;
  }

  /** Panaskan shader & tekstur efek saat game dimuat, supaya animasi pertama tidak tersendat */
  warmup() {
    const tmp = new THREE.Group(); tmp.position.set(0, -50, 0);
    const w = makePlayerWerewolf();
    w.root.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.5; } });
    tmp.add(w.root);
    const add = (m) => tmp.add(m);
    for (const b of [THREE.AdditiveBlending, THREE.NormalBlending]) for (const map of [glow('255,80,60'), smokeTex()]) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
      const pm = new THREE.PointsMaterial({ map, size: 0.3, transparent: true, depthWrite: false, blending: b }); if (map !== glow('255,80,60')) pm.color.set('rgb(80,255,120)');
      add(new THREE.Points(g, pm));
    }
    add(new THREE.Sprite(new THREE.SpriteMaterial({ map: clawTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    add(new THREE.Mesh(new THREE.CircleGeometry(1, 8), new THREE.MeshBasicMaterial({ map: runeCircleTexture('255,60,40', 512, 13), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), new THREE.MeshBasicMaterial({ map: pillarTex('255,50,40'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })));
    add(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb340, transparent: true, wireframe: true })));
    add(new THREE.Mesh(new THREE.TetrahedronGeometry(0.1), new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffb340, transparent: true })));
    add(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0xddddee, metalness: 0.9, roughness: 0.2, emissive: 0xffcc66 })));
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 5), new THREE.MeshBasicMaterial({ color: 0xff1a1a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
    // kompilasi di latar (compileAsync) — objek disimpan agar shader-nya tetap di cache
    this._warm = tmp;
    const r = this.v.renderer;
    if (r.compileAsync) r.compileAsync(tmp, this.v.camera, this.scene).catch(() => {});
    else { this.scene.add(tmp); try { r.compile(this.scene, this.v.camera); } catch { /* */ } requestAnimationFrame(() => requestAnimationFrame(() => this.scene.remove(tmp))); }
  }

  // ------------------------------------------------------------ animasi kematian
  /**
   * kind: wolf | vote | poison | hunter | guard | left | other
   * a: avatar (dari Village), from: posisi asal panah hunter (Vector3) bila ada
   * Mengembalikan objek animasi yang dibaca Village.loop untuk pose korban.
   */
  death(kind, a, from) {
    const v = this.v, at = a.root.position.clone(), chest = at.clone().setY(at.y + 1.3);
    const out = at.clone().setY(0).normalize(); if (!out.lengthSq()) out.set(0, 0, 1);
    const anim = { kind, t: 0, dur: { wolf: 3.2, vote: 3.6, poison: 3.2, hunter: 2.4, guard: 3.0, sniper: 2.8 }[kind] || 2 };
    v.flashRed(kind === 'wolf' || kind === 'vote' ? 0.6 : 0.35);
    switch (kind) {
      case 'wolf': {
        // bayangan werewolf muncul di belakang korban, menerkam, cakar merah
        const w = makePlayerWerewolf();
        w.root.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0; o.material.color?.multiplyScalar(0.55); if (o.material.emissive && !o.material.emissive.getHex()) o.material.emissive.setHex(0x2a0505); o.castShadow = true; } });
        // datang dari samping (relatif kamera) supaya tidak menutupi korban
        const view = at.clone().sub(v.camera.position).setY(0).normalize(), side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), view);
        if (side.dot(out) < 0) side.negate();
        const start = at.clone().addScaledVector(side, 4.5).addScaledVector(view, 1.2), end = at.clone().addScaledVector(side, 1.0).addScaledVector(view, 0.3);
        w.root.position.copy(start); w.root.lookAt(at.x, w.root.position.y, at.z); this.scene.add(w.root);
        const eyes = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow('255,40,30'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); eyes.scale.setScalar(0.9); w.root.add(eyes); eyes.position.set(0, 2.4, 0.4);
        this.add(new Timed((t, dt) => {
          const fade = seg(t, 0, 0.5) * (1 - seg(t, 2.2, 2.9));
          w.root.traverse((o) => { if (o.isMesh) o.material.opacity = fade; });
          eyes.material.opacity = fade;
          const k = ease(seg(t, 0.45, 0.8));
          w.root.position.lerpVectors(start, end, k); w.root.position.y = at.y + Math.sin(k * Math.PI) * 1.1 - seg(t, 2.2, 2.9) * 1.5;
          w.update(dt, k > 0 && k < 1 ? 8 : 0, { attack: seg(t, 0.6, 1.1) > 0 && seg(t, 0.6, 1.1) < 1 ? seg(t, 0.6, 1.1) : 0, attackArm: 1, howl: seg(t, 1.3, 2.1) > 0 && seg(t, 1.3, 2.1) < 1 ? seg(t, 1.3, 2.1) : 0 });
          return t < 3;
        }, () => disposeDeep(w.root)));
        let clawed = false;
        this.add(new Timed((t) => {
          if (t > 0.78 && !clawed) {
            clawed = true;
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: clawTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, rotation: -0.4 }));
            sp.position.copy(chest); sp.scale.setScalar(0.2); this.scene.add(sp);
            this.add(new Timed((u) => { const k = seg(u, 0, 0.15); sp.scale.setScalar(0.4 + k * 2.4); sp.material.opacity = 1 - seg(u, 0.35, 0.9); return u < 0.9; }, () => { disposeDeep(sp); }));
            this.burst({ at: chest, n: 70, rgb: '200,10,10', size: 0.22, speed: 3.2, up: 0.6, gravity: -6, life: 1.4, spread: 1.4, blending: THREE.NormalBlending });
            this.burst({ at: chest, n: 30, rgb: '255,60,40', size: 0.5, speed: 1.5, life: 0.8 });
            this.light(chest, 0xff2010, 60, 0.6);
            v.shake(0.35);
          }
          return t < 1;
        }));
        break;
      }
      case 'vote': {
        // lingkaran rune penghakiman, pilar cahaya merah, terangkat lalu runtuh
        const rm = new THREE.MeshBasicMaterial({ map: runeCircleTexture('255,60,40', 512, 13), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
        const circ = new THREE.Mesh(new THREE.CircleGeometry(1.8, 48), rm); circ.rotation.x = -Math.PI / 2; circ.position.copy(at).setY(at.y + 0.08); this.scene.add(circ);
        const pm = new THREE.MeshBasicMaterial({ map: pillarTex('255,50,40'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0 });
        pm.map.wrapS = THREE.RepeatWrapping;
        const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.0, 14, 40, 1, true), pm); pil.position.copy(at).setY(at.y + 7); this.scene.add(pil);
        const lt = this.acquire(0xff3020, at.clone().setY(at.y + 1.5), 12);
        this.add(new Timed((t, dt) => {
          const on = seg(t, 0, 0.7) * (1 - seg(t, 2.8, 3.6));
          rm.opacity = on; circ.rotation.z += dt * (0.5 + seg(t, 0.5, 2) * 4); circ.scale.setScalar(0.6 + on * 0.6);
          pm.opacity = seg(t, 0.5, 1.2) * (1 - seg(t, 2.1, 2.6)) * 0.55; pm.map.offset.x += dt * 0.15; pil.scale.set(1, seg(t, 0.5, 1.1), 1); pil.position.y = at.y + 7 * seg(t, 0.5, 1.1);
          if (lt) lt.intensity = on * 25 + (t > 2.05 && t < 2.3 ? 60 : 0);
          return t < 3.6;
        }, () => { disposeDeep(circ); disposeDeep(pil); this.release(lt); }));
        this.burst({ at: at.clone().setY(at.y + 0.2), n: 80, rgb: '255,90,50', size: 0.16, speed: 0.6, up: 3, gravity: 0.5, life: 2.4, spread: 0.6, swirl: 3, radius: 1.2, delay: 0.6 });
        let dropped = false;
        this.add(new Timed((t) => { if (t > 2.05 && !dropped) { dropped = true; v.shake(0.25); this.burst({ at: chest, n: 60, rgb: '255,200,160', size: 0.35, speed: 4, up: 0.3, gravity: -2, life: 0.9, spread: 1.6 }); } return t < 2.5; }));
        break;
      }
      case 'poison': {
        // asap racun hijau, tubuh berpendar hijau, berlutut lalu tumbang
        this.burst({ at: at.clone().setY(at.y + 0.1), n: 50, map: smokeTex(), rgb: '80,255,120', size: 1.6, speed: 0.4, up: 1.2, gravity: 0.2, life: 3, spread: 0.7, radius: 0.6, blending: THREE.NormalBlending, opacity: 0.8 });
        this.burst({ at: at.clone().setY(at.y + 0.3), n: 60, rgb: '120,255,90', size: 0.18, speed: 0.5, up: 1.6, gravity: 0.3, life: 2.6, spread: 0.5, radius: 0.5, swirl: 2 });
        this.light(chest, 0x40ff60, 18, 2.6, 9);
        break;
      }
      case 'hunter': {
        // panah bercahaya emas melesat dari arah Hunter
        const src = (from || at.clone().add(out.clone().multiplyScalar(-12))).clone(); src.y += 1.4;
        const arrow = new THREE.Group();
        const gold = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, emissive: 0xffaa33, emissiveIntensity: 2.5 });
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6), gold); shaft.rotation.x = Math.PI / 2;
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 6), new THREE.MeshStandardMaterial({ color: 0xddddee, metalness: 0.9, roughness: 0.2, emissive: 0xffcc66, emissiveIntensity: 1.5 })); head.rotation.x = Math.PI / 2; head.position.z = 0.65;
        arrow.add(shaft, head); arrow.userData.arrow = true; this.scene.add(arrow);
        const mid = src.clone().lerp(chest, 0.5); mid.y += 1.2;
        const curve = new THREE.QuadraticBezierCurve3(src, mid, chest);
        let stuck = false;
        this.add(new Timed((t) => {
          const k = Math.min(1, t / 0.55);
          if (!stuck) {
            const p = curve.getPoint(k), n = curve.getPoint(Math.min(1, k + 0.02));
            arrow.position.copy(p); arrow.lookAt(n);
            if (Math.random() < 0.9) this.burst({ at: p.clone(), n: 4, rgb: '255,190,80', size: 0.2, speed: 0.2, life: 0.4, gravity: 0 });
            if (k >= 1) {
              stuck = true; v.shake(0.3);
              this.burst({ at: chest, n: 50, rgb: '255,170,60', size: 0.22, speed: 3, life: 0.8, gravity: -4, spread: 1.2 });
              this.light(chest, 0xffaa40, 40, 0.5);
              a.rig.root.attach(arrow); // panah ikut tumbang bersama korban
            }
          }
          return t < 30;
        }, () => { disposeDeep(arrow); }));
        break;
      }
      case 'sniper': {
        // laser merah dari hutan gelap → titik bidik di dada → kilatan moncong → peluru pelacak → hantaman
        const ang = Math.random() * Math.PI * 2, src = at.clone().add(new THREE.Vector3(Math.cos(ang) * 32, 0, Math.sin(ang) * 32)); src.y = at.y + 5;
        const laserM = new THREE.MeshBasicMaterial({ color: 0xff1a1a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
        const laser = rod(src, chest, 0.012, laserM); this.scene.add(laser);
        const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow('255,30,30'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
        dot.scale.setScalar(0.25); dot.position.copy(chest).addScaledVector(src.clone().sub(chest).normalize(), 0.2); this.scene.add(dot);
        const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow('255,220,150'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
        flash.scale.setScalar(3); flash.position.copy(src); this.scene.add(flash);
        const tracerM = new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
        const tracer = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.5, 5), tracerM); this.scene.add(tracer);
        const dir = chest.clone().sub(src).normalize(); tracer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        let hit = false;
        this.add(new Timed((t) => {
          laserM.opacity = seg(t, 0, 0.25) * (t < 0.95 ? 0.75 + Math.sin(t * 40) * 0.2 : 0);
          dot.material.opacity = laserM.opacity; dot.scale.setScalar(0.2 + Math.sin(t * 30) * 0.05);
          flash.material.opacity = t > 0.95 && t < 1.1 ? 1 - seg(t, 0.95, 1.1) : 0;
          const k = seg(t, 0.95, 1.05); tracerM.opacity = k > 0 && k < 1 ? 1 : 0; tracer.position.lerpVectors(src, chest, k);
          if (k >= 1 && !hit) {
            hit = true; v.shake(0.45); v.flashRed(0.5);
            this.burst({ at: chest, n: 60, rgb: '190,10,10', size: 0.2, speed: 3.5, up: 0.4, gravity: -6, life: 1.3, spread: 1.3, blending: THREE.NormalBlending });
            this.burst({ at: chest, n: 30, rgb: '255,200,120', size: 0.25, speed: 4, life: 0.5, gravity: -2, spread: 1.5 });
            this.light(chest, 0xffaa60, 50, 0.4);
          }
          return t < 1.6;
        }, () => { [laser, dot, flash, tracer].forEach(disposeDeep); }));
        break;
      }
      case 'guard': {
        // kubah perisai emas retak lalu pecah berhamburan
        const dm = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb340, emissiveIntensity: 1.4, transparent: true, opacity: 0, wireframe: true });
        const dome = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 1), dm); dome.position.copy(at).setY(at.y + 1.1); this.scene.add(dome);
        const shardG = new THREE.TetrahedronGeometry(0.16), shardM = new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffb340, emissiveIntensity: 2, transparent: true });
        const shards = [];
        this.add(new Timed((t, dt) => {
          dm.opacity = seg(t, 0, 0.4) * (t < 0.9 ? 1 : 0); dome.rotation.y += dt; dm.emissiveIntensity = 1.4 + seg(t, 0.5, 0.9) * 4;
          if (t > 0.9 && !shards.length) {
            for (let i = 0; i < 26; i++) {
              const m = new THREE.Mesh(shardG, shardM); const d = new THREE.Vector3().randomDirection(); if (d.y < 0) d.y *= -0.5;
              m.position.copy(dome.position).addScaledVector(d, 1.3); m.userData.v = d.multiplyScalar(3 + Math.random() * 3); this.scene.add(m); shards.push(m);
            }
            v.shake(0.3); this.light(dome.position, 0xffc060, 50, 0.6);
          }
          for (const m of shards) { m.userData.v.y -= 9 * dt; m.position.addScaledVector(m.userData.v, dt); m.rotation.x += dt * 6; m.rotation.y += dt * 4; if (m.position.y < at.y) { m.position.y = at.y; m.userData.v.multiplyScalar(0.3); m.userData.v.y *= -0.4; } }
          shardM.opacity = 1 - seg(t, 1.8, 2.8);
          return t < 2.8;
        }, () => { disposeDeep(dome); shards.forEach((m) => m.parent?.remove(m)); shardM.dispose(); shardG.dispose(); }));
        break;
      }
      default:
        this.burst({ at: at.clone().setY(at.y + 0.5), n: 30, map: smokeTex(), rgb: '160,160,170', size: 1.4, speed: 0.4, up: 1, gravity: 0.2, life: 2, spread: 0.6, blending: THREE.NormalBlending, opacity: 0.6 });
    }
    // arwah naik setelah tumbang
    this.burst({ at: chest.clone().setY(at.y + 0.6), n: 26, rgb: '170,200,255', size: 0.3, speed: 0.35, up: 1.6, gravity: 0.4, life: 2.6, spread: 0.3, radius: 0.3, swirl: 1.5, delay: anim.dur * 0.6 });
    return anim;
  }

  // ------------------------------------------------------------ podium
  buildPodium(at) {
    const g = new THREE.Group(); g.position.copy(at);
    const stone = this.v.stoneMat, gold = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.9, roughness: 0.3, emissive: 0x6a4a10, emissiveIntensity: 0.6 });
    const spec = [{ x: 0, h: 1.5, n: 'I' }, { x: -1.75, h: 1.05, n: 'II' }, { x: 1.75, h: 0.7, n: 'III' }];
    this.spots = [];
    for (const s of spec) {
      const blk = new THREE.Mesh(new THREE.BoxGeometry(1.7, s.h, 1.5), stone); blk.position.set(s.x, s.h / 2, 0); blk.castShadow = blk.receiveShadow = true;
      const trim = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.08, 1.58), gold); trim.position.set(s.x, s.h, 0);
      const trim2 = trim.clone(); trim2.position.y = 0.06;
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), new THREE.MeshStandardMaterial({ map: numeralTex(s.n), emissive: 0xffffff, emissiveMap: numeralTex(s.n), emissiveIntensity: 0.7 }));
      plate.position.set(s.x, s.h * 0.55, 0.76);
      g.add(blk, trim, trim2, plate);
      this.spots.push(new THREE.Vector3(at.x + s.x, at.y + s.h, at.z));
    }
    const rc = new THREE.Mesh(new THREE.CircleGeometry(3.6, 64), new THREE.MeshBasicMaterial({ map: runeCircleTexture('255,200,90', 1024, 99), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
    rc.rotation.x = -Math.PI / 2; rc.position.y = 0.04; g.add(rc); this.podiumCircle = rc;
    // lampu podium selalu ada di scene (intensitas 0 saat tersembunyi) supaya tidak memicu kompilasi ulang shader
    const sl = new THREE.SpotLight(0xffe2b0, 0, 30, 0.6, 0.45, 1.2); sl.position.set(at.x, at.y + 10, at.z + 6); sl.target.position.set(at.x, at.y + 1, at.z); this.scene.add(sl, sl.target);
    const warm = new THREE.PointLight(0xffb060, 0, 10, 1.6); warm.position.set(at.x, at.y + 1.2, at.z + 2.4); this.scene.add(warm);
    this.podiumLights = [[sl, 260], [warm, 25]];
    g.scale.setScalar(0.001);
    this.scene.add(g); this.podium = g;
    return g;
  }
  showPodium(on) {
    if (!this.podium) return;
    if (on && !this.podiumOn) {
      this.podiumOn = true; this.podiumT = 0;
      const top = this.spots[0].clone();
      // konfeti emas & merah + bara naik
      let acc = 0;
      this.confetti = this.add(new Timed((t, dt) => {
        if (!this.podiumOn) return false;
        acc += dt; if (acc < 0.15) return true; acc = 0; // ±6 semburan/detik, tidak bergantung FPS
        if (Math.random() < 0.8) this.burst({ at: top.clone().add(new THREE.Vector3((Math.random() - 0.5) * 5, 4.5, (Math.random() - 0.5) * 2)), n: 14, rgb: Math.random() < 0.5 ? '255,210,110' : '255,70,60', size: 0.16, speed: 0.6, up: -0.4, gravity: -0.8, life: 3, spread: 0.8, drag: 0.4 });
        if (Math.random() < 0.35) this.burst({ at: top.clone().setY(top.y - 1.4), n: 10, rgb: '255,190,90', size: 0.2, speed: 0.4, up: 2, gravity: 0.2, life: 2, spread: 1.6, radius: 2 });
        return true;
      }));
      this.burst({ at: top.clone().setY(top.y + 0.5), n: 120, rgb: '255,210,120', size: 0.3, speed: 5, up: 1.2, gravity: -3, life: 2, spread: 1.4 });
      this.light(top, 0xffd080, 80, 1);
    }
    if (!on && this.podiumOn) { this.podiumOn = false; this.podium.scale.setScalar(0.001); this.podiumLights.forEach(([l]) => (l.intensity = 0)); }
  }
  podiumUpdate(dt) {
    if (!this.podiumOn) return;
    this.podiumT += dt;
    const k = ease(Math.min(1, this.podiumT / 0.9));
    this.podium.scale.set(1, Math.max(0.001, k), 1);
    this.podiumLights.forEach(([l, i]) => (l.intensity = i * k));
    this.podiumCircle.rotation.z += dt * 0.2;
  }
}
