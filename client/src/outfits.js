// 16 tipe warga: kostum, aksesori kepala, jubah punggung, senjata, warna baju/kulit, proporsi badan.
// Dipakai realhumans.js di atas dua badan realistis (male = berzirah, female).
import * as THREE from 'three';
import { sway } from './heroes.js';

// ---------------------------------------------------------------- daftar 16 tipe
// armor: warna zirah (pria) · outfit/accent/skin: pewarnaan ulang tekstur (wanita)
export const VARIANTS = [
  // ---- Orang Tua (pria) ----
  { id: 'kakek', name: 'Kakek', body: 'oldman', armor: 0x6a5a48, head: null, weapon: 'cane' },
  { id: 'kakek-topi', name: 'Kakek Bertopi', body: 'oldman', armor: 0x3a4a5a, head: 'feathercap', hat: 0x3a2a1a, weapon: 'cane' },
  { id: 'tetua', name: 'Tetua Desa', body: 'oldman', armor: 0x4a2a3a, head: 'hood', hood: 0x2a1a24, weapon: 'staff', orb: 0xffe2a0 },
  // ---- Nenek ----
  { id: 'nenek', name: 'Nenek', body: 'oldwoman', outfit: '#6a4a6a', accent: '#d8b06a', skin: 1, head: null, weapon: 'cane', skirt: 0x4a3046 },
  { id: 'nenek-kerudung', name: 'Nenek Berkerudung', body: 'oldwoman', outfit: '#3a5a4a', accent: '#e8c46a', skin: 2, head: 'hood', hood: 0x5a3a2a, weapon: 'cane', skirt: 0x2f4a3a },
  { id: 'nenek-bunga', name: 'Nenek Bunga', body: 'oldwoman', outfit: '#8a5a3a', accent: '#ff7aa8', skin: 0, head: 'flowers', weapon: 'lantern', skirt: 0x6a3a2a },
  // ---- Laki-laki Muda ----
  { id: 'pemuda', name: 'Pemuda', body: 'man', armor: 0x2a5aa8, head: null, weapon: 'lantern' },
  { id: 'penebang', name: 'Penebang Kayu', body: 'man', armor: 0x8a2a1a, head: null, weapon: 'axe' },
  { id: 'pemburu', name: 'Pemburu Muda', body: 'man', armor: 0x3a4a2a, head: 'hood', hood: 0x2f3a22, weapon: 'bow', back: 'quiver' },
  // ---- Cewek Muda Stylish ----
  { id: 'stylish', name: 'Gadis Stylish', body: 'female', outfit: '#e84393', accent: '#ffd98a', skin: 1, head: 'circlet', weapon: 'fan', orb: 0xff7aa8 },
  { id: 'penyihir', name: 'Penyihir Muda', body: 'female', outfit: '#5b2a86', accent: '#c084fc', skin: 0, head: 'witchhat', hat: 0x24123a, weapon: 'staff', orb: 0xa855f7, cape: 0x3a1a5a },
  { id: 'putri', name: 'Putri Desa', body: 'female', outfit: '#f2efe6', accent: '#e8c46a', skin: 3, head: 'crown', weapon: 'orb', orb: 0xffe2a0, cape: 0x8a1c4a },
  { id: 'penari', name: 'Penari', body: 'female', outfit: '#00a8a8', accent: '#ffd166', skin: 2, head: 'flowers', weapon: null },
  // ---- Anak-anak ----
  { id: 'bocah', name: 'Bocah Laki-laki', body: 'boy', armor: 0xd35400, head: null, weapon: 'lantern' },
  { id: 'bocah-topi', name: 'Bocah Bertopi', body: 'boy', armor: 0x27ae60, head: 'feathercap', hat: 0x1e5a8a, weapon: null },
  { id: 'gadis-kecil', name: 'Gadis Kecil', body: 'girl', outfit: '#ff7aa8', accent: '#ffffff', skin: 1, head: 'flowers', weapon: null },
];
// sifat tiap golongan usia
export const AGE = {
  oldman: { base: 'man', h: 1.7, head: 1.0, hunch: 0.28, breath: 1.0, depth: 1.3, gray: true },
  oldwoman: { base: 'female', h: 1.57, head: 1.0, hunch: 0.3, breath: 1.0, depth: 1.3, gray: true },
  man: { base: 'man', h: 1.8, head: 1.0, hunch: 0, breath: 1.45, depth: 1.0 },
  female: { base: 'female', h: 1.69, head: 1.0, hunch: 0, breath: 1.5, depth: 1.0 },
  boy: { base: 'man', h: 1.2, head: 1.32, hunch: 0, breath: 2.0, depth: 0.8, child: true },
  girl: { base: 'female', h: 1.14, head: 1.32, hunch: 0, breath: 2.1, depth: 0.8, child: true },
};

