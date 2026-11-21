// Tema desa: Kampung (aktivitas desa), Pasar (aktivitas pasar), Modern.
// Tiap tema = { group, update(dt, t, night), grassClear (radius rumput yang dibersihkan), cabins (pakai rumah kayu bawaan?) }
import * as THREE from 'three';
import { sway } from './heroes.js';

export const THEMES = { kampung: 'Kampung', pasar: 'Pasar Desa', modern: 'Desa Modern', kantor: 'Kantor TBR' };

// ---------------------------------------------------------------- util
const cnv = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const texOf = (c, rx = 1, ry = 1) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; return t; };
const M = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.8 }, o));
const glowMat = (c, i = 2) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: i });
let glowTexC = null;
function glowTex() {
  if (glowTexC) return glowTexC;
  const s = 64, [c, x] = cnv(s), g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s); glowTexC = new THREE.CanvasTexture(c); glowTexC.colorSpace = THREE.SRGBColorSpace; return glowTexC;
}
const sprite = (color, size, op = 0.8) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: op })); s.scale.setScalar(size); return s; };
const shadow = (o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };
function rng(seed) { let s = seed; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9 >>> 0) / 4294967296); }
/** cincin datar dengan UV memanjang (u = keliling) untuk jalan/trotoar */
function ringStrip(r1, r2, seg, uRepeat, rows = 4) {
  const pos = [], uv = [], idx = [], R = rows + 1;
  for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); for (let j = 0; j <= rows; j++) { const rr = r1 + (r2 - r1) * j / rows; pos.push(c * rr, 0, s * rr); uv.push((i / seg) * uRepeat, j / rows); } }
  for (let i = 0; i < seg; i++) for (let j = 0; j < rows; j++) { const a = i * R + j, b = a + R; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** lingkaran datar yang mengikuti kontur tanah */
function groundDisc(r, mat, heightAt, lift = 0.04, seg = 64) {
  // RingGeometry dengan banyak cincin agar permukaannya rapat mengikuti kontur tanah
  const g = new THREE.RingGeometry(0.01, r, seg, Math.max(8, Math.round(r * 1.6))); g.rotateX(-Math.PI / 2);
  { const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / (2 * r) + 0.5, -p.getZ(i) / (2 * r) + 0.5); }
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)) + lift);
  g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.receiveShadow = true; return m;
}
function conform(geo, heightAt, lift) { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)) + lift); geo.computeVertexNormals(); return geo; }

