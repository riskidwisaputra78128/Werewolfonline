// Karakter prosedural: manusia, werewolf, serigala, pemburu, tetua desa
import * as THREE from 'three';
import * as T from './textures.js';

const texCache = {};
function cachedTex(key, fn, normal = false) {
  const k = key + (normal ? ':n' : '');
  if (!texCache[k]) {
    const c = texCache[key + ':c'] || (texCache[key + ':c'] = fn());
    texCache[k] = normal ? T.normalFrom(c, 3, 2) : T.tex.toTexture(c, 2);
  }
  return texCache[k];
}

export function furMat(base = [70, 60, 52], tint = 0xffffff) {
  const key = 'fur' + base.join('-');
  return new THREE.MeshStandardMaterial({
    map: cachedTex(key, () => T.furTexture(base)), normalMap: cachedTex(key, () => T.furTexture(base), true),
    color: tint, roughness: 0.95, metalness: 0,
  });
}
export function clothMat(base) {
  const key = 'cloth' + base.join('-');
  return new THREE.MeshStandardMaterial({ map: cachedTex(key, () => T.clothTexture(base)), roughness: 0.9 });
}
const skinMat = () => new THREE.MeshStandardMaterial({ color: 0xc89a7a, roughness: 0.6 });
const eyeMat = (c) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: c, emissiveIntensity: 3 });

function limb(len, r, mat, taper = 0.85) {
  const pivot = new THREE.Group();
  const geo = new THREE.CapsuleGeometry(r, Math.max(0.01, len - r * 2), 4, 10);
  geo.translate(0, -len / 2, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = -p.getY(i) / len; const s = 1 - t * (1 - taper); p.setX(i, p.getX(i) * s); p.setZ(i, p.getZ(i) * s); }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat); m.castShadow = true;
  pivot.add(m);
  return pivot;
}

/**
 * Biped generik.
 * opts: {scale, body, limbMat, head:'human'|'wolf', hunch, armLen, weapon, hat, hood, beard, eyeColor}
 */