// ---------------------------------------------------------------- ganti warna tekstur (wanita)
const SKIN_TONES = [[0.62, 0.43, 0.31], [0.93, 0.77, 0.65], [0.78, 0.56, 0.42], [0.45, 0.29, 0.2]]; // r,g,b 0..1
const texCache = new Map();
function rgb2hsv(r, g, b) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return [h, mx ? d / mx : 0, mx]; }
/** Kembalikan tekstur baru: celana kuning → warna baju, aksen merah → warna aksen, kulit → warna kulit */
export function recolorTexture(srcTex, v, gray = false) {
  const key = v.id + (gray ? '-gray' : ''); if (texCache.has(key)) return texCache.get(key);
  const img = srcTex.image; if (!img) return srcTex;
  const W = 512, c = document.createElement('canvas'); c.width = c.height = W; const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, W, W);
  const data = x.getImageData(0, 0, W, W), d = data.data;
  const out = new THREE.Color(v.outfit), acc = new THREE.Color(v.accent);
  const O = [out.r, out.g, out.b].map((n) => Math.pow(n, 1 / 2.2)), A = [acc.r, acc.g, acc.b].map((n) => Math.pow(n, 1 / 2.2)); // ke ruang sRGB
  const S = SKIN_TONES[v.skin ?? 0];
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, [h, s, val] = rgb2hsv(r, g, b);
    let k = null;
    if (h > 38 && h < 70 && s > 0.45 && val > 0.45) k = [O, val / 0.95];                 // baju (kuning)
    else if ((h < 12 || h > 340) && s > 0.55 && val > 0.35) k = [A, val / 0.85];         // aksen (merah)
    else if (h >= 12 && h <= 38 && s > 0.25 && s < 0.8 && val > 0.18 && val < 0.8) {      // kulit
      const f = val / 0.55; d[i] = Math.min(255, S[0] * f * 255); d[i + 1] = Math.min(255, S[1] * f * 255); d[i + 2] = Math.min(255, S[2] * f * 255); continue;
    }
    else if (gray && val < 0.32 && s < 0.4) { const gv = Math.min(255, (0.62 + val) * 255); d[i] = gv; d[i + 1] = gv; d[i + 2] = gv * 1.02; continue; } // rambut & kain gelap → uban
    if (k) { const [C, f] = k; d[i] = Math.min(255, C[0] * f * 255); d[i + 1] = Math.min(255, C[1] * f * 255); d[i + 2] = Math.min(255, C[2] * f * 255); }
  }
  x.putImageData(data, 0, 0);
  const t = new THREE.CanvasTexture(c); t.flipY = srcTex.flipY; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = srcTex.wrapS; t.wrapT = srcTex.wrapT;
  texCache.set(key, t);
  return t;
}

// ---------------------------------------------------------------- aksesori (satuan meter, kerangka karakter: +y atas, +z depan)
const M = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.6 }, o));
const gold = () => M(0xd8b06a, { metalness: 0.9, roughness: 0.3 });
const steel = () => M(0xc8ccd6, { metalness: 0.9, roughness: 0.25 });
const wood = () => M(0x4a3020, { roughness: 0.8 });
const glowM = (c) => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: c, emissiveIntensity: 3 });
const shadowed = (g) => { g.traverse((m) => { if (m.isMesh) m.castShadow = true; }); return g; };

