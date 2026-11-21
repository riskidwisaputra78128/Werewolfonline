// Karakter manusia realistis dari model GLB ber-rig Mixamo (Soldier = pria, Michelle = wanita).
// Animasi asli (Idle, SambaDance) dimainkan lewat AnimationMixer, lalu pose tambahan
// (merapal, membidik, berlutut, terkapar) ditumpuk di atasnya per tulang.
// API sama dengan createHero: { root, mats, update(dt, speed, s), setDead(bool), kind:'real' }
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'; // untuk clone model ber-skeleton
import { VARIANTS, recolorTexture, headPiece, weaponPiece, backPiece } from './outfits.js';
export { VARIANTS };

const TARGET_H = 1.82;
let lib = null, loading = null;

function hash(str) { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Muat model sekali. Resolusi null kalau gagal (mis. versi Apps Script tanpa file model). */
export function loadHumans(base = 'models/') {
  if (loading) return loading;
  const loader = new GLTFLoader();
  const get = (f) => new Promise((res, rej) => loader.load(base + f, res, undefined, rej));
  loading = Promise.all([get('soldier.glb'), get('michelle.glb'), get('man.glb').catch(() => null)]).then(([sol, mic, man]) => {
    const clip = (g, n) => g.animations.find((a) => a.name === n);
    const prep = (g) => { g.scene.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.geometry.userData.shared = true; } }); return g.scene; };
    const solScene = prep(sol), micScene = prep(mic);
    // tiap model memakai animasinya sendiri (orientasi tulang dasar keduanya berbeda)
    lib = {
      male: { scene: solScene, idle: clip(sol, 'Idle'), dance: null },
      female: { scene: micScene, idle: null, tpose: clip(mic, 'TPose'), dance: clip(mic, 'SambaDance') },
    };
    // pria biasa (avatar realistis berjanggut); tanpa klip → idle dibentuk dari tulang
    lib.man = man ? { scene: prep(man), idle: null, tpose: null, dance: null } : lib.male;
    return lib;
  }).catch((e) => { console.warn('[model] model realistis tidak dimuat, pakai karakter bawaan', e); return null; });
  return loading;
}
export const humansReady = () => !!lib;

const ringTexCache = {};
function ringTex() {
  if (ringTexCache.t) return ringTexCache.t;
  const s = 256, c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d'), m = s / 2;
  const g = x.createRadialGradient(m, m, m * 0.35, m, m, m);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,.5)'); g.addColorStop(0.7, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 2; x.beginPath(); x.arc(m, m, m * 0.62, 0, Math.PI * 2); x.stroke();
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; x.beginPath(); x.arc(m + Math.cos(a) * m * 0.62, m + Math.sin(a) * m * 0.62, 4, 0, Math.PI * 2); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (ringTexCache.t = t);
}
function glowTex() {
  if (ringTexCache.g) return ringTexCache.g;
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d'), g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (ringTexCache.g = t);
}

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _pq = new THREE.Quaternion();
/** putar tulang mengelilingi sumbu yang dinyatakan di ruang karakter (root) */
function turn(bone, root, axis, angle) {
  if (!bone || !angle) return;
  bone.parent.getWorldQuaternion(_pq);
  root.getWorldQuaternion(_q);
  _v.copy(axis).applyQuaternion(_q).applyQuaternion(_pq.invert()).normalize();
  bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(_v, angle));
  bone.updateMatrixWorld(true);
}
const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);