export function createBiped(opts = {}) {
  const o = Object.assign({ scale: 1, hunch: 0, armLen: 1, legLen: 1, bulk: 1, head: 'human', eyeColor: 0x000000 }, opts);
  const root = new THREE.Group();
  const rig = new THREE.Group(); rig.scale.setScalar(o.scale); root.add(rig);
  const mats = [];
  const body = o.body, limbs = o.limbMat || o.body, skin = o.skin || skinMat();
  mats.push(body, limbs, skin);

  const legL = o.legLen * 0.48;
  const hips = new THREE.Group(); hips.position.y = legL * 2 + 0.08; rig.add(hips);
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.2 * o.bulk, 12, 8), o.pants || body); pelvis.scale.set(1.2, 0.8, 0.9); pelvis.castShadow = true; hips.add(pelvis);

  const chest = new THREE.Group(); chest.rotation.x = o.hunch; hips.add(chest);
  const torsoGeo = new THREE.CapsuleGeometry(0.22 * o.bulk, 0.42, 4, 12); torsoGeo.translate(0, 0.38, 0);
  const torso = new THREE.Mesh(torsoGeo, body); torso.scale.set(1.15, 1, 0.8); torso.castShadow = true; chest.add(torso);

  // Kepala
  const neck = new THREE.Group(); neck.position.y = 0.8; chest.add(neck);
  const head = new THREE.Group(); neck.add(head);
  if (o.head === 'wolf') {
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), body); skull.scale.set(1, 0.95, 1.1); skull.position.y = 0.12;
    const snoutGeo = new THREE.CylinderGeometry(0.07, 0.13, 0.36, 8); snoutGeo.rotateX(Math.PI / 2);
    const snout = new THREE.Mesh(snoutGeo, body); snout.position.set(0, 0.06, 0.28);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 })); nose.position.set(0, 0.09, 0.46);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.3), body); jaw.position.set(0, -0.03, 0.26); jaw.rotation.x = 0.15;
    const fangMat = new THREE.MeshStandardMaterial({ color: 0xeee8d8, roughness: 0.4 });
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 5), body); ear.position.set(sx * 0.11, 0.33, -0.02); ear.rotation.z = -sx * 0.25; head.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), eyeMat(o.eyeColor)); eye.position.set(sx * 0.085, 0.17, 0.16); head.add(eye);
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.07, 4), fangMat); fang.position.set(sx * 0.05, 0.0, 0.4); fang.rotation.x = Math.PI; head.add(fang);
    }
    [skull, snout, nose, jaw].forEach((m) => { m.castShadow = true; head.add(m); });
    // surai
    const mane = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), body); mane.scale.set(1.2, 0.9, 0.9); mane.position.set(0, 0.62, -0.05); mane.castShadow = true; chest.add(mane);
  } else {
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), skin); skull.scale.set(0.9, 1.05, 1); skull.position.y = 0.14; skull.castShadow = true; head.add(skull);
    const eyeM = new THREE.MeshStandardMaterial({ color: 0x1a1410 });
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), eyeM); e.position.set(sx * 0.05, 0.16, 0.13); head.add(e); }
    if (o.hood) {
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), o.hood);
      hood.position.set(0, 0.15, -0.025); hood.rotation.x = -0.35; hood.castShadow = true; head.add(hood);
    }
    if (o.hat) {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 16), o.hat); brim.position.y = 0.26;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.2, 12), o.hat); top.position.y = 0.36;
      [brim, top].forEach((m) => { m.castShadow = true; head.add(m); });
    }
    if (o.beard) {
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 8), new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 1 }));
      b.position.set(0, 0.0, 0.08); b.rotation.x = Math.PI; head.add(b);
    }
  }

  // Lengan
  const arms = [];
  for (const sx of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(sx * 0.3 * o.bulk, 0.66, 0); chest.add(sh);
    const upper = limb(0.32 * o.armLen, 0.075 * o.bulk, body); sh.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = -0.32 * o.armLen; upper.add(elbow);
    const lower = limb(0.3 * o.armLen, 0.065 * o.bulk, limbs); elbow.add(lower);
    const hand = new THREE.Group(); hand.position.y = -0.3 * o.armLen; lower.add(hand);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.06 * o.bulk, 8, 6), o.head === 'wolf' ? limbs : skin); hand.add(palm);
    if (o.claws) {
      const cm = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.3 });
      for (let k = -1; k <= 1; k++) { const cl = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.14, 4), cm); cl.position.set(k * 0.035, -0.09, 0.03); cl.rotation.x = Math.PI + 0.3; hand.add(cl); }
    }
    sh.rotation.z = sx * 0.08;
    arms.push({ sh, upper, elbow, hand });
  }
  // Senjata
  if (o.weapon) {
    const w = makeWeapon(o.weapon);
    arms[1].hand.add(w);
  }
  if (o.torch) {
    const t = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.6, 5), new THREE.MeshStandardMaterial({ color: 0x3a2412 }));
    stick.position.y = 0.2;
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glowSprite('255,160,60'), color: 0xffaa55, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    flame.scale.setScalar(0.7); flame.position.y = 0.55;
    t.add(stick, flame); t.rotation.x = 0.4;
    arms[0].hand.add(t);
  }

  // Kaki
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sx * 0.12 * o.bulk, 0, 0); hips.add(hip);
    const thigh = limb(legL, 0.09 * o.bulk, o.pants || limbs); hip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -legL; thigh.add(knee);
    const shin = limb(legL, 0.075 * o.bulk, o.boots || limbs); knee.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11 * o.bulk, 0.07, 0.24), o.boots || limbs);
    foot.position.set(0, -legL - 0.02, 0.06); foot.castShadow = true; shin.add(foot);
    legs.push({ hip, thigh, knee });
  }
  // Ekor
  let tail = null;
  if (o.tail) {
    tail = limb(0.6, 0.07, body, 0.3); tail.position.set(0, 0, -0.18); tail.rotation.x = -2.2; hips.add(tail);
  }

  root.traverse((m) => { if (m.isMesh && m.material && !mats.includes(m.material)) mats.push(m.material); });

  let phase = 0;
  const anim = {
    root, mats, height: (legL * 2 + 1.1) * o.scale,
    update(dt, speed, s = {}) {
      phase += dt * (3 + speed * 1.3);
      const amp = Math.min(1, speed / 5);
      const sw = Math.sin(phase);
      legs.forEach((l, i) => {
        const p = i ? sw : -sw;
        l.hip.rotation.x = p * 0.65 * amp;
        l.knee.rotation.x = Math.max(0, -Math.cos(phase + (i ? 0 : Math.PI))) * 1.0 * amp + 0.05;
      });
      arms.forEach((a, i) => {
        const p = i ? -sw : sw;
        a.sh.rotation.x = p * 0.5 * amp - o.hunch * 0.6;
        a.elbow.rotation.x = -0.25 - amp * 0.3;
      });
      hips.position.y = legL * 2 + 0.08 + Math.abs(Math.cos(phase)) * 0.06 * amp - (s.crouch || 0);
      chest.rotation.x = o.hunch + amp * 0.08;
      chest.rotation.y = sw * 0.08 * amp;
      neck.rotation.x = -o.hunch * 0.8;
      if (tail) tail.rotation.y = Math.sin(phase * 0.5) * 0.3;
      // idle bernapas
      chest.scale.y = 1 + Math.sin(performance.now() * 0.002) * 0.015;
      // serangan (0..1)
      if (s.attack > 0) {
        const t = s.attack, k = Math.sin(t * Math.PI);
        const a = arms[s.attackArm ?? 1];
        a.sh.rotation.x = -2.4 * k + 0.6 * (t > 0.5 ? 1 : 0) * k;
        a.sh.rotation.z = (s.attackArm === 0 ? -1 : 1) * (0.2 + k * 0.6);
        a.elbow.rotation.x = -0.2;
        chest.rotation.y += (s.attackArm === 0 ? 1 : -1) * k * 0.5;
      }
      if (s.aim) { arms[1].sh.rotation.x = -1.5; arms[0].sh.rotation.x = -1.4; arms[0].sh.rotation.z = 0.4; arms[1].elbow.rotation.x = 0; }
      if (s.howl > 0) { neck.rotation.x = -1.0 * Math.sin(s.howl * Math.PI); chest.rotation.x = o.hunch - 0.5 * Math.sin(s.howl * Math.PI); }
    },
  };
  return anim;
}