// ---------------------------------------------------------------- tekstur prosedural
const TX = {};
function thatchTex() {
  if (TX.thatch) return TX.thatch; const [c, x] = cnv(256); x.fillStyle = '#9a7a3a'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { const px = Math.random() * 256, py = Math.random() * 256, l = 10 + Math.random() * 18, v = 110 + Math.random() * 80; x.strokeStyle = `rgba(${v},${v * 0.8},${v * 0.4},.7)`; x.lineWidth = 1 + Math.random(); x.beginPath(); x.moveTo(px, py); x.lineTo(px + (Math.random() - 0.5) * 3, py + l); x.stroke(); }
  for (let y = 0; y < 256; y += 32) { x.fillStyle = 'rgba(40,25,10,.35)'; x.fillRect(0, y, 256, 3); }
  return (TX.thatch = texOf(c, 2, 2));
}
function bambooTex() {
  if (TX.bamboo) return TX.bamboo; const [c, x] = cnv(256); x.fillStyle = '#b89a5a'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 16) { const g = x.createLinearGradient(i, 0, i + 16, 0); g.addColorStop(0, '#8a6a32'); g.addColorStop(0.5, '#d8bc7a'); g.addColorStop(1, '#8a6a32'); x.fillStyle = g; x.fillRect(i, 0, 15, 256); for (let y = 20 + Math.random() * 30; y < 256; y += 50 + Math.random() * 20) { x.fillStyle = '#6a4a22'; x.fillRect(i, y, 15, 3); } }
  return (TX.bamboo = texOf(c, 2, 1));
}
function stripeTex(a, b) {
  const k = 'st' + a + b; if (TX[k]) return TX[k]; const [c, x] = cnv(128, 64);
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? a : b; x.fillRect(i * 16, 0, 16, 64); }
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? b : a; x.beginPath(); x.arc(i * 16 + 8, 64, 8, Math.PI, 0); x.fill(); }
  return (TX[k] = texOf(c));
}
function cobbleTex() {
  if (TX.cobble) return TX.cobble; const [c, x] = cnv(256); x.fillStyle = '#4a4440'; x.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 21) for (let i = 0; i < 12; i++) { const ox = (y / 21 % 2) * 11 + i * 22, v = 100 + Math.random() * 50; x.fillStyle = `rgb(${v},${v * 0.95},${v * 0.88})`; x.beginPath(); x.ellipse(ox, y + 10, 10, 9, 0, 0, Math.PI * 2); x.fill(); }
  return (TX.cobble = texOf(c, 14, 14));
}
function tileTex() {
  if (TX.tile) return TX.tile; const [c, x] = cnv(256); x.fillStyle = '#9a9890'; x.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 4; y++) for (let i = 0; i < 4; i++) { const v = 175 + Math.random() * 30; x.fillStyle = `rgb(${v},${v},${v - 6})`; x.fillRect(i * 64 + 2, y * 64 + 2, 60, 60); }
  return (TX.tile = texOf(c, 18, 18));
}
function asphaltTex() {
  if (TX.asph) return TX.asph; const [c, x] = cnv(256, 128); x.fillStyle = '#2e2f33'; x.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 3000; i++) { const v = 30 + Math.random() * 40; x.fillStyle = `rgb(${v},${v},${v + 3})`; x.fillRect(Math.random() * 256, Math.random() * 128, 2, 2); }
  x.fillStyle = '#e8e2c8'; for (let i = 0; i < 256; i += 64) x.fillRect(i + 8, 61, 36, 6);
  x.fillStyle = '#d8d8d8'; x.fillRect(0, 4, 256, 3); x.fillRect(0, 121, 256, 3);
  return (TX.asph = texOf(c));
}
function windowTex() {
  if (TX.win) return TX.win; const [c, x] = cnv(128); x.fillStyle = '#1a2230'; x.fillRect(0, 0, 128, 128);
  const g = x.createLinearGradient(0, 0, 128, 128); g.addColorStop(0, 'rgba(160,200,255,.55)'); g.addColorStop(0.5, 'rgba(255,255,255,.08)'); g.addColorStop(1, 'rgba(120,160,220,.4)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#d8d8d8'; x.fillRect(62, 0, 4, 128); x.fillRect(0, 62, 128, 4); x.fillRect(0, 0, 128, 4); x.fillRect(0, 124, 128, 4); x.fillRect(0, 0, 4, 128); x.fillRect(124, 0, 4, 128);
  return (TX.win = texOf(c));
}
function plankTex(col) {
  const k = 'pl' + col; if (TX[k]) return TX[k]; const [c, x] = cnv(128); x.fillStyle = col; x.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16) { x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, y, 128, 2); for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},.06)`; x.fillRect(Math.random() * 128, y + Math.random() * 16, 18, 1); } }
  return (TX[k] = texOf(c, 2, 2));
}

// ---------------------------------------------------------------- penghuni kecil: ayam / merpati
function bird(kind) {
  const g = new THREE.Group(), white = kind === 'chicken' ? (Math.random() < 0.5 ? 0xf2efe6 : 0xa0602a) : 0x8a8f9a;
  const s = kind === 'chicken' ? 1 : 0.6;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16 * s, 10, 8), M(white, { roughness: 0.9 })); body.scale.set(0.9, 0.85, 1.2); body.position.y = 0.22 * s;
  const head = new THREE.Group(); head.position.set(0, 0.36 * s, 0.13 * s);
  const hm = new THREE.Mesh(new THREE.SphereGeometry(0.075 * s, 8, 6), M(white)); head.add(hm);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025 * s, 0.07 * s, 4), M(0xe0a020)); beak.rotation.x = Math.PI / 2; beak.position.z = 0.08 * s; head.add(beak);
  if (kind === 'chicken') { const comb = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.08), M(0xd0201a)); comb.position.set(0, 0.07, 0.01); head.add(comb); }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08 * s, 0.18 * s, 5), M(kind === 'chicken' ? 0x2a2a2a : white)); tail.position.set(0, 0.3 * s, -0.17 * s); tail.rotation.x = -0.9;
  for (const sx of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14 * s, 4), M(0xe0a020)); leg.position.set(sx * 0.05 * s, 0.07 * s, 0); g.add(leg); }
  g.add(body, head, tail); g.userData = { head, s };
  return shadow(g);
}
function flock(n, kind, rMin, rMax, heightAt, r) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const b = bird(kind), a = r() * Math.PI * 2, d = rMin + r() * (rMax - rMin);
    b.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    b.userData.target = b.position.clone(); b.userData.wait = r() * 3; b.userData.peck = 0;
    list.push(b);
  }
  const update = (dt, t) => {
    for (const b of list) {
      const u = b.userData;
      if (u.wait > 0) { u.wait -= dt; u.peck += dt * 9; u.head.rotation.x = Math.max(0, Math.sin(u.peck)) * 0.9; }
      else {
        const d = u.target.clone().sub(b.position); d.y = 0;
        if (d.length() < 0.1) { u.wait = 1 + Math.random() * 4; const a = Math.random() * Math.PI * 2, rr = rMin + Math.random() * (rMax - rMin); u.target.set(Math.cos(a) * rr, 0, Math.sin(a) * rr); }
        else { d.normalize(); b.position.addScaledVector(d, dt * (kind === 'chicken' ? 0.7 : 1.1)); b.rotation.y = Math.atan2(d.x, d.z); u.head.rotation.x = Math.sin(t * 14) * 0.15; }
      }
      b.position.y = heightAt(b.position.x, b.position.z) + Math.abs(Math.sin(t * 12 + b.id)) * (u.wait > 0 ? 0 : 0.03);
    }
  };
  return { list, update };
}
/** asap/uap sederhana dari beberapa titik */
function smoke(points, color = 0xbbbbbb, size = 0.9) {
  const n = points.length * 14, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const mat = new THREE.PointsMaterial({ map: glowTex(), color, size, transparent: true, depthWrite: false, opacity: 0.35 });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false;
  const d = Array.from({ length: n }, (_, i) => ({ src: points[i % points.length], life: Math.random(), dx: (Math.random() - 0.5) * 0.4 }));
  const update = (dt) => { const p = g.attributes.position; d.forEach((q, i) => { q.life += dt * 0.25; if (q.life > 1) q.life = 0; p.setXYZ(i, q.src.x + q.dx * q.life * 3 + q.life * 0.8, q.src.y + q.life * 3.5, q.src.z + q.dx * q.life * 2); }); p.needsUpdate = true; };
  return { pts, update };
}

// ================================================================= KAMPUNG
function kampung(ctx) {
  const { heightAt, uTime } = ctx, r = rng(11), G = new THREE.Group(), anims = [], nightMats = [], torches = [];
  const thatch = M(0xffffff, { map: thatchTex(), roughness: 1 }), bamboo = M(0xffffff, { map: bambooTex(), roughness: 0.9 });
  const wood = M(0x5a3a22), darkWood = M(0x3a2414);
  const smokePts = [];
  // rumah panggung beratap jerami
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3, d = 24 + r() * 3, x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = new THREE.Group(), w = 5 + r(), dp = 4.2 + r() * 0.6;
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.6, 6), darkWood); st.position.set(sx * w * 0.45, 0.6, sz * dp * 0.45); h.add(st); }
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.18, dp + 0.6), wood); floor.position.y = 1.4; h.add(floor);
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, 2.1, dp), bamboo); walls.position.y = 2.5; h.add(walls);
    const roofG = new THREE.ConeGeometry(Math.max(w, dp) * 0.82, 2.6, 4, 1); roofG.rotateY(Math.PI / 4); roofG.scale(w / Math.max(w, dp) * 1.05, 1, dp / Math.max(w, dp) * 1.15);
    const roof = new THREE.Mesh(roofG, thatch); roof.position.y = 4.85; h.add(roof);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.7), darkWood); door.position.set(0, 2.3, dp / 2 + 0.01); h.add(door);
    const wm = new THREE.MeshStandardMaterial({ color: 0x1a1008, emissive: 0xffa040, emissiveIntensity: 0.1 }); nightMats.push(wm);
    for (const sx of [-1, 1]) { const wn = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), wm); wn.position.set(sx * w * 0.3, 2.7, dp / 2 + 0.01); h.add(wn); }
    for (let s = 0; s < 4; s++) { const step = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 0.35), wood); step.position.set(0, 0.3 + s * 0.3, dp / 2 + 1.4 - s * 0.32); h.add(step); }
    h.position.set(x, heightAt(x, z), z); h.lookAt(0, h.position.y, 0);
    G.add(shadow(h));
    smokePts.push(new THREE.Vector3(x, heightAt(x, z) + 5.8, z));
  }
  // sawah dengan padi
  const ricePlots = [];
  const rice = new THREE.ConeGeometry(0.06, 0.45, 4); rice.translate(0, 0.22, 0);
  const riceMat = M(0x6aa84a, { roughness: 0.9 }); riceMat.onBeforeCompile = (sh) => { sh.uniforms.uTime = uTime; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 ip = instanceMatrix * vec4(0.,0.,0.,1.); transformed.x += sin(uTime*1.5 + ip.x*0.5 + ip.z*0.3) * 0.06 * position.y;'); };
  const plotN = 6, perPlot = 260, riceIM = new THREE.InstancedMesh(rice, riceMat, plotN * perPlot); let ri = 0;
  const mtx = new THREE.Matrix4();
  for (let p = 0; p < plotN; p++) {
    const a = p / plotN * Math.PI * 2 + 0.75, d = 36, cx = Math.cos(a) * d, cz = Math.sin(a) * d, w = 9, dpt = 6;
    const water = new THREE.Mesh(conform(new THREE.PlaneGeometry(w, dpt, 8, 6).rotateX(-Math.PI / 2).rotateY(-a + Math.PI / 2).translate(cx, 0, cz), heightAt, 0.06), M(0x4a6a3a, { roughness: 0.15, metalness: 0.2 }));
    water.receiveShadow = true; G.add(water); ricePlots.push(water);
    const dike = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.25, 0.3), M(0x6a5238)); dike.position.set(cx, heightAt(cx, cz) + 0.1, cz); dike.rotation.y = -a + Math.PI / 2; G.add(dike);
    for (let k = 0; k < perPlot; k++) {
      const lx = (k % 26) / 26 * w - w / 2 + 0.17, lz = Math.floor(k / 26) / 10 * dpt - dpt / 2 + 0.3, ca = Math.cos(-a + Math.PI / 2), sa = Math.sin(-a + Math.PI / 2);
      const x = cx + lx * ca + lz * sa, z = cz - lx * sa + lz * ca;
      mtx.compose(new THREE.Vector3(x, heightAt(x, z) + 0.05, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6), new THREE.Vector3(1, 0.8 + r() * 0.5, 1));
      riceIM.setMatrixAt(ri++, mtx);
    }
  }
  riceIM.castShadow = true; G.add(riceIM);
  // jemuran baju berkibar
  const clothCols = [0xc0392b, 0x2980b9, 0xf1c40f, 0xf2efe6, 0x27ae60, 0x8e44ad];
  for (let i = 0; i < 3; i++) {
    const a = 0.9 + i * 2.1, d = 17.5, x = Math.cos(a) * d, z = Math.sin(a) * d, y = heightAt(x, z), line = new THREE.Group();
    for (const sx of [-1.4, 1.4]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 6), wood); pole.position.set(sx, 1, 0); line.add(pole); }
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 2.8, 3), M(0xeeeeee)); rope.rotation.z = Math.PI / 2; rope.position.y = 1.9; line.add(rope);
    for (let k = 0; k < 4; k++) { const cg = new THREE.PlaneGeometry(0.5, 0.7, 3, 5); cg.translate(0, -0.35, 0); const cm = sway(M(clothCols[(i * 4 + k) % 6], { side: THREE.DoubleSide, roughness: 0.9 }), uTime, { top: 0, bottom: -0.7, amp: 0.12, phase: k + i }); const cl = new THREE.Mesh(cg, cm); cl.position.set(-1.05 + k * 0.7, 1.88, 0); line.add(cl); }
    line.position.set(x, y, z); line.rotation.y = -a + Math.PI / 2; G.add(shadow(line));
  }
  // sumur dengan engkol berputar
  { const a = 2.4, d = 16.5, x = Math.cos(a) * d, z = Math.sin(a) * d, w = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.8, 16, 1, true), ctx.stoneMat); ring.material.side = THREE.DoubleSide; ring.position.y = 0.4; w.add(ring);
    const waterIn = new THREE.Mesh(new THREE.CircleGeometry(0.75, 16), M(0x1a3a4a, { roughness: 0.1, metalness: 0.3 })); waterIn.rotation.x = -Math.PI / 2; waterIn.position.y = 0.2; w.add(waterIn);
    for (const sx of [-0.85, 0.85]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.8, 0.12), wood); p.position.set(sx, 0.9, 0); w.add(p); }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.8, 4), thatch); roof.rotation.y = Math.PI / 4; roof.position.y = 2.1; w.add(roof);
    const axle = new THREE.Group(); axle.position.y = 1.5; w.add(axle);
    const ax = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.7, 8), wood); ax.rotation.z = Math.PI / 2; axle.add(ax);
    const crank = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), wood); crank.position.set(0.9, 0.2, 0); axle.add(crank);
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.25, 10), wood); w.add(bucket);
    w.position.set(x, heightAt(x, z), z); G.add(shadow(w));
    anims.push((dt, t) => { axle.rotation.x = t * 1.2; bucket.position.y = 0.9 + Math.sin(t * 0.6) * 0.45; });
  }
  // kincir air + kolam
  { const a = 4.2, d = 31, x = Math.cos(a) * d, z = Math.sin(a) * d, y = heightAt(x, z);
    G.add(groundDisc(3.2, M(0x2a5a6a, { roughness: 0.05, metalness: 0.4 }), (px, pz) => heightAt(x, z), 0.08).translateX(x).translateZ(z));
    const wheel = new THREE.Group(); wheel.position.set(x + 2.6, y + 1.3, z);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.08, 6, 24), wood); wheel.add(rim);
    for (let k = 0; k < 8; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 0.08), wood); sp.rotation.z = k / 8 * Math.PI; wheel.add(sp); const pad = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.45), wood); pad.position.set(Math.cos(k / 8 * Math.PI * 2) * 1.25, Math.sin(k / 8 * Math.PI * 2) * 1.25, 0); pad.rotation.z = k / 8 * Math.PI * 2; wheel.add(pad); }
    wheel.rotation.y = -a; G.add(shadow(wheel));
    for (const sz of [-0.5, 0.5]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 0.2), darkWood); post.position.set(x + 2.6, y + 0.8, z + sz); G.add(post); }
    anims.push((dt) => { wheel.children.forEach(() => {}); wheel.rotateZ(-dt * 0.8); });
  }
  // tumpukan kayu bakar, lesung, obor di sekeliling lapangan
  for (let i = 0; i < 4; i++) {
    const a = 0.2 + i * 1.6, d = 15.8, x = Math.cos(a) * d, z = Math.sin(a) * d, pile = new THREE.Group();
    for (let k = 0; k < 9; k++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 6), M(0x6a4a2a)); l.rotation.z = Math.PI / 2; l.position.set(0, 0.1 + Math.floor(k / 3) * 0.19, (k % 3) * 0.2 - 0.2 + (Math.floor(k / 3) % 2) * 0.1); pile.add(l); }
    pile.position.set(x, heightAt(x, z), z); pile.rotation.y = -a; G.add(shadow(pile));
  }
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + 0.2, d = 14.2, x = Math.cos(a) * d, z = Math.sin(a) * d, tg = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.7, 6), M(0x8a6a3a)); pole.position.y = 0.85; tg.add(pole);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.18, 8), darkWood); cup.position.y = 1.75; tg.add(cup);
    const flame = sprite(0xff9a40, 0.7, 0.9); flame.position.y = 1.95; tg.add(flame); torches.push(flame);
    tg.position.set(x, heightAt(x, z), z); G.add(tg);
  }
  const chickens = flock(9, 'chicken', 13.5, 19.5, heightAt, r); chickens.list.forEach((c) => G.add(c));
  const sm = smoke(smokePts, 0xcfcfcf, 1.1); G.add(sm.pts);
  return {
    group: G, grassClear: 0, cabins: false,
    update(dt, t, night) {
      anims.forEach((f) => f(dt, t)); chickens.update(dt, t); sm.update(dt);
      nightMats.forEach((m) => (m.emissiveIntensity = 0.1 + night * 2));
      torches.forEach((f, i) => { const k = 0.55 + night * 0.6; f.scale.setScalar((0.6 + Math.sin(t * 11 + i) * 0.06 + Math.random() * 0.04) * (0.7 + night * 0.6)); f.material.opacity = k; });
    },
  };
}

// ================================================================= PASAR
function pasar(ctx) {
  const { heightAt, uTime } = ctx, r = rng(23), G = new THREE.Group(), anims = [], lanterns = [], lampGlows = [];
  const wood = M(0x6a4a2a), darkWood = M(0x3a2414);
  // alun-alun berbatu (cobblestone)
  G.add(groundDisc(19.8, M(0xffffff, { map: cobbleTex(), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 }), heightAt, 0.07, 96));
  const awn = [['#c0392b', '#f2efe6'], ['#2980b9', '#f2efe6'], ['#27ae60', '#f8e9b0'], ['#e67e22', '#f2efe6'], ['#8e44ad', '#f8e9b0'], ['#16a085', '#f2efe6'], ['#d35400', '#f8e9b0'], ['#c0392b', '#f1c40f']];
  const goods = ['fruit', 'veg', 'fish', 'cloth', 'pottery', 'bread', 'fruit', 'food'];
  const tops = [], grills = [];
  const N = 8;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + Math.PI / N, d = 16.6, x = Math.cos(a) * d, z = Math.sin(a) * d, s = new THREE.Group(), W = 2.6, D = 1.5;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, sz > 0 ? 2.2 : 2.6, 6), wood); p.position.set(sx * W / 2, sz > 0 ? 1.1 : 1.3, sz * D / 2); s.add(p); }
    const counter = new THREE.Mesh(new THREE.BoxGeometry(W, 0.9, D * 0.75), M(0xffffff, { map: plankTex('#7a5232') })); counter.position.set(0, 0.45, 0.12); s.add(counter);
    // atap kain belang (berkibar pelan)
    const ag = new THREE.PlaneGeometry(W + 0.5, D + 0.7, 6, 4); ag.rotateX(-Math.PI / 2 + 0.28);
    const am = sway(M(0xffffff, { map: stripeTex(...awn[i]), side: THREE.DoubleSide, roughness: 0.9 }), uTime, { top: 0.2, bottom: -0.3, amp: 0.05, phase: i });
    const roof = new THREE.Mesh(ag, am); roof.position.set(0, 2.42, 0); s.add(roof);
    const valG = new THREE.PlaneGeometry(W + 0.5, 0.3, 6, 2); valG.translate(0, -0.15, 0);
    const val = new THREE.Mesh(valG, sway(M(0xffffff, { map: stripeTex(...awn[i]), side: THREE.DoubleSide }), uTime, { top: 0, bottom: -0.3, amp: 0.07, phase: i + 1 })); val.position.set(0, 2.2, D / 2 + 0.33); s.add(val);
    // barang dagangan
    const g = goods[i], top = 0.92;
    if (g === 'fruit') for (let k = 0; k < 18; k++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), M([0xe74c3c, 0xf39c12, 0xf1c40f, 0x8bc34a][k % 4], { roughness: 0.5 })); f.position.set(-1 + (k % 6) * 0.38, top + 0.08 + Math.floor(k / 6) * 0.02, -0.15 + Math.floor(k / 6) * 0.25); s.add(f); }
    if (g === 'veg') for (let k = 0; k < 14; k++) { const v = new THREE.Mesh(k % 2 ? new THREE.ConeGeometry(0.05, 0.3, 6) : new THREE.SphereGeometry(0.12, 8, 6), M(k % 2 ? 0xe67e22 : 0x4caf50)); v.rotation.z = k % 2 ? Math.PI / 2 : 0; v.position.set(-1 + (k % 7) * 0.33, top + 0.1, -0.1 + Math.floor(k / 7) * 0.32); s.add(v); }
    if (g === 'fish') for (let k = 0; k < 8; k++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), M(0x9aa8b8, { metalness: 0.5, roughness: 0.3 })); f.scale.set(2.4, 0.5, 0.8); f.position.set(-0.8 + (k % 4) * 0.52, top + 0.06, -0.1 + Math.floor(k / 4) * 0.3); s.add(f); }
    if (g === 'cloth') for (let k = 0; k < 6; k++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 10), M([0xc0392b, 0x2980b9, 0xf1c40f, 0x8e44ad, 0x16a085, 0xe84393][k])); c.rotation.z = Math.PI / 2; c.position.set(0, top + 0.12 + Math.floor(k / 3) * 0.24, -0.25 + (k % 3) * 0.27); s.add(c); }
    if (g === 'pottery') for (let k = 0; k < 5; k++) { const pts = []; for (let j = 0; j <= 8; j++) pts.push(new THREE.Vector2(0.08 + Math.sin(j / 8 * Math.PI) * 0.12, j * 0.05)); const pot = new THREE.Mesh(new THREE.LatheGeometry(pts, 14), M(0xa0522d, { roughness: 0.7 })); pot.position.set(-0.9 + k * 0.45, top, 0.1); s.add(pot); }
    if (g === 'bread') for (let k = 0; k < 10; k++) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.2, 3, 8), M(0xc8893a, { roughness: 0.6 })); b.rotation.z = Math.PI / 2; b.position.set(-0.9 + (k % 5) * 0.45, top + 0.07, -0.1 + Math.floor(k / 5) * 0.3); s.add(b); }
    if (g === 'food') { const grill = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 0.5), M(0x2a2a2a, { metalness: 0.6 })); grill.position.set(0, top + 0.08, 0.05); s.add(grill); const coal = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 0.4), glowMat(0xff5a1a, 2.2)); coal.position.set(0, top + 0.14, 0.05); s.add(coal); for (let k = 0; k < 6; k++) { const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 5), M(0x8a4a1a)); sk.rotation.x = Math.PI / 2; sk.position.set(-0.5 + k * 0.2, top + 0.2, 0.05); s.add(sk); } grills.push(s); }
    // keranjang & peti di depan
    for (let k = 0; k < 2; k++) { const cr = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.4), M(0xffffff, { map: plankTex('#8a6236') })); cr.position.set(-0.9 + k * 1.8, 0.18, D / 2 + 0.5); cr.rotation.y = r() * 0.4; s.add(cr); }
    s.position.set(x, heightAt(x, z), z); s.lookAt(0, s.position.y, 0);
    G.add(shadow(s));
    tops.push(new THREE.Vector3(x, heightAt(x, z) + 2.45, z));
  }
  // untaian bendera + lampion antar lapak
  const flagCols = [0xc0392b, 0xf1c40f, 0x2980b9, 0x27ae60, 0xf2efe6, 0xe67e22];
  for (let i = 0; i < N; i++) {
    const A = tops[i], B = tops[(i + 1) % N], n = 12;
    const pts = []; for (let k = 0; k <= n; k++) { const t = k / n, p = A.clone().lerp(B, t); p.y -= Math.sin(t * Math.PI) * 0.7; pts.push(p); }
    const curve = new THREE.CatmullRomCurve3(pts); G.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.01, 3), M(0x333333)));
    for (let k = 1; k < n; k++) {
      const p = curve.getPoint(k / n), tri = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.28, 3), M(flagCols[(i + k) % 6], { side: THREE.DoubleSide, roughness: 0.9 }));
      tri.rotation.x = Math.PI; tri.scale.z = 0.15; tri.position.copy(p).add(new THREE.Vector3(0, -0.15, 0)); tri.lookAt(0, tri.position.y, 0); tri.rotateX(Math.PI);
      tri.userData.ph = r() * 6; G.add(tri); anims.push((dt, t) => { tri.rotation.z = Math.sin(t * 3 + tri.userData.ph) * 0.25; });
      if (k % 4 === 2) { const lg = new THREE.Group(); lg.position.copy(p); const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshStandardMaterial({ color: 0x400a05, emissive: 0xff4a2a, emissiveIntensity: 0.6 })); body.scale.y = 1.25; body.position.y = -0.3; const gl = sprite(0xff7a40, 0.9, 0.4); gl.position.y = -0.3; lg.add(body, gl); G.add(lg); lanterns.push({ lg, body, gl, ph: r() * 6 }); }
    }
  }
  // gerobak, tong, karung
  for (let i = 0; i < 3; i++) {
    const a = 0.6 + i * 2.2, d = 19, x = Math.cos(a) * d, z = Math.sin(a) * d, c = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 1), M(0xffffff, { map: plankTex('#7a5232') })); bed.position.y = 0.75; c.add(bed);
    for (const sz of [-0.55, 0.55]) { const wh = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 6, 16), darkWood); wh.position.set(0.2, 0.42, sz); c.add(wh); for (let k = 0; k < 4; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.8, 0.04), darkWood); sp.rotation.z = k * Math.PI / 4; sp.position.set(0.2, 0.42, sz); c.add(sp); } }
    for (const sz of [-0.3, 0.3]) { const hd = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 5), wood); hd.rotation.z = Math.PI / 2 - 0.25; hd.position.set(-1.3, 0.7, sz); c.add(hd); }
    for (let k = 0; k < 6; k++) { const sack = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), M(0xc8b080, { roughness: 1 })); sack.scale.set(1, 0.8, 0.9); sack.position.set(-0.5 + (k % 3) * 0.45, 1.1 + Math.floor(k / 3) * 0.2, -0.2 + Math.floor(k / 3) * 0.3); c.add(sack); }
    c.position.set(x, heightAt(x, z), z); c.rotation.y = -a + 0.6; G.add(shadow(c));
  }
  for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3, d = 18.6, x = Math.cos(a) * d, z = Math.sin(a) * d; const pts = []; for (let j = 0; j <= 8; j++) pts.push(new THREE.Vector2(0.28 + Math.sin(j / 8 * Math.PI) * 0.06, j * 0.11)); const b = new THREE.Mesh(new THREE.LatheGeometry(pts, 14), M(0x6a4422)); b.position.set(x, heightAt(x, z), z); b.castShadow = true; G.add(b); }
  const pigeons = flock(8, 'pigeon', 13.5, 19, heightAt, r); pigeons.list.forEach((p) => G.add(p));
  const sm = smoke(grills.map((s) => s.position.clone().add(new THREE.Vector3(0, 1.2, 0))), 0xdddddd, 0.8); G.add(sm.pts);
  return {
    group: G, grassClear: 19.9, cabins: true,
    update(dt, t, night) {
      anims.forEach((f) => f(dt, t)); pigeons.update(dt, t); sm.update(dt);
      lanterns.forEach((l, i) => { l.lg.rotation.z = Math.sin(t * 1.6 + l.ph) * 0.12; l.body.material.emissiveIntensity = 0.5 + night * 2.2; l.gl.material.opacity = 0.15 + night * 0.7; });
    },
  };
}

// ================================================================= MODERN
function modern(ctx) {
  const { heightAt } = ctx, r = rng(37), G = new THREE.Group(), anims = [], winMats = [], lampGlows = [], cars = [];
  // plaza berubin + trotoar + jalan aspal melingkar
  G.add(groundDisc(17.8, M(0xffffff, { map: tileTex(), roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -1 }), heightAt, 0.07, 96));
  const side = new THREE.Mesh(conform(ringStrip(17.8, 18.7, 160, 60, 2), heightAt, 0.1), M(0xb8b4aa, { roughness: 0.8 })); side.receiveShadow = true; G.add(side);
  const road = new THREE.Mesh(conform(ringStrip(18.7, 21.6, 160, 40, 5), heightAt, 0.09), M(0xffffff, { map: asphaltTex(), roughness: 0.6 })); road.receiveShadow = true; G.add(road);
  const curb = new THREE.Mesh(conform(ringStrip(21.6, 22.3, 160, 60, 2), heightAt, 0.12), M(0xb8b4aa, { roughness: 0.8 })); G.add(curb);
  // rumah minimalis
  const wallCols = [0xf2efe6, 0xe8e4dc, 0xd8d4cc, 0xf5f0e8, 0xcfd6dc, 0xeae0d0, 0xdedad2];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3, d = 27 + r() * 2, x = Math.cos(a) * d, z = Math.sin(a) * d, h = new THREE.Group(), w = 6.5 + r(), dp = 5.5;
    const wall = M(wallCols[i]), wood = M(0xffffff, { map: plankTex('#8a5a32'), roughness: 0.7 }), dark = M(0x2a2c30, { roughness: 0.5, metalness: 0.3 });
    const g1 = new THREE.Mesh(new THREE.BoxGeometry(w, 3, dp), wall); g1.position.y = 1.5; h.add(g1);
    const g2 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.65, 2.7, dp * 0.9), wood); g2.position.set(-w * 0.17, 4.35, -0.2); h.add(g2);
    const slab1 = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.22, dp + 0.4), dark); slab1.position.y = 3.05; h.add(slab1);
    const slab2 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.65 + 0.5, 0.22, dp * 0.9 + 0.5), dark); slab2.position.set(-w * 0.17, 5.8, -0.2); h.add(slab2);
    const wm = new THREE.MeshStandardMaterial({ map: windowTex(), emissive: 0xffd9a0, emissiveIntensity: 0.05, roughness: 0.1, metalness: 0.3 }); winMats.push(wm);
    const big = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.45, 2), wm); big.position.set(w * 0.18, 1.45, dp / 2 + 0.01); h.add(big);
    const up = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.4, 1.6), wm); up.position.set(-w * 0.17, 4.4, dp * 0.45 - 0.19); h.add(up);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2), M(0x3a2a1a)); door.position.set(-w * 0.32, 1.1, dp / 2 + 0.01); h.add(door);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.04), M(0xc8ccd6, { metalness: 0.9 })); handle.position.set(-w * 0.32 + 0.4, 1.1, dp / 2 + 0.04); h.add(handle);
    const solar = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 1.4), M(0x1a2a5a, { metalness: 0.7, roughness: 0.2 })); solar.position.set(w * 0.25, 3.4, -0.5); solar.rotation.x = -0.35; h.add(solar);
    const hedge = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.7, 0.6), M(0x3a6a2a, { roughness: 1 })); hedge.position.set(0, 0.35, dp / 2 + 1.6); h.add(hedge);
    h.position.set(x, heightAt(x, z), z); h.lookAt(0, h.position.y, 0);
    G.add(shadow(h));
  }
  // lampu jalan
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, d = 22.8, x = Math.cos(a) * d, z = Math.sin(a) * d, l = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 4.4, 8), M(0x2a2c30, { metalness: 0.7, roughness: 0.4 })); pole.position.y = 2.2; l.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.2), pole.material); arm.position.set(0, 4.35, 0.55); l.add(arm);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.5), glowMat(0xfff0d0, 0.2)); head.position.set(0, 4.28, 1.1); l.add(head);
    const gl = sprite(0xffe8c0, 2.4, 0); gl.position.set(0, 4.1, 1.1); l.add(gl); lampGlows.push({ gl, head });
    l.position.set(x, heightAt(x, z), z); l.lookAt(0, l.position.y, 0); G.add(shadow(l));
  }
  // mobil berjalan di jalan melingkar
  const carCols = [0xc0392b, 0x2980b9, 0xf2efe6, 0x2a2a2a];
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Group(), col = carCols[i];
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 3.8), M(col, { metalness: 0.6, roughness: 0.3 })); body.position.y = 0.55; c.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2), M(0x1a2230, { metalness: 0.4, roughness: 0.1 })); cab.position.set(0, 1.05, -0.2); c.add(cab);
    for (const sx of [-0.85, 0.85]) for (const sz of [-1.25, 1.25]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.25, 12), M(0x111111)); w.rotation.z = Math.PI / 2; w.position.set(sx, 0.32, sz); c.add(w); }
    const hl = [], tl = [];
    for (const sx of [-0.6, 0.6]) { const h1 = sprite(0xfff4d0, 0.8, 0); h1.position.set(sx, 0.6, 1.95); c.add(h1); hl.push(h1); const t1 = sprite(0xff2a1a, 0.5, 0); t1.position.set(sx, 0.62, -1.95); c.add(t1); tl.push(t1); }
    const lane = i % 2 ? 19.5 : 20.8, dir = i % 2 ? -1 : 1;
    c.userData = { ang: i * 1.6, lane, dir, sp: (0.11 + r() * 0.04), hl, tl };
    G.add(shadow(c)); cars.push(c);
  }
  // bangku taman, pot tanaman, tempat sampah
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.26, d = 16.6, x = Math.cos(a) * d, z = Math.sin(a) * d, b = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.5), M(0xffffff, { map: plankTex('#9a6a3a') })); seat.position.y = 0.5; b.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.06), seat.material); back.position.set(0, 0.8, -0.24); b.add(back);
    for (const sx of [-0.8, 0.8]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.5), M(0x2a2c30, { metalness: 0.6 })); leg.position.set(sx, 0.25, 0); b.add(leg); }
    b.position.set(x, heightAt(x, z), z); b.lookAt(0, b.position.y, 0); G.add(shadow(b));
    const pa = a + 0.26, px = Math.cos(pa) * 16.8, pz = Math.sin(pa) * 16.8, pot = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), M(0x8a8a86, { roughness: 0.6 })); box.position.y = 0.3; pot.add(box);
    const tree = new THREE.Mesh(new THREE.IcosahedronGeometry(0.65, 1), M(0x3f7a3a, { roughness: 1 })); tree.position.y = 1.6; pot.add(tree);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.8, 6), M(0x5a3a22)); trunk.position.y = 0.95; pot.add(trunk);
    pot.position.set(px, heightAt(px, pz), pz); G.add(shadow(pot));
  }
  // papan nama desa bercahaya
  { const a = Math.PI / 2 + 0.15, d = 23.6, x = Math.cos(a) * d, z = Math.sin(a) * d, s = new THREE.Group();
    const [c, xx] = cnv(512, 128); xx.fillStyle = '#101418'; xx.fillRect(0, 0, 512, 128); xx.font = '700 64px sans-serif'; xx.textAlign = 'center'; xx.fillStyle = '#7dd3fc'; xx.shadowColor = '#38bdf8'; xx.shadowBlur = 18; xx.fillText('DESA MODERN', 256, 86);
    const st = new THREE.CanvasTexture(c); st.colorSpace = THREE.SRGBColorSpace;
    const signM = new THREE.MeshStandardMaterial({ map: st, emissive: 0xffffff, emissiveMap: st, emissiveIntensity: 0.6 }); winMats.push(signM);
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.8, 0.12), [M(0x2a2c30), M(0x2a2c30), M(0x2a2c30), M(0x2a2c30), signM, M(0x2a2c30)]); board.position.y = 1.4; s.add(board);
    for (const sx of [-1.3, 1.3]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), M(0x2a2c30)); p.position.set(sx, 0.5, 0); s.add(p); }
    s.position.set(x, heightAt(x, z), z); s.lookAt(0, s.position.y, 0); G.add(shadow(s));
  }
  return {
    group: G, grassClear: 22.4, cabins: false,
    update(dt, t, night) {
      for (const c of cars) {
        const u = c.userData; u.ang += dt * u.sp * u.dir;
        const x = Math.cos(u.ang) * u.lane, z = Math.sin(u.ang) * u.lane;
        c.position.set(x, heightAt(x, z) + 0.05, z);
        c.rotation.y = Math.atan2(-Math.sin(u.ang) * u.dir, Math.cos(u.ang) * u.dir);
        u.hl.forEach((h) => (h.material.opacity = night * 0.95)); u.tl.forEach((h) => (h.material.opacity = 0.2 + night * 0.7));
      }
      lampGlows.forEach((l) => { l.gl.material.opacity = night * 0.85; l.head.material.emissiveIntensity = 0.2 + night * 3; });
      winMats.forEach((m) => (m.emissiveIntensity = 0.05 + night * 1.6));
    },
  };
}


// ================================================================= KANTOR TBR (indoor)
function starPanelTex() {
  if (TX.star) return TX.star; const S = 512, [c, x] = cnv(S); x.fillStyle = '#3a3a3c'; x.fillRect(0, 0, S, S);
  const cell = S / 4; x.fillStyle = '#e8e6e0';
  const star8 = (cx, cy, r) => { x.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, rr = i % 2 ? r * 0.42 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); x.fill(); };
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    const cx = gx * cell + cell / 2, cy = gy * cell + cell / 2;
    if ((gx + gy) % 2 === 0) { star8(cx, cy, cell * 0.42); x.fillStyle = '#3a3a3c'; star8(cx, cy, cell * 0.12); x.fillStyle = '#e8e6e0'; }
    else { // motif kotak bertingkat
      x.save(); x.translate(cx, cy); x.rotate(Math.PI / 4); x.fillRect(-cell * 0.22, -cell * 0.22, cell * 0.44, cell * 0.44); x.fillStyle = '#3a3a3c'; x.fillRect(-cell * 0.13, -cell * 0.13, cell * 0.26, cell * 0.26); x.fillStyle = '#e8e6e0'; x.fillRect(-cell * 0.06, -cell * 0.06, cell * 0.12, cell * 0.12); x.restore();
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { x.fillRect(cx + dx * cell * 0.36 - 6, cy + dy * cell * 0.36 - 6, 12, 12); }
    }
  }
  return (TX.star = texOf(c, 3, 1));
}
function ceilingTex() {
  if (TX.ceil) return TX.ceil; const [c, x] = cnv(256); x.fillStyle = '#e9e9e6'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2500; i++) { x.fillStyle = 'rgba(0,0,0,.05)'; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  x.fillStyle = '#c8c8c4'; x.fillRect(0, 0, 256, 4); x.fillRect(0, 0, 4, 256);
  return (TX.ceil = texOf(c, 14, 14));
}
function carpetTex() {
  if (TX.carpet) return TX.carpet; const [c, x] = cnv(256); x.fillStyle = '#6a6e74'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) { const v = 90 + Math.random() * 40; x.fillStyle = `rgba(${v},${v + 4},${v + 10},.5)`; x.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5); }
  x.strokeStyle = 'rgba(40,44,50,.5)'; x.lineWidth = 2; x.strokeRect(1, 1, 254, 254);
  return (TX.carpet = texOf(c, 12, 12));
}
function concreteTex() {
  if (TX.conc) return TX.conc; const [c, x] = cnv(256); x.fillStyle = '#3c3d40'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) { const v = 45 + Math.random() * 30; x.fillStyle = `rgba(${v},${v},${v + 3},.6)`; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  return (TX.conc = texOf(c, 6, 2));
}
function screenTex(seed) {
  const k = 'scr' + seed; if (TX[k]) return TX[k]; const [c, x] = cnv(256, 160), rr = rng(seed + 3);
  x.fillStyle = '#16191f'; x.fillRect(0, 0, 256, 160); x.fillStyle = '#2a2f3a'; x.fillRect(0, 0, 256, 16); x.fillRect(0, 16, 46, 144);
  for (let i = 0; i < 12; i++) { x.fillStyle = ['#7dd3fc', '#fbbf24', '#e5e7eb', '#86efac'][i % 4]; x.fillRect(56, 26 + i * 10, 40 + rr() * 150, 4); }
  if (seed % 2) { x.fillStyle = '#fbbf24'; for (let i = 0; i < 8; i++) x.fillRect(150 + i * 12, 140 - rr() * 70, 8, 200); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (TX[k] = t);
}
function whiteboardTex() {
  if (TX.wb) return TX.wb; const [c, x] = cnv(512, 320); x.fillStyle = '#f8f8f6'; x.fillRect(0, 0, 512, 320);
  x.lineWidth = 2.5; x.lineCap = 'round';
  for (let i = 0; i < 9; i++) { x.strokeStyle = i % 3 === 0 ? '#2a3a8a' : '#c0201a'; let px = 30 + (i % 3 === 0 ? 0 : 120), py = 34 + i * 30; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 26; k++) { px += 8 + Math.random() * 5; x.lineTo(px, py + (Math.random() - 0.5) * 6); } x.stroke(); }
  x.strokeStyle = '#2a3a8a'; x.beginPath(); x.moveTo(110, 20); x.lineTo(110, 300); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (TX.wb = t);
}
function triangleMuralTex() {
  if (TX.tri) return TX.tri; const [c, x] = cnv(256, 512); const cols = ['#1e3a8a', '#2563eb', '#f2efe6', '#fbbf24', '#0b2a6a', '#60a5fa'];
  for (let y = 0; y < 8; y++) for (let i = 0; i < 4; i++) for (const up of [0, 1]) { x.fillStyle = cols[Math.floor(Math.random() * cols.length)]; x.beginPath(); const X0 = i * 64, Y0 = y * 64; if (up) { x.moveTo(X0, Y0); x.lineTo(X0 + 64, Y0); x.lineTo(X0, Y0 + 64); } else { x.moveTo(X0 + 64, Y0); x.lineTo(X0 + 64, Y0 + 64); x.lineTo(X0, Y0 + 64); } x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (TX.tri = t);
}
function signTex(text, sub) {
  const [c, x] = cnv(1024, 320); x.clearRect(0, 0, 1024, 320);
  x.font = '800 220px "Nunito Sans", Arial, sans-serif'; x.textAlign = 'center'; x.fillStyle = '#ffd21f'; x.shadowColor = '#ffb800'; x.shadowBlur = 30; x.fillText(text, 512, 220);
  if (sub) { x.font = '700 44px "Nunito Sans", Arial, sans-serif'; x.shadowBlur = 10; x.fillText(sub, 512, 290); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function office(ctx) {
  const { heightAt, village } = ctx, r = rng(53), G = new THREE.Group(), H = 17.5, Y0 = heightAt(0, 0) + 0.02, CH = 5.6;
  const lights = [], neon = [], screens = [];
  // lantai karpet
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, H * 2), M(0xc8ccd4, { map: carpetTex(), roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.y = Y0; floor.receiveShadow = true; G.add(floor);
  // dinding (menghadap ke dalam; dari luar transparan seperti rumah boneka)
  const wallM = M(0xffffff, { map: concreteTex(), roughness: 0.9 });
  const walls = [[0, -H, 0], [H, 0, -Math.PI / 2], [0, H, Math.PI], [-H, 0, Math.PI / 2]];
  for (const [x, z, ry] of walls) { const w = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, CH), wallM); w.position.set(x, Y0 + CH / 2, z); w.rotation.y = ry; w.receiveShadow = true; G.add(w); }
  // plafon (menghadap ke bawah) + lampu panel + AC kaset + lis lampu kuning
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, H * 2), M(0xffffff, { map: ceilingTex(), roughness: 0.95, emissive: 0xffffff, emissiveMap: ceilingTex(), emissiveIntensity: 0.25 })); ceil.material.side = THREE.DoubleSide; ceil.rotation.x = Math.PI / 2; ceil.position.y = Y0 + CH;
  const CG = new THREE.Group(); G.add(CG); CG.add(ceil); // plafon + lampu + AC: hanya tampil saat kamera di dalam ruangan
  for (let gx = -2; gx <= 2; gx++) for (let gz = -2; gz <= 2; gz++) { if (Math.abs(gx) === 2 && Math.abs(gz) === 2) continue;
    if ((gx + gz) % 2 === 0) { const lp = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.4), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f8ff, emissiveIntensity: 1.6 })); lp.rotation.x = Math.PI / 2; lp.position.set(gx * 6, Y0 + CH - 0.01, gz * 6); CG.add(lp); lights.push(lp.material); }
    else { const ac = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 1.5), M(0xeeeeec, { roughness: 0.6 })); ac.position.set(gx * 6, Y0 + CH - 0.09, gz * 6); CG.add(ac); const vent = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), M(0x9a9a98)); vent.rotation.x = Math.PI / 2; vent.position.set(gx * 6, Y0 + CH - 0.19, gz * 6); CG.add(vent); }
  }
  // bulkhead/soffit gelap di tepi plafon dengan lampu kuning di bawahnya (ciri khas ruangan)
  const sof = M(0x4a4b4e, { roughness: 0.8 }), yellowM = new THREE.MeshStandardMaterial({ color: 0x222200, emissive: 0xffc800, emissiveIntensity: 2.2 });
  for (const [x, z, ry] of walls) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(H * 2, 0.9, 2.2), sof); b.position.set(x * 0.948, Y0 + CH - 0.45, z * 0.948); b.rotation.y = ry; CG.add(b);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(H * 2 - 4, 0.08, 0.14), yellowM); strip.position.set(x * 0.895, Y0 + CH - 0.92, z * 0.895); strip.rotation.y = ry; G.add(strip);
  }
  neon.push(yellowM);
  // dinding utara: panel ornamen bintang + LED hangat + whiteboard
  { const z = -H + 0.05, panel = new THREE.Mesh(new THREE.PlaneGeometry(16, 4.2), M(0xffffff, { map: starPanelTex(), roughness: 0.7 })); panel.position.set(-3, Y0 + 2.85, z); G.add(panel);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.25, 0.3), M(0xffffff, { map: plankTex('#c8a46a') })); frame.position.set(-3, Y0 + 1.15, z + 0.12); G.add(frame);
    const frameT = frame.clone(); frameT.position.y = Y0 + 4.5; G.add(frameT);
    const led = new THREE.Mesh(new THREE.BoxGeometry(14, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0x221100, emissive: 0xffc070, emissiveIntensity: 2.5 })); led.position.set(-3, Y0 + 4.38, z + 0.2); G.add(led); neon.push(led.material);
    const wb = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.1), new THREE.MeshStandardMaterial({ map: whiteboardTex(), roughness: 0.3 })); wb.position.set(0.5, Y0 + 2.5, z + 0.3); G.add(wb);
    const wbF = new THREE.Mesh(new THREE.BoxGeometry(3.5, 2.2, 0.05), M(0xc8ccd6, { metalness: 0.7 })); wbF.position.set(0.5, Y0 + 2.5, z + 0.26); G.add(wbF);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.05, 0.12), M(0xc8ccd6, { metalness: 0.7 })); tray.position.set(0.5, Y0 + 1.43, z + 0.34); G.add(tray);
  }
  // dinding timur: papan nama TBR menyala + mural segitiga
  { const x = H - 0.06;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.9), new THREE.MeshBasicMaterial({ map: signTex('TBR', 'Transaction Banking Retail'), transparent: true, toneMapped: false })); sign.position.set(x, Y0 + 3.5, 2); sign.rotation.y = -Math.PI / 2; G.add(sign);
    const sg = sprite(0xffc800, 7, 0.25); sg.position.set(x - 0.5, Y0 + 3.5, 2); G.add(sg); neon.push({ sprite: sg });
    const mural = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 4.6), M(0xffffff, { map: triangleMuralTex(), roughness: 0.6 })); mural.position.set(x, Y0 + 2.4, 7.5); mural.rotation.y = -Math.PI / 2; G.add(mural);
    const tv = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 2), M(0x111111, { metalness: 0.5 })); tv.position.set(x - 0.08, Y0 + 2.9, -4); G.add(tv);
    const tvS = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.1), new THREE.MeshStandardMaterial({ map: screenTex(99), emissive: 0xffffff, emissiveMap: screenTex(99), emissiveIntensity: 0.8 })); tvS.position.set(x - 0.14, Y0 + 2.9, -4); tvS.rotation.y = -Math.PI / 2; G.add(tvS); screens.push(tvS.material);
  }
  // pintu kaca di dinding selatan
  { const z = H - 0.06, d = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3), new THREE.MeshStandardMaterial({ color: 0x9fc4d8, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.5 })); d.position.set(-9, Y0 + 1.5, z); d.rotation.y = Math.PI; G.add(d); const fr = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.1, 0.08), M(0x2a2c30, { metalness: 0.6 })); fr.position.set(-9, Y0 + 1.55, z + 0.02); G.add(fr); }
  // meja kerja: 4 kelompok, masing-masing 4 meja berhadapan
  const desk = M(0xf0e6d2, { roughness: 0.5 }), legM = M(0xb8bcc4, { metalness: 0.7, roughness: 0.3 }), black = M(0x16181c, { roughness: 0.5 }), orange = M(0xf26a1b, { roughness: 0.5 });
  const chair = () => {
    const c = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.55), black); seat.position.y = 0.5; c.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.08), black); back.position.set(0, 0.95, -0.25); back.rotation.x = 0.1; c.add(back);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), legM); post.position.y = 0.28; c.add(post);
    for (let k = 0; k < 5; k++) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.32), legM); leg.position.set(Math.sin(k / 5 * Math.PI * 2) * 0.14, 0.06, Math.cos(k / 5 * Math.PI * 2) * 0.14); leg.rotation.y = k / 5 * Math.PI * 2; c.add(leg); }
    for (const sx of [-0.28, 0.28]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.35), black); arm.position.set(sx, 0.72, 0); c.add(arm); }
    return c;
  };
  const deskUnit = (seed) => {
    const u = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.8), desk); top.position.y = 0.75; u.add(top);
    for (const sx of [-0.75, 0.75]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 0.7), legM); l.position.set(sx, 0.375, 0); u.add(l); }
    const mon = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.4, 0.04), black); mon.position.set(0, 1.08, -0.22); u.add(mon);
    const sm = new THREE.MeshStandardMaterial({ map: screenTex(seed), emissive: 0xffffff, emissiveMap: screenTex(seed), emissiveIntensity: 0.9 }); screens.push(sm);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.36), sm); scr.position.set(0, 1.08, -0.199); u.add(scr);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 0.06), black); stand.position.set(0, 0.88, -0.24); u.add(stand);
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.02, 0.15), black); kb.position.set(0, 0.785, 0.05); u.add(kb);
    if (seed % 3 !== 1) { const tr = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.28), orange); tr.position.set(-0.58, 0.84, -0.15); u.add(tr); }
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.28, 10), M([0x38bdf8, 0xe0341e, 0x2a2a2a][seed % 3], { roughness: 0.3, metalness: 0.2 })); bottle.position.set(0.6, 0.92, -0.1); u.add(bottle);
    if (seed % 2) { const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 10), M(0xf2efe6)); mug.position.set(0.45, 0.83, 0.12); u.add(mug); }
    const papers = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04 + (seed % 3) * 0.03, 0.22), M(0xf8f8f4)); papers.position.set(-0.3, 0.8, 0.15); papers.rotation.y = 0.2; u.add(papers);
    const ch = chair(); ch.position.set(0, 0, 0.75); ch.rotation.y = Math.PI + (r() - 0.5) * 0.6; u.add(ch);
    return u;
  };
  let seed = 1;
  for (const [cx, cz, ry] of [[-12, -11.5, 0.78], [12, -11.5, -0.78], [-12, 11.5, 2.36], [12, 11.5, -2.36], [-15, 0, 1.57], [15, 0, -1.57]]) {
    const cl = new THREE.Group();
    for (const [dx, dz, rr] of [[-0.82, -0.42, 0], [0.82, -0.42, 0], [-0.82, 0.42, Math.PI], [0.82, 0.42, Math.PI]]) { const u = deskUnit(seed++); u.position.set(dx, 0, dz); u.rotation.y = rr; cl.add(u); }
    const divider = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.45, 0.04), M(0xcfd2d8, { roughness: 0.6 })); divider.position.y = 1.0; cl.add(divider);
    cl.position.set(cx, Y0, cz); cl.rotation.y = ry; G.add(shadow(cl));
  }
  // kursi tambahan, tanaman, dispenser air, kamera CCTV
  for (const [x, z] of [[-16.6, -6], [16.6, -7], [6, -16.6], [-5, 16.6]]) { const pl = new THREE.Group(); const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.6, 12), M(0xf2efe6)); pot.position.y = 0.3; pl.add(pot); for (let k = 0; k < 7; k++) { const lf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.1, 4), M(0x2f6a2a)); lf.position.set(Math.sin(k) * 0.12, 1.1, Math.cos(k) * 0.12); lf.rotation.set(Math.cos(k) * 0.4, 0, Math.sin(k) * 0.4); pl.add(lf); } pl.position.set(x, Y0, z); G.add(shadow(pl)); }
  { const dsp = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 0.4), M(0xe8e8e6)); body.position.y = 0.55; dsp.add(body); const gal = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.45, 12), new THREE.MeshStandardMaterial({ color: 0x8ecae6, transparent: true, opacity: 0.6, roughness: 0.1 })); gal.position.y = 1.33; dsp.add(gal); dsp.position.set(16.7, Y0, 6); G.add(shadow(dsp)); }
  { const cam = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(0x222222, { roughness: 0.2 })); cam.rotation.x = Math.PI; cam.position.set(8, Y0 + CH - 0.95, -13); CG.add(cam); }
  return {
    group: G, grassClear: 999, cabins: false, indoor: true,
    update(dt, t, night) {
      if (village) { const c = village.camera.position; CG.visible = c.y < Y0 + CH - 0.2 && Math.abs(c.x) < H && Math.abs(c.z) < H; }
      // pencahayaan dalam ruangan: terang merata, malam hari lampu sedikit redup & lampu kuning lebih menonjol
      if (village) {
        village.hemi.intensity = 2.1 - night * 0.6; village.hemi.color.set(0xf4f6ff); village.hemi.groundColor.set(0x5a5a60);
        village.sun.intensity = 1.3; village.sun.color.set(0xfff4e6);
        village.scene.fog.color.set(0x2a2b2e); village.scene.fog.density = 0.004;
        village.renderer.toneMappingExposure = 1.1;
      }
      lights.forEach((m) => (m.emissiveIntensity = 1.7 - night * 0.8));
      neon.forEach((n) => { if (n.sprite) n.sprite.material.opacity = 0.2 + night * 0.25; else n.emissiveIntensity = 2.2 + night * 1.2 + Math.sin(t * 2) * 0.05; });
      screens.forEach((m, i) => (m.emissiveIntensity = 0.8 + Math.sin(t * 0.7 + i) * 0.08));
    },
  };
}

export function buildTheme(name, ctx) {
  const t = name === 'pasar' ? pasar(ctx) : name === 'modern' ? modern(ctx) : name === 'kantor' ? office(ctx) : kampung(ctx);
  t.group.visible = false; ctx.scene.add(t.group);
  return t;
}