/** @param o {color, seed, uTime, variant?:object (dari VARIANTS), gender?, halo?} */
export function createReal(o = {}) {
  if (!lib) return null;
  const h = hash(o.seed ?? Math.random());
  const V = o.variant || null;
  const gender = V ? V.body : o.gender || (h % 2 ? 'female' : 'male');
  const src = lib[gender] || lib.male;
  const accent = new THREE.Color(o.color || '#c0392b');
  const model = SkeletonUtils.clone(src.scene);
  const mats = [];
  model.traverse((m) => {
    if (!m.isMesh) return;
    m.material = m.material.clone();
    // zirah pria diwarnai sesuai warna pemain (kecuali visor)
    if (gender === 'male' && !/visor/i.test(m.material.name)) m.material.color.lerp(V ? new THREE.Color(V.armor) : accent, V ? 0.8 : 0.55);
    if (gender === 'female' && V && m.material.map) { m.material.map = recolorTexture(m.material.map, V); m.material.needsUpdate = true; }
    if (gender === 'man' && V) { // baju atas/bawah diwarnai sesuai tipe; topi bawaan disembunyikan kalau tipe punya aksesori kepala
      const n = m.material.name;
      if (/Outfit_Top/.test(n)) m.material.color.lerp(new THREE.Color(V.armor), 0.75);
      if (/Outfit_Bottom/.test(n)) m.material.color.lerp(new THREE.Color(V.armor).multiplyScalar(0.45), 0.7);
      if (/Headwear/.test(n) && V.head) m.visible = false;
    }
    if (!/visor/i.test(m.material.name)) mats.push(m.material);
  });
  // normalisasi tinggi
  // tinggi diukur dari tulang (kotak pembatas mesh ber-skin tidak akurat)
  model.updateMatrixWorld(true);
  const wp = (n) => { const b = model.getObjectByName('mixamorig' + n) || model.getObjectByName(n); return b && b.isBone ? b.getWorldPosition(new THREE.Vector3()) : null; };
  const top = wp('HeadTop_End') || wp('Head'), foot = wp('LeftToeBase') || wp('LeftFoot');
  const hgt = top && foot ? Math.abs(top.y - foot.y) + 0.05 * Math.abs(top.y - foot.y) : 1;
  const s = TARGET_H / (hgt || 1) * (V ? (V.h || 1) * (gender === 'female' ? 0.95 : gender === 'man' ? 0.99 : 1) : 0.96 + (h % 7) * 0.01);
  model.scale.multiplyScalar(s); if (V?.w) { model.scale.x *= V.w; model.scale.z *= V.w; } model.updateMatrixWorld(true);
  const f2 = wp('LeftToeBase') || wp('LeftFoot'); model.position.y -= (f2 ? f2.y - 0.04 : 0); const baseY = model.position.y;

  const root = new THREE.Group(); const rig = new THREE.Group(); rig.add(model); root.add(rig);
  const B = (n) => model.getObjectByName('mixamorig' + n) || model.getObjectByName(n);
  const bones = { hips: B('Hips'), spine: B('Spine1'), head: B('Head'), rArm: B('RightArm'), lArm: B('LeftArm'), rFore: B('RightForeArm'), lFore: B('LeftForeArm'), rUp: B('RightUpLeg'), lUp: B('LeftUpLeg'), rLeg: B('RightLeg'), lLeg: B('LeftLeg') };

  // simpan rotasi dasar tulang yang kita ubah, supaya pose tambahan tidak menumpuk tiap frame
  const baseQ = new Map(Object.values(bones).filter(Boolean).map((b) => [b, b.quaternion.clone()]));
  const mixer = new THREE.AnimationMixer(model);
  const idle = src.idle && mixer.clipAction(src.idle);
  const dance = src.dance && mixer.clipAction(src.dance);
  const tpose = src.tpose && mixer.clipAction(src.tpose);
  if (idle) { idle.play(); idle.time = (h % 100) / 100 * src.idle.duration; idle.timeScale = 0.9 + (h % 5) * 0.05; }
  else if (tpose) tpose.play(); // idle wanita dibentuk dari T-pose + pose tulang di bawah
  let mode = 'idle';
  const setMode = (m) => {
    if (m === mode || !dance) { mode = m; return; }
    const base = idle || tpose;
    if (m === 'dance') { dance.reset().play(); base?.crossFadeTo(dance, 0.4, false); }
    else { base.reset().play(); dance.crossFadeTo(base, 0.4, false); }
    mode = m;
  };
  const proceduralIdle = !idle; // tanpa klip Idle → napas & lengan turun dibuat lewat tulang

  // ---- kostum: aksesori kepala, jubah/punggung, senjata (mengikuti tulang lewat "anchor") ----
  const anchors = [];
  const anchor = (bone, followRot) => {
    if (!bone) return null;
    const a = new THREE.Group(); rig.add(a);
    const corr = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    anchors.push({ a, bone, corr, followRot }); return a;
  };
  let weapon = null, wGlow = null;
  if (V) {
    const headB = B('Head'), topB = B('HeadTop_End');
    const hp = headB && headB.getWorldPosition(new THREE.Vector3()), tp = topB && topB.getWorldPosition(new THREE.Vector3());
    const top = hp && tp ? tp.y - hp.y : 0.2;
    const ha = anchor(headB, true); if (ha) ha.add(headPiece(V, top * (gender === 'male' ? 0.92 : 0.95), gender === 'male'));
    // jubah punggung hanya untuk wanita (di model pria posisinya tidak pas)
    const ba = anchor(B('Spine2'), true); if (ba) ba.add(backPiece(gender === 'female' ? V : { ...V, cape: undefined }, o.uTime || { value: 0 }, h % 10, gender !== 'female'));
    const wa = anchor(B('RightHand'), false);
    if (wa && V.weapon) {
      weapon = weaponPiece(V); wa.add(weapon);
      if (weapon.userData.glow) { const gl = weapon.userData.glow; wGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: gl.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 })); wGlow.scale.setScalar(0.4); wGlow.position.set(0, gl.y, gl.z || 0); weapon.add(wGlow); }
    }
  }
  const _wq = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _wp = new THREE.Vector3();
  const updateAnchors = () => {
    rig.updateMatrixWorld(true);
    rig.getWorldQuaternion(_rq).invert();
    for (const { a, bone, corr, followRot } of anchors) {
      bone.getWorldPosition(_wp); a.position.copy(rig.worldToLocal(_wp));
      if (followRot) a.quaternion.copy(_rq).multiply(bone.getWorldQuaternion(_wq)).multiply(corr);
      else a.quaternion.identity();
    }
  };

  // sentuhan fantasi: aura kaki + kristal melayang + orb di tangan (warna pemain)
  const auraMat = new THREE.MeshBasicMaterial({ map: ringTex(), color: accent, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 });
  const aura = new THREE.Mesh(new THREE.CircleGeometry(0.75, 40), auraMat); aura.rotation.x = -Math.PI / 2; aura.position.y = 0.03; root.add(aura);
  const cg = new THREE.OctahedronGeometry(0.07); cg.scale(1, 2.3, 1);
  const crystal = new THREE.Group();
  crystal.add(new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: accent, emissiveIntensity: 2.4, transparent: true, opacity: 0.92 })));
  const cs = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: accent, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 })); cs.scale.setScalar(0.45); crystal.add(cs);
  rig.add(crystal);
  let halo = null;
  if (o.halo) {
    halo = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.013, 6, 32), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffe2a0, emissiveIntensity: 3 }));
    halo.rotation.x = Math.PI / 2; rig.add(halo);
  }
  const rHand = B('RightHand');
  const orb = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: accent, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  orb.scale.setScalar(0.45 / s); if (rHand) rHand.add(orb); orb.position.set(0, 8, 4);

  let t0 = (h % 1000) / 100, dead = false;
  const headPos = new THREE.Vector3();
  return {
    kind: 'real', root, mats, height: TARGET_H, variant: V?.id,
    setDead(d) {
      if (d === dead) return; dead = d;
      aura.visible = crystal.visible = !d; if (halo) halo.visible = !d;
      if (idle) idle.timeScale = d ? 0 : 0.95;
    },
    update(dt, speed, st = {}) {
      t0 += dt; const t = t0;
      setMode(st.dance ? 'dance' : 'idle');
      for (const [b, q] of baseQ) b.quaternion.copy(q);
      mixer.update(dt);
      model.updateMatrixWorld(true);
      // idle prosedural (model wanita): turunkan lengan dari T-pose, napas, goyang berat badan
      if (proceduralIdle && mode !== 'dance') {
        const br = Math.sin(t * 1.5), sw = Math.sin(t * 0.55);
        turn(bones.lArm, root, Z, -1.2 - br * 0.03); turn(bones.rArm, root, Z, 1.2 + br * 0.03);
        turn(bones.lArm, root, X, -0.12); turn(bones.rArm, root, X, -0.12);
        turn(bones.lFore, root, X, -0.35); turn(bones.rFore, root, X, -0.35);
        turn(bones.spine, root, X, br * 0.015); turn(bones.hips, root, Z, sw * 0.03); turn(bones.head, root, new THREE.Vector3(0, 1, 0), Math.sin(t * 0.37) * 0.25);
      }
      // pria merayakan di podium: kedua tangan terangkat bergantian
      if (st.dance && !dance) { const k = 0.5 + Math.sin(t * 5) * 0.5; turn(bones.rArm, root, X, -2.4 * k - 0.4); turn(bones.lArm, root, X, -2.4 * (1 - k) - 0.4); }
      // pose tambahan di atas animasi
      const cast = st.attack > 0 && !st.dance ? Math.sin(st.attack * Math.PI) : 0;
      if (cast) { turn(bones.rArm, root, X, -1.5 * cast); turn(bones.rFore, root, X, -0.4 * cast); turn(bones.spine, root, X, 0.08 * cast); }
      if (st.aim) { turn(bones.rArm, root, X, -1.35); turn(bones.lArm, root, X, -1.35); }
      const cr = st.crouch || 0;
      model.position.y = baseY - cr * 0.85;
      if (cr) {
        turn(bones.rUp, root, X, -cr * 2.6); turn(bones.lUp, root, X, -cr * 2.6);
        turn(bones.rLeg, root, X, cr * 4.2); turn(bones.lLeg, root, X, cr * 4.2);
        turn(bones.spine, root, X, cr * 0.8);
      }
      if (dead) { turn(bones.rArm, root, Z, -0.6); turn(bones.lArm, root, Z, 0.6); }
      updateAnchors();
      if (weapon) { weapon.traverse((m) => { if (m.userData.spin) m.rotation.y += dt * 2; }); weapon.visible = !dead; if (wGlow) wGlow.material.opacity = 0.6 + Math.sin(t * 4) * 0.15 + cast * 0.4; }
      orb.material.opacity = V ? 0 : 0.25 + cast * 0.75 + Math.sin(t * 4) * 0.08;
      // kristal & halo mengikuti kepala
      if (bones.head) { bones.head.getWorldPosition(headPos); rig.worldToLocal(headPos); }
      crystal.position.set(Math.cos(t * 0.6) * 0.5, headPos.y + 0.45 + Math.sin(t * 1.4) * 0.07, Math.sin(t * 0.6) * 0.5); crystal.rotation.y += dt * (1 + cast * 6);
      if (halo) halo.position.set(headPos.x, headPos.y + 0.24, headPos.z - 0.02);
      auraMat.opacity = 0.42 + Math.sin(t * 2) * 0.1 + cast * 0.4; aura.rotation.z += dt * 0.4;
    },
  };
}
