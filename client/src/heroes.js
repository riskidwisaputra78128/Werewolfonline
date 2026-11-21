// Karakter "hero" bergaya fantasi ala render Blender:
// tubuh ramping, jubah panjang berlipat yang berkibar, cape, pauldron logam, kerah tinggi,
// rambut bergaya, mata bercahaya, orb sihir di tangan, kristal melayang, dan aura di kaki.
// API sama dengan createBiped: { root, mats, update(dt, speed, s), setDead(bool) }
import * as THREE from 'three';

// ---------------------------------------------------------------- util
function hash(str) { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let s = seed || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9 >>> 0) / 4294967296); }
const pick = (r, a) => a[Math.floor(r() * a.length)];
const cnv = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const texOf = (c, rep = 1) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, 1); t.anisotropy = 4; return t; };
const cache = {};

/** Kain jubah: tenunan halus + bayangan lipatan + pita bordir emas di bawah */
function robeTexture(hex, trim = '#d8b06a') {
  const key = 'robe' + hex + trim; if (cache[key]) return cache[key];
  const W = 512, H = 512, [c, x] = cnv(W, H), base = new THREE.Color(hex);
  x.fillStyle = hex; x.fillRect(0, 0, W, H);
  // lipatan vertikal (gelap-terang)
  for (let i = 0; i < W; i++) {
    const v = Math.sin(i / W * Math.PI * 18) * 0.5 + Math.sin(i / W * Math.PI * 7 + 1.3) * 0.3;
    x.fillStyle = v > 0 ? `rgba(255,255,255,${v * 0.07})` : `rgba(0,0,0,${-v * 0.28})`;
    x.fillRect(i, 0, 1, H);
  }
  // tenunan
  const img = x.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const p = i / 4, px = p % W, py = (p / W) | 0, n = ((px ^ py) & 3 ? 0 : -10) + (Math.random() - 0.5) * 10; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, 0, 0);
  // pita bordir di bagian bawah (v kecil = keliman)
  const by = H - 70;
  x.fillStyle = `rgba(${(base.r * 120) | 0},${(base.g * 120) | 0},${(base.b * 120) | 0},0.85)`; x.fillRect(0, by, W, 70);
  x.strokeStyle = trim; x.lineWidth = 3; x.shadowColor = trim; x.shadowBlur = 4;
  for (const yy of [by + 4, by + 62]) { x.beginPath(); x.moveTo(0, yy); x.lineTo(W, yy); x.stroke(); }
  x.lineWidth = 2.2;
  for (let i = 0; i < 16; i++) { // motif berlian + rune
    const cx = (i + 0.5) * W / 16, cy = by + 33;
    x.beginPath(); x.moveTo(cx, cy - 18); x.lineTo(cx + 12, cy); x.lineTo(cx, cy + 18); x.lineTo(cx - 12, cy); x.closePath(); x.stroke();
    x.beginPath(); x.arc(cx, cy, 4, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.moveTo(cx + 16, cy - 10); x.lineTo(cx + 16, cy + 10); x.stroke();
  }
  // gradasi gelap ke atas (kesan dalam)
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(0,0,0,.25)'); g.addColorStop(0.6, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, W, by);
  return (cache[key] = texOf(c, 2));
}
function plainCloth(hex) {
  const key = 'pc' + hex; if (cache[key]) return cache[key];
  const [c, x] = cnv(128); x.fillStyle = hex; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1800; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},.05)`; x.fillRect(Math.random() * 128, Math.random() * 128, 2, 1); }
  return (cache[key] = texOf(c, 2));
}
function ringTex() {
  if (cache.ring) return cache.ring;
  const s = 256, [c, x] = cnv(s), m = s / 2;
  const g = x.createRadialGradient(m, m, m * 0.35, m, m, m);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,.55)'); g.addColorStop(0.7, 'rgba(255,255,255,.15)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 2;
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; x.beginPath(); x.arc(m + Math.cos(a) * m * 0.62, m + Math.sin(a) * m * 0.62, 4, 0, Math.PI * 2); x.stroke(); }
  x.beginPath(); x.arc(m, m, m * 0.62, 0, Math.PI * 2); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (cache.ring = t);
}
function glowTex() {
  if (cache.glow) return cache.glow;
  const s = 64, [c, x] = cnv(s), g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (cache.glow = t);
}
function featherTex() {
  if (cache.feather) return cache.feather;
  const W = 256, H = 512, [c, x] = cnv(W, H);
  for (let row = 0; row < 7; row++) for (let i = 0; i < 9; i++) {
    const px = 20 + i * 26 + (row % 2) * 13, py = 30 + row * 70, len = 120 - row * 6;
    const g = x.createLinearGradient(px, py, px, py + len); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(220,225,245,.0)');
    x.fillStyle = g; x.beginPath(); x.ellipse(px, py + len / 2, 13, len / 2, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(170,180,210,.5)'; x.beginPath(); x.moveTo(px, py); x.lineTo(px, py + len); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (cache.feather = t);
}

/** Material yang berkibar (shader vertex): makin ke bawah makin lebar ayunannya */
export function sway(mat, uTime, o) {
  const { top, bottom, amp = 0.06, back = 0, phase = 0 } = o;
  const uPhase = { value: phase }, uWind = { value: 1 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime; sh.uniforms.uPhase = uPhase; sh.uniforms.uWind = uWind;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uPhase; uniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float k = clamp((${top.toFixed(3)} - position.y) / ${(top - bottom).toFixed(3)}, 0.0, 1.0); k *= k;
        float w = uWind * ${amp.toFixed(3)} * k;
        transformed.x += sin(uTime * 1.8 + uPhase + position.y * 3.5 + position.z * 4.0) * w;
        transformed.z += (sin(uTime * 1.3 + uPhase * 1.7 + position.x * 5.0) * 0.6 ${back ? '- 0.9' : ''}) * w;`);
  };
  mat.customProgramCacheKey = () => `sway${top}|${bottom}|${amp}|${back}`;
  mat.userData.wind = uWind;
  return mat;
}