/** topi/helm/mahkota; top = tinggi puncak kepala dari tulang Head; male = kepala berhelm (lebih besar) */
export function headPiece(v, top, male, scale = 1) {
  const g = new THREE.Group(), R = male ? 0.15 : 0.12, y = top;
  switch (v.head) {
    case 'witchhat': {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.015, 32), M(v.hat)); brim.position.y = y - 0.04;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.42, 24, 4), M(v.hat));
      const p = cone.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const yy = p.getY(i) + 0.21; p.setZ(i, p.getZ(i) - yy * yy * 0.5); } cone.geometry.computeVertexNormals();
      cone.position.y = y + 0.17; const band = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.018, 6, 24), M(0x8a5cc7)); band.rotation.x = Math.PI / 2; band.position.y = y - 0.01;
      g.add(brim, cone, band); break;
    }
    case 'hood': {
      const hm = M(v.hood, { side: THREE.DoubleSide, roughness: 0.85 });
      const hood = new THREE.Mesh(new THREE.SphereGeometry(R + 0.05, 20, 14, Math.PI / 2 + 0.9, Math.PI * 2 - 1.8, 0, Math.PI * 0.72), hm);
      hood.position.set(0, y - R * 0.75, -0.015); hood.scale.set(1, 1.15, 1.1);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 10), hm); tip.position.set(0, y - 0.02, -R - 0.06); tip.rotation.x = -2.2;
      const mantle = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.05, R + 0.17, 0.18, 20, 1, true), hm); mantle.position.y = y - R * 2 - 0.08;
      g.add(hood, tip, mantle); break;
    }
    case 'halo': {
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 8, 40), glowM(0xffe2a0)); h.rotation.x = Math.PI / 2 - 0.25; h.position.set(0, y + 0.1, -0.03); g.add(h);
      const t = new THREE.Mesh(new THREE.TorusGeometry(R + 0.005, 0.01, 6, 28, Math.PI), gold()); t.position.set(0, y - 0.04, 0); t.rotation.x = -0.3; g.add(t);
      break;
    }
    case 'horns': case 'horned': {
      const hm = M(v.horn, { roughness: 0.4 });
      if (v.head === 'horned') { const cap = new THREE.Mesh(new THREE.SphereGeometry(R + 0.02, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), M(0x6a6e78, { metalness: 0.8, roughness: 0.35 })); cap.position.y = y - R * 0.55; g.add(cap); }
      for (const sx of [-1, 1]) {
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(sx * 0.08, y - 0.05, 0), new THREE.Vector3(sx * 0.2, y + 0.04, -0.02), new THREE.Vector3(sx * 0.24, y + 0.18, -0.08), new THREE.Vector3(sx * 0.17, y + 0.3, -0.16)]);
        const geo = new THREE.TubeGeometry(curve, 16, 0.035, 8); const p = geo.attributes.position; const n = p.count;
        for (let i = 0; i < n; i++) { const tt = Math.floor(i / 9) / 16, c = curve.getPoint(Math.min(1, tt)); p.setXYZ(i, c.x + (p.getX(i) - c.x) * (1 - tt * 0.85), c.y + (p.getY(i) - c.y) * (1 - tt * 0.85), c.z + (p.getZ(i) - c.z) * (1 - tt * 0.85)); }
        geo.computeVertexNormals(); g.add(new THREE.Mesh(geo, hm));
      }
      break;
    }
    case 'crown': {
      const cm = gold(); const ring = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.85, R * 0.9, 0.06, 24, 1, true), cm); ring.material.side = THREE.DoubleSide; ring.position.y = y - 0.02;
      g.add(ring);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, sp = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 4), cm); sp.position.set(Math.sin(a) * R * 0.86, y + 0.04, Math.cos(a) * R * 0.86); g.add(sp); }
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.022), glowM(0xff3b30)); gem.position.set(0, y - 0.015, R * 0.9); g.add(gem);
      break;
    }
    case 'feathercap': {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(R + 0.02, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), M(v.hat)); cap.scale.set(1.15, 0.7, 1.25); cap.position.y = y - 0.05;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.07, R + 0.07, 0.012, 24), M(v.hat)); brim.position.y = y - 0.05; brim.scale.z = 1.25;
      const fG = new THREE.PlaneGeometry(0.06, 0.32, 1, 6); fG.translate(0, 0.16, 0); const p = fG.attributes.position; for (let i = 0; i < p.count; i++) { const yy = p.getY(i); p.setZ(i, -yy * yy * 0.8); p.setX(i, p.getX(i) * (1 - yy * 2)); } fG.computeVertexNormals();
      const feather = new THREE.Mesh(fG, M(0xc0392b, { side: THREE.DoubleSide })); feather.position.set(0.1, y - 0.02, -0.02); feather.rotation.set(-0.5, 0, -0.4);
      g.add(cap, brim, feather); break;
    }
    case 'circlet': {
      const c = new THREE.Mesh(new THREE.TorusGeometry(R * 0.98, 0.007, 6, 28), M(0xc8ccd6, { metalness: 0.9, roughness: 0.2 })); c.rotation.x = Math.PI / 2 - 0.2; c.position.y = y - 0.06; g.add(c);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.02), glowM(v.orb)); gem.scale.y = 1.6; gem.position.set(0, y - 0.03, R * 0.98); g.add(gem);
      break;
    }
    case 'flowers': {
      const cols = [0xff7aa8, 0xffffff, 0xffd166, 0xb38cff];
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.022, 0), M(cols[i % 4], { roughness: 0.7 })); f.position.set(Math.sin(a) * R * 0.95, y - 0.05 + Math.sin(a * 2) * 0.008, Math.cos(a) * R * 0.95); g.add(f); }
      const vine = new THREE.Mesh(new THREE.TorusGeometry(R * 0.95, 0.008, 5, 28), M(0x3f7a3a)); vine.rotation.x = Math.PI / 2; vine.position.y = y - 0.05; g.add(vine);
      break;
    }
    case 'plume': case 'crest': {
      const pm = M(v.plume, { roughness: 0.9, side: THREE.DoubleSide });
      const pg = new THREE.CylinderGeometry(0.18, 0.18, 0.04, 20, 1, false, 0, Math.PI); const pl = new THREE.Mesh(pg, pm);
      pl.rotation.z = Math.PI / 2; pl.position.set(0, y - 0.02, -0.02); if (v.head === 'crest') pl.rotation.y = Math.PI / 2;
      pl.scale.set(1, 1, v.head === 'crest' ? 1.3 : 1); g.add(pl);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.2), gold()); base.position.set(0, y - 0.02, 0); if (v.head === 'crest') base.rotation.y = Math.PI / 2; g.add(base);
      break;
    }
    case 'crescent': {
      const cr = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 6, 24, Math.PI * 0.85), gold()); cr.rotation.z = Math.PI * 0.075; cr.position.set(0, y - 0.02, R * 0.75); g.add(cr);
      const mon = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), glowM(0xff3b30)); mon.position.set(0, y - 0.04, R * 0.85); g.add(mon);
      break;
    }
    case 'skullcrown': {
      for (let i = -2; i <= 2; i++) {
        const a = i * 0.45, sk = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), M(0xe8e0d0, { roughness: 0.7 })); sk.scale.set(1, 1.1, 0.9);
        sk.position.set(Math.sin(a) * R * 0.95, y - 0.03, Math.cos(a) * R * 0.95); g.add(sk);
        for (const ex of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.007, 5, 4), glowM(0x7cff4a)); e.position.copy(sk.position).add(new THREE.Vector3(Math.cos(a) * ex * 0.01, 0.005, Math.sin(-a) * ex * 0.01 + 0.025 * Math.cos(a))); g.add(e); }
      }
      const spikes = new THREE.Mesh(new THREE.TorusGeometry(R * 0.95, 0.008, 5, 28), M(0x1a1414)); spikes.rotation.x = Math.PI / 2; spikes.position.y = y - 0.05; g.add(spikes);
      break;
    }
  }
  if (scale !== 1) { g.scale.setScalar(scale); g.position.y = top * (1 - scale); }
  if (v.ears) for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.11, 4), M(0xc89a7a)); ear.position.set(sx * 0.085, y - 0.12, -0.01); ear.rotation.set(-0.5, 0, -sx * 1.15); g.add(ear); }
  return shadowed(g);
}