function makeWeapon(type) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.9, roughness: 0.25 });
  if (type === 'dagger') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.32, 0.06), steel); blade.position.y = -0.24;
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), wood);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.14), steel); guard.position.y = -0.07;
    g.add(blade, hilt, guard); g.rotation.x = Math.PI;
  } else if (type === 'axe') {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.9, 6), wood); handle.position.y = 0.3;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.25), steel); head.position.set(0, 0.68, 0.1);
    g.add(handle, head); g.rotation.x = Math.PI / 2;
  } else if (type === 'crossbow') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.6), wood); stock.position.z = 0.15;
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.015, 4, 12, Math.PI), steel); bow.position.z = 0.4; bow.rotation.x = Math.PI / 2;
    g.add(stock, bow);
  } else if (type === 'staff') {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.7, 6), wood); s.position.y = 0.4;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: 0x223355, emissive: 0x4f7fff, emissiveIntensity: 2 }));
    orb.position.y = 1.27; g.add(s, orb);
  }
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

/** Serigala berkaki empat */
export function createWolf(opts = {}) {
  const o = Object.assign({ scale: 1, fur: [95, 92, 88], eye: 0xffcc33 }, opts);
  const root = new THREE.Group();
  const rig = new THREE.Group(); rig.scale.setScalar(o.scale); root.add(rig);
  const fur = furMat(o.fur);
  const bodyGeo = new THREE.CapsuleGeometry(0.28, 0.8, 6, 12); bodyGeo.rotateX(Math.PI / 2);
  const body = new THREE.Mesh(bodyGeo, fur); body.position.y = 0.75; body.scale.set(0.9, 1, 1); body.castShadow = true; rig.add(body);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 10), fur); chest.position.set(0, 0.8, 0.4); chest.castShadow = true; rig.add(chest);
  const neck = new THREE.Group(); neck.position.set(0, 0.95, 0.62); rig.add(neck);
  const head = new THREE.Group(); neck.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), fur); skull.position.set(0, 0.08, 0.1); skull.scale.set(1, 0.9, 1.1);
  const snoutGeo = new THREE.CylinderGeometry(0.055, 0.1, 0.3, 8); snoutGeo.rotateX(Math.PI / 2);
  const snout = new THREE.Mesh(snoutGeo, fur); snout.position.set(0, 0.02, 0.33);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.3 })); nose.position.set(0, 0.05, 0.48);
  [skull, snout, nose].forEach((m) => { m.castShadow = true; head.add(m); });
  const em = eyeMat(o.eye);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.17, 5), fur); ear.position.set(sx * 0.09, 0.25, 0.05); head.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), em); eye.position.set(sx * 0.07, 0.12, 0.23); head.add(eye);
  }
  const legs = [];
  for (const [x, z] of [[-0.16, 0.45], [0.16, 0.45], [-0.16, -0.42], [0.16, -0.42]]) {
    const hip = new THREE.Group(); hip.position.set(x, 0.72, z); rig.add(hip);
    const up = limb(0.36, 0.075, fur, 0.7); hip.add(up);
    const kn = new THREE.Group(); kn.position.y = -0.36; up.add(kn);
    const lo = limb(0.36, 0.05, fur, 0.8); kn.add(lo);
    legs.push({ hip, kn, back: z < 0 });
  }
  const tail = limb(0.55, 0.08, fur, 0.4); tail.position.set(0, 0.85, -0.7); tail.rotation.x = -2.3; rig.add(tail);
  const mats = [fur, em];
  let phase = Math.random() * 10;
  return {
    root, mats, height: 1.2 * o.scale,
    update(dt, speed, s = {}) {
      phase += dt * (4 + speed * 1.6);
      const amp = Math.min(1, speed / 4);
      legs.forEach((l, i) => {
        const off = [0, Math.PI, Math.PI * 0.5, Math.PI * 1.5][i];
        const sw = Math.sin(phase + off);
        l.hip.rotation.x = sw * 0.6 * amp;
        l.kn.rotation.x = (l.back ? -1 : 1) * (Math.max(0, Math.cos(phase + off)) * 0.8 * amp + 0.1);
      });
      body.position.y = 0.75 + Math.abs(Math.sin(phase)) * 0.05 * amp;
      tail.rotation.y = Math.sin(phase * 0.7) * 0.35;
      neck.rotation.x = s.attack > 0 ? -0.4 + Math.sin(s.attack * Math.PI) * 0.9 : (s.howl > 0 ? -0.9 * Math.sin(s.howl * Math.PI) : 0.1);
      rig.position.z = s.attack > 0 ? Math.sin(s.attack * Math.PI) * 0.5 : 0;
    },
  };
}

// ---------- preset ----------
export const makePlayerHuman = () => createBiped({
  body: clothMat([55, 30, 28]), pants: clothMat([40, 36, 32]), boots: new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.7 }),
  hood: clothMat([45, 22, 22]), weapon: 'dagger',
});
export const makePlayerWerewolf = () => createBiped({
  scale: 1.45, body: furMat([62, 52, 45]), hunch: 0.45, armLen: 1.35, legLen: 1.05, bulk: 1.35, head: 'wolf', claws: true, tail: true, eyeColor: 0xffb020,
});
export const makeHunter = (ranged) => createBiped({
  body: clothMat(ranged ? [70, 60, 40] : [60, 45, 35]), pants: clothMat([45, 40, 34]), boots: new THREE.MeshStandardMaterial({ color: 0x1e140e }),
  hat: new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9 }), weapon: ranged ? 'crossbow' : 'axe', torch: !ranged,
});
export const makeElder = () => createBiped({
  body: clothMat([70, 72, 80]), pants: clothMat([60, 62, 70]), hood: clothMat([50, 52, 62]), beard: true, weapon: 'staff', hunch: 0.15,
});