function capsule(r, len, mat, seg = 10) {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len - r * 2), 4, seg); g.translate(0, -len / 2, 0);
  return new THREE.Mesh(g, mat);
}
/** tabung tipis antara dua titik (untuk garis trim bercahaya) */
function rod(a, b, r, mat) {
  const d = b.clone().sub(a), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 5), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

const SKIN = [0xf1d0b5, 0xe2b393, 0xc68b62, 0x8d5a3b, 0xd8c8ff, 0x9fb6d8, 0xf4e4d4];
const HAIR = [0xf3f1ea, 0x1a1418, 0x2b1b12, 0xb8bcc8, 0x8a1c1c, 0xd9b36a, 0x3a2a5a, 0x5a3a22];
const ARMOR = [{ c: 0xc9a14a, m: 0.95, r: 0.28 }, { c: 0xb8c0cc, m: 0.95, r: 0.25 }, { c: 0x2a2a33, m: 0.8, r: 0.35 }, { c: 0x8a5a2a, m: 0.9, r: 0.3 }];

/**
 * @param {object} o {color:'#hex', seed:any, uTime:{value}, style?:'angel', robe?:'#hex'}
 */
export function createHero(o = {}) {
  const r = rng(hash(o.seed ?? Math.random()));
  const uTime = o.uTime || { value: 0 };
  const accent = new THREE.Color(o.color || '#c0392b');
  const angel = o.style === 'angel';
  const coat = !angel && r() < 0.45;                // mantel terbuka (kaki terlihat) vs jubah panjang
  const robeHex = o.robe || '#' + accent.clone().multiplyScalar(angel ? 1 : 0.55 + r() * 0.2).getHexString();
  const innerHex = angel ? '#e9e6f2' : pick(r, ['#15121a', '#1d1a24', '#2a2230', '#e7e2d6', '#26201a']);
  const armorDef = angel ? ARMOR[0] : pick(r, ARMOR);
  const phase = r() * 10;

  const mats = [];
  const robeMat = sway(new THREE.MeshStandardMaterial({ map: robeTexture(robeHex), roughness: 0.78, side: THREE.DoubleSide }), uTime, { top: 1.02, bottom: 0.05, amp: 0.05, phase });
  const innerMat = new THREE.MeshStandardMaterial({ map: plainCloth(innerHex), roughness: 0.85 });
  const capeMat = sway(new THREE.MeshStandardMaterial({ map: robeTexture('#' + accent.clone().multiplyScalar(angel ? 0.95 : 0.4).getHexString(), angel ? '#d8b06a' : '#' + accent.getHexString()), roughness: 0.8, side: THREE.DoubleSide }), uTime, { top: 0, bottom: -1.6, amp: 0.16, back: 1, phase: phase + 2 });
  const armor = new THREE.MeshStandardMaterial({ color: armorDef.c, metalness: armorDef.m, roughness: armorDef.r, envMapIntensity: 1 });
  const skin = new THREE.MeshStandardMaterial({ color: angel ? 0xf6e8dc : pick(r, SKIN), roughness: 0.55 });
  const hairMat = new THREE.MeshStandardMaterial({ color: angel ? 0xfaf6ea : pick(r, HAIR), roughness: 0.45, metalness: 0.05 });
  const boots = new THREE.MeshStandardMaterial({ color: 0x1a1412, roughness: 0.5, metalness: 0.2 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: accent, emissiveIntensity: 2.6 });
  const trimGlow = sway(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: accent, emissiveIntensity: 1.8, side: THREE.DoubleSide }), uTime, { top: 1.02, bottom: 0.05, amp: 0.05, phase });
  mats.push(robeMat, innerMat, capeMat, skin, hairMat, armor);

  const root = new THREE.Group();
  const rig = new THREE.Group(); rig.scale.setScalar(angel ? 1.12 : 0.97 + r() * 0.08); root.add(rig);
  const shadow = (m) => { m.castShadow = true; return m; };

  // ---------------- pinggul + jubah ----------------
  const HIP = 1.0;
  const hips = new THREE.Group(); hips.position.y = HIP; rig.add(hips);
  const gap = coat ? 0.42 : 0.06;
  const prof = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12, y = 0.05 + t * 0.97; prof.push(new THREE.Vector2(0.16 + Math.pow(1 - t, 1.6) * (angel ? 0.36 : 0.27) + (1 - t) * 0.04, y)); }
  const robeG = new THREE.LatheGeometry(prof, 40, gap, Math.PI * 2 - gap * 2);
  { // lipatan kain nyata (displacement radial)
    const p = robeG.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ph = Math.atan2(x, z), k = Math.pow(1 - (y - 0.05) / 0.97, 1.3);
      const f = 1 + (Math.sin(ph * 9 + y * 2) * 0.05 + Math.sin(ph * 4 + 1) * 0.03) * k;
      p.setXYZ(i, x * f, y, z * f);
    }
    robeG.computeVertexNormals();
  }
  const robe = shadow(new THREE.Mesh(robeG, robeMat)); robe.position.y = -HIP; hips.add(robe);
  // garis keliman bercahaya mengikuti tepi bukaan depan
  for (const s of [1, -1]) {
    const a0 = s > 0 ? gap : -gap;
    const top = new THREE.Vector3(Math.sin(a0) * 0.165, 1.0 - HIP, Math.cos(a0) * 0.165), bot = new THREE.Vector3(Math.sin(a0) * (prof[0].x + 0.01), 0.06 - HIP, Math.cos(a0) * (prof[0].x + 0.01));
    hips.add(rod(top, bot, 0.008, trimGlow));
  }
  const hem = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(prof[0].x + 0.006, 0.05), new THREE.Vector2(prof[1].x + 0.006, 0.09)], 40, gap, Math.PI * 2 - gap * 2), trimGlow);
  hem.position.y = -HIP; hips.add(hem);
  // sabuk + gesper
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 24), armor); belt.rotation.x = Math.PI / 2; belt.position.y = 0.02; belt.scale.set(1.05, 0.8, 1); hips.add(belt);
  const buckle = new THREE.Mesh(new THREE.OctahedronGeometry(0.045), glow); buckle.position.set(0, 0.02, 0.15); buckle.scale.set(1, 1.3, 0.5); hips.add(buckle);
  // kain depan (tabard) yang menjuntai
  const tabG = new THREE.PlaneGeometry(0.16, 0.7, 2, 8); tabG.translate(0, -0.35, 0);
  const tabMat = sway(new THREE.MeshStandardMaterial({ map: robeTexture('#' + accent.clone().multiplyScalar(0.35).getHexString()), roughness: 0.8, side: THREE.DoubleSide }), uTime, { top: 0, bottom: -0.7, amp: 0.05, phase: phase + 1 });
  const tab = new THREE.Mesh(tabG, tabMat); tab.position.set(0, 0, 0.17); tab.rotation.x = -0.12; hips.add(tab);

  // ---------------- kaki ----------------
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sx * 0.09, -0.02, 0); hips.add(hip);
    const thigh = shadow(capsule(0.075, 0.48, coat ? innerMat : boots)); hip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -0.48; hip.add(knee);
    const shin = shadow(capsule(0.06, 0.46, boots)); knee.add(shin);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.08, 10), armor); cuff.position.y = -0.12; knee.add(cuff);
    const foot = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.22), boots)); foot.position.set(0, -0.47, 0.05); knee.add(foot);
    legs.push({ hip, knee });
  }

  // ---------------- dada ----------------
  const chest = new THREE.Group(); chest.position.y = 0.04; hips.add(chest);
  const torsoG = new THREE.CapsuleGeometry(0.16, 0.36, 4, 14); torsoG.translate(0, 0.3, 0);
  { const p = torsoG.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), w = 0.82 + Math.min(1, Math.max(0, (y - 0.05) / 0.45)) * 0.32; p.setX(i, p.getX(i) * w); } torsoG.computeVertexNormals(); }
  const torso = shadow(new THREE.Mesh(torsoG, innerMat)); torso.scale.z = 0.72; chest.add(torso);
  // pelindung dada
  const plate = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), armor);
  plate.scale.set(1.0, 0.9, 0.62); plate.position.set(0, 0.38, 0.02); plate.rotation.x = Math.PI * 0.5; chest.add(plate);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.04), glow); gem.position.set(0, 0.42, 0.135); gem.scale.set(1, 1.4, 0.6); chest.add(gem);
  for (const s of [-1, 1]) chest.add(rod(new THREE.Vector3(s * 0.02, 0.48, 0.13), new THREE.Vector3(s * 0.14, 0.32, 0.09), 0.006, glow));
  // kerah tinggi
  const collar = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.13, 0.24, 18, 1, true, Math.PI * 0.62, Math.PI * 0.76), angel ? armor : capeMat.clone()));
  collar.material.side = THREE.DoubleSide; collar.position.set(0, 0.66, -0.02); collar.rotation.y = Math.PI; chest.add(collar);
  const collarTrim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.008, 4, 20, Math.PI * 0.76), glow);
  collarTrim.rotation.set(Math.PI / 2, 0, Math.PI * 0.62 + Math.PI); collarTrim.position.set(0, 0.78, -0.02); chest.add(collarTrim);

  // cape
  const capeG = new THREE.PlaneGeometry(0.42, 1.45, 8, 18); capeG.translate(0, -0.725, 0);
  { const p = capeG.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), wide = 1 + (-y / 1.45) * 0.45; p.setX(i, x * wide); p.setZ(i, -Math.pow(x * wide, 2) * 1.1 + Math.sin(x * 26) * 0.014 * (-y)); } capeG.computeVertexNormals(); }
  const cape = shadow(new THREE.Mesh(capeG, capeMat)); cape.position.set(0, 0.6, -0.13); cape.rotation.x = 0.1; chest.add(cape);
  cape.visible = angel ? false : r() < 0.75;

  // ---------------- kepala ----------------
  const neck = new THREE.Group(); neck.position.y = 0.68; chest.add(neck);
  const neckM = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.12, 8), skin); neckM.position.y = 0.04; neck.add(neckM);
  const head = new THREE.Group(); head.position.y = 0.1; neck.add(head);
  const skullG = new THREE.SphereGeometry(0.125, 20, 16);
  { const p = skullG.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), z = p.getZ(i); const jaw = y < 0 ? 1 - Math.min(1, -y / 0.125) * 0.35 : 1; p.setX(i, p.getX(i) * 0.86 * jaw); p.setZ(i, z * (z > 0 ? 0.98 : 1.04) * (y < 0 ? 0.9 + jaw * 0.1 : 1)); p.setY(i, y * 1.12); } skullG.computeVertexNormals(); }
  const skull = shadow(new THREE.Mesh(skullG, skin)); skull.position.y = 0.11; head.add(skull);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.05, 4), skin); nose.position.set(0, 0.1, 0.12); nose.rotation.x = Math.PI / 2 - 0.3; head.add(nose);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), glow); eye.position.set(sx * 0.043, 0.13, 0.103); eye.scale.set(1.3, 0.7, 0.6); head.add(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.01), hairMat); brow.position.set(sx * 0.045, 0.158, 0.108); brow.rotation.z = -sx * 0.18; head.add(brow);
  }
  if (angel || r() < 0.4) for (const sx of [-1, 1]) { // telinga elf
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.14, 4), skin); ear.position.set(sx * 0.11, 0.13, -0.01); ear.rotation.set(-0.5, 0, -sx * 1.1); head.add(ear);
  }
  // rambut
  const hairStyle = angel ? 'long' : pick(r, ['long', 'spiky', 'short', 'hood', 'long', 'tail']);
  const cap = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.138, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), hairMat));
  cap.position.set(0, 0.125, -0.012); cap.rotation.x = -0.25; cap.scale.set(0.92, 1.05, 1.05);
  if (hairStyle === 'hood') {
    const hoodM = capeMat.clone(); hoodM.side = THREE.DoubleSide;
    const hood = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.175, 18, 12, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7, 0, Math.PI * 0.7), hoodM));
    hood.position.set(0, 0.12, -0.02); hood.scale.set(0.95, 1.1, 1.1); head.add(hood);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 8), hoodM); tip.position.set(0, 0.2, -0.17); tip.rotation.x = -2.1; head.add(tip);
    head.add(cap);
  } else {
    head.add(cap);
    // poni
    for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), hairMat); f.position.set(-0.06 + i * 0.04, 0.2, 0.09); f.rotation.set(2.4, 0, (i - 1.5) * 0.25); head.add(f); }
    if (hairStyle === 'long' || hairStyle === 'tail') {
      const hm = sway(hairMat.clone(), uTime, { top: 0.1, bottom: -0.45, amp: 0.04, back: 1, phase });
      const backG = new THREE.CapsuleGeometry(0.1, hairStyle === 'long' ? 0.32 : 0.26, 4, 10); backG.translate(0, -0.2, 0);
      const back = shadow(new THREE.Mesh(backG, hm)); back.scale.set(hairStyle === 'long' ? 0.95 : 0.5, 1, 0.45); back.position.set(0, 0.12, -0.08); back.rotation.x = 0.12; head.add(back);
      if (hairStyle === 'long') for (const sx of [-1, 1]) { const lock = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.3, 3, 6), hm)); lock.position.set(sx * 0.1, -0.02, 0.03); lock.rotation.z = sx * 0.12; head.add(lock); }
    }
    if (hairStyle === 'spiky') for (let i = 0; i < 9; i++) {
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2 + r() * 0.1, 5), hairMat); const a = -1.2 + i * 0.3;
      s.position.set(Math.sin(a) * 0.09, 0.2 + Math.cos(a) * 0.03, -0.06 - Math.cos(a) * 0.03); s.rotation.set(-1.0 - r() * 0.3, 0, -a * 0.8); head.add(s);
    }
  }
  // mahkota / tiara bercahaya (acak) atau lingkaran cahaya (angel)
  if (angel) {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 6, 32), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffe2a0, emissiveIntensity: 3 }));
    halo.rotation.x = Math.PI / 2 - 0.25; halo.position.set(0, 0.36, -0.03); head.add(halo);
  } else if (r() < 0.35) {
    const tiara = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.008, 4, 24, Math.PI), armor); tiara.rotation.set(-0.3, 0, 0); tiara.position.set(0, 0.2, 0.0); head.add(tiara);
    const tg = new THREE.Mesh(new THREE.OctahedronGeometry(0.025), glow); tg.position.set(0, 0.25, 0.11); tg.scale.y = 1.6; head.add(tg);
  }

  // ---------------- lengan ----------------
  const arms = [];
  for (const sx of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(sx * 0.215, 0.6, 0); chest.add(sh);
    // pauldron berlapis
    const p1 = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), armor)); p1.scale.set(1.15, 0.8, 1); p1.position.set(sx * 0.03, 0.02, 0); p1.rotation.z = -sx * 0.35; sh.add(p1);
    const p2 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), armor); p2.scale.set(1.15, 0.7, 1); p2.position.set(sx * 0.06, -0.04, 0); p2.rotation.z = -sx * 0.7; sh.add(p2);
    const pt = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.006, 4, 20), glow); pt.rotation.set(Math.PI / 2, -sx * 0.35, 0); pt.position.set(sx * 0.03, 0.0, 0); pt.scale.set(1.15, 1, 1); sh.add(pt);
    if (r() < 0.5 || angel) { const spike = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 5), armor); spike.position.set(sx * 0.08, 0.09, 0); spike.rotation.z = -sx * 0.6; sh.add(spike); }
    const upper = shadow(capsule(0.05, 0.3, innerMat)); sh.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = -0.3; sh.add(elbow);
    const lower = capsule(0.042, 0.26, innerMat); elbow.add(lower);
    // lengan baju lebar ala penyihir
    const sleeveG = new THREE.CylinderGeometry(0.055, 0.12, 0.28, 12, 1, true); sleeveG.translate(0, -0.14, 0);
    const sleeve = shadow(new THREE.Mesh(sleeveG, robeMat.clone())); sleeve.material.side = THREE.DoubleSide; sleeve.material.onBeforeCompile = () => {}; sleeve.rotation.x = 0.1; elbow.add(sleeve);
    const st = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.006, 4, 20), glow); st.rotation.x = Math.PI / 2 + 0.1; st.position.y = -0.275; elbow.add(st);
    const bracer = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.044, 0.09, 10), armor); bracer.position.y = -0.2; elbow.add(bracer);
    const hand = new THREE.Group(); hand.position.y = -0.28; elbow.add(hand);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), skin); palm.scale.set(0.8, 1.1, 0.6); hand.add(palm);
    for (let f = 0; f < 3; f++) { const fg = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.04, 2, 4), skin); fg.position.set((f - 1) * 0.018, -0.05, 0.01); fg.rotation.x = 0.3; hand.add(fg); }
    sh.rotation.z = sx * 0.1;
    arms.push({ sh, elbow, hand, sx });
  }

  // ---------------- sihir: orb, tongkat, kristal, aura ----------------
  const orbHand = arms[r() < 0.5 ? 0 : 1];
  const orb = new THREE.Group(); orb.position.set(0, -0.09, 0.08); orbHand.hand.add(orb);
  const orbCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: accent, emissiveIntensity: 3.5 }));
  const orbGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: accent, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
  orbGlow.scale.setScalar(0.42); orb.add(orbCore, orbGlow);
  const sparkG = new THREE.BufferGeometry(); sparkG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 3), 3));
  const sparks = new THREE.Points(sparkG, new THREE.PointsMaterial({ map: glowTex(), color: accent, size: 0.05, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sparks.frustumCulled = false; orb.add(sparks);
  const otherHand = arms.find((a) => a !== orbHand);
  let staff = null;
  if (angel || r() < 0.5) {
    staff = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 1.75, 6), angel ? armor : new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.6 })); pole.position.y = 0.25; staff.add(pole);
    const fork = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.01, 4, 16, Math.PI * 1.4), armor); fork.position.y = 1.15; fork.rotation.z = -Math.PI * 0.2; staff.add(fork);
    const sc = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: accent, emissiveIntensity: 3 })); sc.scale.y = 1.8; sc.position.y = 1.16; staff.add(sc);
    const sg = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: accent, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 })); sg.scale.setScalar(0.35); sg.position.y = 1.16; staff.add(sg);
    pole.position.y = 0.95; fork.position.y = 1.95; sc.position.y = 1.96; sg.position.y = 1.96;
    staff.position.set(otherHand.sx * 0.36, 0, 0.12); rig.add(staff); staff.userData.gem = sc;
  }
  // kristal melayang (1-3)
  const crystals = [];
  const cg = new THREE.OctahedronGeometry(0.07); cg.scale(1, 2.3, 1);
  const cm = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: accent, emissiveIntensity: 2.4, transparent: true, opacity: 0.92, metalness: 0.2, roughness: 0.1 });
  const nC = angel ? 1 : 1 + Math.floor(r() * 3);
  for (let i = 0; i < nC; i++) {
    const g = new THREE.Group(); const m = new THREE.Mesh(cg, cm); g.add(m);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: accent, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 })); s.scale.setScalar(0.45); g.add(s);
    g.userData = { a: (i / nC) * Math.PI * 2 + r(), rad: 0.45 + r() * 0.15, h: 2.05 + r() * 0.25, sp: 0.5 + r() * 0.4 };
    if (i > 0) g.scale.setScalar(0.6);
    rig.add(g); crystals.push(g);
  }
  // aura kaki
  const auraMat = new THREE.MeshBasicMaterial({ map: ringTex(), color: accent, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 });
  const aura = new THREE.Mesh(new THREE.CircleGeometry(0.75, 40), auraMat); aura.rotation.x = -Math.PI / 2; aura.position.y = 0.03; root.add(aura);
  // sayap (moderator)
  const wings = [];
  if (angel) {
    const wm = new THREE.MeshStandardMaterial({ map: featherTex(), transparent: true, alphaTest: 0.1, side: THREE.DoubleSide, roughness: 0.7, emissive: 0x9aa6ff, emissiveIntensity: 0.15 });
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(sx * 0.08, 0.55, -0.15); chest.add(pivot);
      const wg = new THREE.PlaneGeometry(0.7, 1.15, 6, 6); wg.translate(sx * 0.35, 0, 0);
      const p = wg.attributes.position; for (let i = 0; i < p.count; i++) { const x = Math.abs(p.getX(i)); p.setZ(i, -x * x * 0.4); p.setY(i, p.getY(i) + x * 0.6); }
      wg.computeVertexNormals();
      const w = new THREE.Mesh(wg, wm); w.rotation.y = sx * 0.5; pivot.add(w); wings.push({ pivot, sx });
    }
  }

  let t0 = phase, dead = false;
  const anim = {
    root, mats, height: 2.0,
    setDead(d) {
      if (d === dead) return; dead = d;
      aura.visible = orb.visible = !d; crystals.forEach((c) => (c.visible = !d));
      if (staff) staff.visible = !d;
      robeMat.userData.wind.value = capeMat.userData.wind.value = d ? 0.15 : 1;
    },
    update(dt, speed, s = {}) {
      t0 += dt; const t = t0;
      const breathe = Math.sin(t * 1.6);
      chest.scale.y = 1 + breathe * 0.012; chest.rotation.x = -0.02 + breathe * 0.01;
      hips.position.y = HIP - (s.crouch || 0) + Math.sin(t * 0.8) * 0.005;
      neck.rotation.y = Math.sin(t * 0.37) * 0.25; neck.rotation.x = Math.sin(t * 0.53) * 0.06;
      legs.forEach((l, i) => { l.hip.rotation.x = -(s.crouch || 0) * 1.2 * (i ? 1 : 0.9); l.knee.rotation.x = (s.crouch || 0) * 2.2; });
      // idle: tangan orb terangkat di depan, tangan lain memegang tongkat / santai
      const oh = orbHand, ot = otherHand;
      oh.sh.rotation.x = -0.55 + Math.sin(t * 1.1) * 0.06; oh.sh.rotation.z = oh.sx * 0.18; oh.elbow.rotation.x = -1.0 + Math.sin(t * 1.3) * 0.08;
      ot.sh.rotation.x = staff ? -0.32 : 0.05 + Math.sin(t * 0.9) * 0.05; ot.sh.rotation.z = ot.sx * (staff ? 0.42 : 0.1); ot.elbow.rotation.x = staff ? -0.5 : -0.2;
      if (staff) staff.rotation.z = ot.sx * (0.04 + Math.sin(t * 0.7) * 0.015);
      // merapal (attack 0..1) atau mengangkat tangan (aim)
      const cast = s.attack > 0 ? Math.sin(s.attack * Math.PI) : 0;
      if (cast) {
        oh.sh.rotation.x = -0.55 - cast * 1.6; oh.elbow.rotation.x = -1.0 + cast * 0.9; oh.sh.rotation.z = oh.sx * (0.18 + cast * 0.3);
        if (!staff) { ot.sh.rotation.x = -cast * 1.2; ot.sh.rotation.z = ot.sx * (0.1 + cast * 0.5); }
      }
      if (s.aim) { arms.forEach((a) => { a.sh.rotation.x = -1.35; a.sh.rotation.z = a.sx * 0.35; a.elbow.rotation.x = -0.15; }); }
      // orb berdenyut + percikan
      const pulse = 1 + Math.sin(t * 4) * 0.12 + cast * 0.8;
      orbCore.scale.setScalar(pulse); orbGlow.scale.setScalar(0.42 * pulse); orbCore.rotation.y += dt * 2;
      const sp = sparkG.attributes.position;
      for (let i = 0; i < 10; i++) { const a = t * (1.5 + i * 0.2) + i, rr = 0.08 + (i % 3) * 0.025; sp.setXYZ(i, Math.cos(a) * rr, Math.sin(a * 1.3) * rr, Math.sin(a) * rr); }
      sp.needsUpdate = true;
      if (staff) staff.userData.gem.rotation.y += dt * 1.5;
      // kristal mengorbit
      crystals.forEach((c, i) => { const u = c.userData, a = u.a + t * u.sp; c.position.set(Math.cos(a) * u.rad, u.h + Math.sin(t * 1.4 + i) * 0.08, Math.sin(a) * u.rad); c.rotation.y += dt * (1 + cast * 6); });
      auraMat.opacity = 0.45 + Math.sin(t * 2) * 0.12 + cast * 0.4; aura.rotation.z += dt * 0.4; aura.scale.setScalar(1 + cast * 0.3);
      wings.forEach((w) => { w.pivot.rotation.y = w.sx * (0.15 + Math.sin(t * 1.4) * 0.12 + cast * 0.4); w.pivot.rotation.z = w.sx * Math.sin(t * 1.4) * 0.05; });
      cape.rotation.x = 0.08 + Math.sin(t * 0.9) * 0.03;
    },
  };
  return anim;
}