/** senjata di tangan kanan (pangkal di telapak, menghadap ke bawah/depan) */
export function weaponPiece(v) {
  const g = new THREE.Group();
  switch (v.weapon) {
    case 'sword': case 'katana': {
      const kat = v.weapon === 'katana';
      const blade = new THREE.Mesh(new THREE.BoxGeometry(kat ? 0.025 : 0.045, kat ? 0.85 : 0.8, 0.01), steel()); blade.position.y = -0.48; if (kat) blade.rotation.z = 0.04;
      const guard = new THREE.Mesh(kat ? new THREE.CylinderGeometry(0.04, 0.04, 0.012, 12) : new THREE.BoxGeometry(0.2, 0.025, 0.035), gold()); guard.position.y = -0.06;
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, kat ? 0.22 : 0.14, 8), M(0x2a1a12)); grip.position.y = kat ? 0.04 : 0.01;
      g.add(blade, guard, grip); break;
    }
    case 'staff': {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 1.7, 8), wood()); pole.position.y = 0.2;
      const claw = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 5, 14, Math.PI * 1.5), gold()); claw.position.y = 1.08; claw.rotation.z = -Math.PI * 0.25;
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 2), glowM(v.orb)); orb.position.y = 1.08; orb.userData.spin = true;
      g.add(pole, claw, orb); g.userData.glow = { y: 1.08, color: v.orb }; break;
    }
    case 'bow': {
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.014, 6, 24, Math.PI * 0.8), wood()); bow.rotation.set(0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.4); bow.position.set(0, -0.05, -0.38);
      const str = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.95, 3), M(0xeeeeee)); str.position.set(0, -0.05, 0.02);
      g.add(bow, str); break;
    }
    case 'axe': {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.8, 8), wood()); h.position.y = -0.3;
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 16, 1, false, 0, Math.PI * 0.8), steel()); head.rotation.set(Math.PI / 2, 0, 0); head.position.set(0, -0.62, 0.04);
      g.add(h, head); break;
    }
    case 'daggers': {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.28, 0.008), steel()); d.position.y = -0.2; const gd = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.02), M(0x1a1a1a)); gd.position.y = -0.05;
      g.add(d, gd); break;
    }
    case 'lute': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), M(0x8a4a1a, { roughness: 0.5 })); body.scale.set(1, 1.25, 0.45); body.position.set(0, -0.1, 0.08);
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.02), M(0x3a2010)); neck.position.set(0, 0.2, 0.08);
      g.add(body, neck); g.rotation.set(0.3, 0, 0.9); break;
    }
    case 'orb': {
      const o = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 2), glowM(v.orb)); o.position.set(0, -0.1, 0.08); o.userData.spin = true; g.add(o);
      g.userData.glow = { y: -0.1, z: 0.08, color: v.orb }; break;
    }
    case 'cane': {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.92, 8), wood()); pole.position.y = -0.42;
      const crook = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 6, 14, Math.PI), wood()); crook.position.set(0, 0.04, 0.05); crook.rotation.y = Math.PI / 2;
      g.add(pole, crook); g.userData.cane = true; break;
    }
    case 'lantern': {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.006, 4, 12, Math.PI), M(0x2a2a2a, { metalness: 0.8 })); handle.position.y = -0.04;
      const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.14, 6, 1, true), M(0x3a3a3a, { metalness: 0.8, roughness: 0.4, side: THREE.DoubleSide })); frame.position.y = -0.15;
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), glowM(0xffa040)); flame.position.y = -0.15;
      g.add(handle, frame, flame); g.userData.glow = { y: -0.15, color: 0xffa040 }; break;
    }
    case 'fan': {
      const f = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16, 0, Math.PI * 0.75), M(0xffd98a, { side: THREE.DoubleSide, metalness: 0.3 })); f.position.set(0, -0.08, 0.05); f.rotation.set(0, 0, -Math.PI * 0.6); g.add(f); break;
    }
  }
  return shadowed(g);
}