/** Werewolf yang lebih seram: bulu gelap, mata & rune merah menyala, aura merah */
export function upgradeWolf(rig, uTime) {
  const red = new THREE.Color(0xff2a1a);
  rig.root.traverse((m) => { if (m.isMesh && m.material?.color && !m.material.emissive?.getHex()) m.material.color.multiplyScalar(0.62); });
  const auraMat = new THREE.MeshBasicMaterial({ map: ringTex(), color: red, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 });
  const aura = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), auraMat); aura.rotation.x = -Math.PI / 2; aura.position.y = 0.03; rig.root.add(aura);
  const cg = new THREE.OctahedronGeometry(0.08); cg.scale(1, 2.4, 1);
  const cm = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: red, emissiveIntensity: 3 });
  const shards = [0, 1, 2].map((i) => { const m = new THREE.Mesh(cg, cm); rig.root.add(m); return m; });
  const old = rig.update.bind(rig);
  rig.update = (dt, speed, s) => {
    old(dt, speed, s);
    const t = uTime?.value ?? performance.now() / 1000;
    auraMat.opacity = 0.5 + Math.sin(t * 3) * 0.2; aura.rotation.z -= dt * 0.6;
    shards.forEach((m, i) => { const a = t * 0.8 + (i / 3) * Math.PI * 2; m.position.set(Math.cos(a) * 0.8, 2.6 + Math.sin(t * 2 + i) * 0.12, Math.sin(a) * 0.8); m.rotation.y += dt * 2; });
  };
  return rig;
}