/** rok panjang (nenek), dipasang di pinggul; len = jarak pinggul ke lantai */
export function skirtPiece(v, uTime, phase, len) {
  const prof = []; for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push(new THREE.Vector2(0.16 + Math.pow(1 - t, 1.4) * 0.2, -len + t * (len + 0.06))); }
  const geo = new THREE.LatheGeometry(prof, 32);
  const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z), k = Math.max(0, -y / len), f = 1 + Math.sin(a * 10) * 0.05 * k; p.setXYZ(i, x * f, y, z * f); } geo.computeVertexNormals();
  const mat = sway(new THREE.MeshStandardMaterial({ color: v.skirt, roughness: 0.85, side: THREE.DoubleSide }), uTime, { top: 0.06, bottom: -len, amp: 0.04, phase });
  const m = new THREE.Mesh(geo, mat); m.castShadow = true;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.012, 6, 24), M(0xd8b06a, { metalness: 0.6 })); band.rotation.x = Math.PI / 2; band.position.y = 0.05;
  const g = new THREE.Group(); g.add(m, band); return g;
}

/** jubah punggung + barang di punggung (busur/tabung panah/perisai) */
export function backPiece(v, uTime, phase, male) {
  const g = new THREE.Group();
  if (v.cape != null) {
    const W = male ? 0.5 : 0.42, H = male ? 1.25 : 1.15;
    const geo = new THREE.PlaneGeometry(W, H, 8, 16); geo.translate(0, -H / 2, 0);
    const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), wide = 1 + (-y / H) * 0.5; p.setX(i, x * wide); p.setZ(i, -Math.pow(x * wide, 2) * 1.0 + Math.sin(x * 28) * 0.012 * (-y)); } geo.computeVertexNormals();
    const cm = sway(new THREE.MeshStandardMaterial({ color: v.cape, roughness: 0.82, side: THREE.DoubleSide }), uTime, { top: 0, bottom: -H, amp: 0.14, back: 1, phase });
    const cape = new THREE.Mesh(geo, cm); cape.position.set(0, 0.12, -0.14); cape.rotation.x = 0.1; g.add(cape);
    const clasp = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.01, 6, 14), gold()); clasp.position.set(0, 0.1, 0.12); g.add(clasp);
  }
  if (v.back === 'shield') { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 24), M(0x6a4a2a, { roughness: 0.6 })); s.rotation.x = Math.PI / 2; s.position.set(0, -0.15, -0.2); const boss = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), steel()); boss.position.set(0, -0.15, -0.23); const rim = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.015, 6, 28), steel()); rim.position.set(0, -0.15, -0.2); g.add(s, boss, rim); }
  if (v.back === 'quiver') { const q = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.5, 10), M(0x5a3a1a)); q.position.set(0.1, -0.1, -0.17); q.rotation.z = -0.35; g.add(q); for (let i = 0; i < 4; i++) { const ar = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 4), M(0xf2efe6)); ar.position.set(0.18 + i * 0.012, 0.18, -0.17 + (i % 2) * 0.02); ar.rotation.z = -0.35; g.add(ar); } }
  return shadowed(g);
}
