// Desa 3D: terrain, langit siang/malam, rumah, hutan, api unggun, avatar pemain
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm, simplex2, mulberry32, smoothstep, lerp } from './noise.js';
import * as T from './textures.js';
import { createBiped, clothMat, makePlayerWerewolf, makeElder } from './characters.js';
import { FX, gradePass, disposeDeep } from './effects.js';
import { createHero, upgradeWolf } from './heroes.js';
import { buildTheme } from './themes.js';
import { loadHumans, createReal, humansReady, VARIANTS } from './realhumans.js';
const MOD_VARIANT = { id: 'mod', body: 'female', outfit: '#f2efe6', accent: '#d8b06a', skin: 1, head: 'halo', weapon: 'staff', orb: 0xffe2a0, cape: 0xf2efe6 };
const ease = (t) => t * t * (3 - 2 * t);
const seg = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));

const R = mulberry32(77);
export function heightAt(x, z) {
  const d = Math.hypot(x, z);
  let h = fbm(x * 0.02, z * 0.02, 4) * 3 + fbm(x * 0.006 + 9, z * 0.006, 3) * 8;
  h += smoothstep(55, 110, d) * 22;
  return lerp(0.15 + simplex2(x * 0.1, z * 0.1) * 0.08, h, smoothstep(14, 34, d));
}

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

export class Village {
  constructor(canvas, { onPick, low } = {}) {
    this.onPick = onPick;
    this.low = !!low;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true }));
    r.setPixelRatio(Math.min(devicePixelRatio, this.low ? 1 : 1.75));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = !this.low; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 5000);
    this.camera.position.set(0, 13, 24);
    this.controls = new OrbitControls(this.camera, canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 8, maxDistance: 45, maxPolarAngle: 1.38, enablePan: false, autoRotateSpeed: 0.35 });
    this.controls.target.set(0, 1.5, 0);
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.6, 0.85);
    this.grade = gradePass();
    this.composer.addPass(this.bloom); this.composer.addPass(this.grade); this.composer.addPass(new OutputPass());
    this.home = new THREE.Vector3(0, 1.5, 0); this.camHold = 0; this.shakeAmt = 0; this.shakeOff = new THREE.Vector3(); this.redPulse = 0;
    this.deathQueue = []; this.cine = null; this.cineGap = 0;
    this.controls.addEventListener('start', () => { this.camHold = 2.5; });

    this.time = 0.7; this.targetTime = 0.7;
    this.avatars = new Map();
    this.labels = document.getElementById('labels');
    this.raycaster = new THREE.Raycaster(); this.mouse = new THREE.Vector2();
    this.clock = new THREE.Clock();
    this.uTime = { value: 0 };

    this.buildLights(); this.buildSky(); this.buildGround(); this.buildForest(); this.buildGrass(); this.buildHouses(); this.buildFire(); this.buildFireflies();
    this.fx = new FX(this); this.fx.ambience(heightAt);
    this.podiumAt = new THREE.Vector3(0, heightAt(0, 0), 0); this.fireOn = 1; this.fx.buildPodium(this.podiumAt);
    this.setTheme('kampung');
    this.fx.warmup();
    // model manusia realistis (GLB) dimuat di latar; begitu siap, avatar diganti
    loadHumans().then((lib) => { if (lib) this.swapRigs(); });
    this.podiumIds = [];
    this.modRig = createHero({ color: '#ffe2a0', seed: 'moderator', style: 'angel', uTime: this.uTime }); this.modRig.root.visible = false; this.scene.add(this.modRig.root);

    addEventListener('resize', () => this.resize());
    let down = null;
    canvas.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
    canvas.addEventListener('pointerup', (e) => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6) this.pick(e); down = null; });
    canvas.addEventListener('pointermove', (e) => this.hover(e));
    r.setAnimationLoop(() => this.loop());
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight); this.composer.setSize(innerWidth, innerHeight);
  }
  zoom(f) { const off = this.camera.position.clone().sub(this.controls.target).multiplyScalar(f); if (off.length() > 8 && off.length() < 45) this.camera.position.copy(this.controls.target).add(off); }
  rotate(a) { const off = this.camera.position.clone().sub(this.controls.target); off.applyAxisAngle(new THREE.Vector3(0, 1, 0), a); this.camera.position.copy(this.controls.target).add(off); }

  // ---------------- lingkungan ----------------
  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x3a3020, 0.5); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1dd, 2.5);
    this.sun.castShadow = true;
    const s = this.sun.shadow; s.mapSize.set(2048, 2048);
    Object.assign(s.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 300 });
    s.bias = -0.0004; s.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.scene.fog = new THREE.FogExp2(0xa0b0c0, 0.008);
  }
  buildSky() {
    this.sky = new Sky(); this.sky.scale.setScalar(3000);
    const u = this.sky.material.uniforms; u.turbidity.value = 7; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.8;
    this.scene.add(this.sky);
    const n = 2000, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const th = R() * 6.283, ph = Math.acos(R() * 0.95); pos.set([Math.sin(ph) * Math.cos(th) * 1200, Math.cos(ph) * 1200, Math.sin(ph) * Math.sin(th) * 1200], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.scene.add(this.stars);
    const mt = new THREE.CanvasTexture(T.moonTexture()); mt.colorSpace = THREE.SRGBColorSpace;
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(45, 32, 16), new THREE.MeshBasicMaterial({ map: mt, color: 0xe8eeff, fog: false, transparent: true }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glowSprite('180,200,255'), color: 0x9fb4ff, transparent: true, opacity: 0.5, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(360); this.moon.add(halo); this.moonHalo = halo;
    this.scene.add(this.moon);
  }
  buildGround() {
    const g = new THREE.PlaneGeometry(260, 260, this.low ? 120 : 200, this.low ? 120 : 200); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    const gA = new THREE.Color(0x2f4a1c), gB = new THREE.Color(0x4d5e27), dirt = new THREE.Color(0x6a5238), rock = new THREE.Color(0x6b6862);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), h = heightAt(x, z), d = Math.hypot(x, z);
      p.setY(i, h);
      c.copy(gA).lerp(gB, fbm(x * 0.03, z * 0.03, 3) * 0.5 + 0.5);
      c.lerp(dirt, 1 - smoothstep(9, 13, d));                          // lapangan desa
      const ring = Math.abs(d - 20); c.lerp(dirt, (1 - smoothstep(1, 3, ring)) * 0.7); // jalan melingkar
      c.lerp(rock, smoothstep(14, 28, h));
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    const det = T.groundDetail();
    const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: T.tex.toTexture(det, 70), normalMap: T.normalFrom(det, 3, 70), roughness: 0.95 }));
    ground.receiveShadow = true; this.scene.add(ground); this.ground = ground;
  }
  buildForest() {
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.16, 0.32, 4, 7); trunk.translate(0, 2, 0); paint(trunk, 0x3d2b1f); parts.push(trunk);
    for (let i = 0; i < 5; i++) {
      const r = 2.4 - i * 0.38, h = 2.6 - i * 0.18, cone = new THREE.ConeGeometry(r, h, 9, 2);
      cone.translate(0, 2.2 + i * 1.25 + h / 2, 0);
      const cp = cone.attributes.position;
      for (let k = 0; k < cp.count; k++) { const n = simplex2(cp.getX(k) * 1.7 + i, cp.getZ(k) * 1.7 + cp.getY(k)) * 0.22; cp.setXYZ(k, cp.getX(k) * (1 + n), cp.getY(k), cp.getZ(k) * (1 + n)); }
      paint(cone, new THREE.Color(0x1a3018).lerp(new THREE.Color(0x2f4a26), i / 5).getHex()); parts.push(cone);
    }
    const geo = mergeGeometries(parts.map((x) => x.toNonIndexed())); geo.computeVertexNormals();
    const count = this.low ? 260 : 480, im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }), count);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const a = R() * 6.283, d = 28 + Math.pow(R(), 0.7) * 95, x = Math.cos(a) * d, z = Math.sin(a) * d, s = 0.8 + R() * 0.9;
      m.compose(new THREE.Vector3(x, heightAt(x, z) - 0.3, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6), new THREE.Vector3(s, s * (0.9 + R() * 0.3), s));
      im.setMatrixAt(i, m); im.setColorAt(i, new THREE.Color().setHSL(0.27, 0.3, 0.7 + R() * 0.2));
    }
    im.castShadow = im.receiveShadow = true; this.scene.add(im); this.forest = im;
  }
  buildGrass() {
    const v = [], cl = [];
    for (let b = 0; b < 5; b++) {
      const a = R() * Math.PI, ox = (R() - 0.5) * 0.3, oz = (R() - 0.5) * 0.3, h = 0.3 + R() * 0.4, w = 0.05, dx = Math.cos(a) * w, dz = Math.sin(a) * w, l = (R() - 0.5) * 0.25;
      v.push(ox - dx, 0, oz - dz, ox + dx, 0, oz + dz, ox + l, h, oz + l * 0.5); cl.push(0.12, 0.18, 0.06, 0.12, 0.18, 0.06, 0.42, 0.5, 0.22);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0,1.0,0.0);')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 ip = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
          transformed.x += (sin(uTime*1.6 + ip.x*0.25 + ip.z*0.18) + 0.5*sin(uTime*3.1+ip.x*0.7)) * 0.09 * position.y;`);
    };
    const count = this.low ? 9000 : 22000, im = new THREE.InstancedMesh(g, mat, count), m = new THREE.Matrix4();
    let i = 0;
    while (i < count) {
      const a = R() * 6.283, d = 12 + Math.sqrt(R()) * 70, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.abs(d - 20) < 2.2) continue;
      const s = 0.7 + R() * 0.9;
      m.compose(new THREE.Vector3(x, heightAt(x, z) - 0.05, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6), new THREE.Vector3(s, s, s));
      im.setMatrixAt(i, m); im.setColorAt(i, new THREE.Color().setHSL(0.22 + R() * 0.06, 0.4, 0.4 + R() * 0.3)); i++;
    }
    im.receiveShadow = true; this.scene.add(im);
    this.grass = im; this.grassM = new Float32Array(im.instanceMatrix.array);
  }
  /** sembunyikan rumput di dalam radius r (plaza/jalan tema) */
  clearGrass(r) {
    const arr = this.grass.instanceMatrix.array, src = this.grassM;
    for (let i = 0; i < this.grass.count; i++) {
      const o = i * 16, x = src[o + 12], z = src[o + 14], hide = r > 0 && Math.hypot(x, z) < r;
      for (let k = 0; k < 16; k++) arr[o + k] = hide ? (k === 15 ? 1 : 0) : src[o + k];
    }
    this.grass.instanceMatrix.needsUpdate = true;
  }
  /** tema desa: 'kampung' | 'pasar' | 'modern' */
  setTheme(name) {
    name = ['kampung', 'pasar', 'modern', 'kantor'].includes(name) ? name : 'kampung';
    if (this.themeName === name) return;
    this.themeName = name;
    this.themes = this.themes || {};
    if (!this.themes[name]) this.themes[name] = buildTheme(name, { scene: this.scene, heightAt, uTime: this.uTime, stoneMat: this.stoneMat, village: this });
    for (const [k, t] of Object.entries(this.themes)) t.group.visible = k === name;
    const t = this.themes[name];
    this.cabins.visible = !!t.cabins;
    // tema dalam ruangan: sembunyikan langit, hutan, tanah, api unggun, kunang-kunang, kabut tanah
    const out = !t.indoor; this.indoor = !!t.indoor;
    for (const o of [this.sky, this.stars, this.moon, this.forest, this.ground, this.fireGroup, this.flies]) if (o) o.visible = out;
    this.fx.fog?.forEach((f) => (f.visible = out));
    this.scene.background = out ? null : new THREE.Color(0x1a1b1e);
    this.clearGrass(t.grassClear || 0);
    this.theme = t;
  }
  buildHouses() {
    this.cabins = new THREE.Group(); this.scene.add(this.cabins);
    const wood = T.woodPlanks(), roof = T.roofShingles(), rock = T.rockTexture();
    const wallMat = new THREE.MeshStandardMaterial({ map: T.tex.toTexture(wood, 1), normalMap: T.normalFrom(wood, 2), roughness: 0.85 });
    const roofMat = new THREE.MeshStandardMaterial({ map: T.tex.toTexture(roof, 2), normalMap: T.normalFrom(roof, 3, 2), roughness: 0.9 });
    const stoneMat = new THREE.MeshStandardMaterial({ map: T.tex.toTexture(rock, 2), roughness: 0.95, color: 0x777370 });
    this.stoneMat = stoneMat;
    this.windowMats = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3, d = 24 + R() * 3, x = Math.cos(a) * d, z = Math.sin(a) * d;
      const g = new THREE.Group(), w = 6 + R() * 2, dp = 5 + R() * 1.5, h = 3.2;
      const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.8, dp + 0.4), stoneMat); base.position.y = 0;
      const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, dp), wallMat); walls.position.y = h / 2 + 0.4;
      const rr = dp * 0.64, rg = new THREE.CylinderGeometry(rr, rr, w + 0.8, 3); rg.rotateZ(Math.PI / 2); rg.rotateX(-Math.PI / 2); rg.scale(1, 0.75, 1);
      const rf = new THREE.Mesh(rg, roofMat); rf.position.y = h + 0.4 + rr * 0.375;
      const ch = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.4, 0.8), stoneMat); ch.position.set(w * 0.28, h + 1.9, dp * 0.15);
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2, 0.1), new THREE.MeshStandardMaterial({ color: 0x2a1a10 })); door.position.set(0, 1.4, dp / 2 + 0.05);
      const wm = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffa040, emissiveIntensity: 0.2 }); this.windowMats.push(wm);
      for (const sx of [-1, 1]) { const wn = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.8), wm); wn.position.set(sx * w * 0.3, 2.2, dp / 2 + 0.02); g.add(wn); }
      g.add(base, walls, rf, ch, door);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
      g.position.set(x, heightAt(x, z), z); g.lookAt(0, g.position.y, 0);
      this.cabins.add(g);
    }
  }
  buildFire() {
    const logMat = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.9, map: T.tex.toTexture(T.barkTexture(), 1) });
    const f = new THREE.Group();
    for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.6, 6), logMat); l.rotation.z = Math.PI / 2 - 0.5; l.rotation.y = (i / 5) * 6.28; l.position.y = 0.3; l.castShadow = true; f.add(l); }
    for (let i = 0; i < 12; i++) { const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25), this.stoneMat); s.position.set(Math.cos(i / 12 * 6.28) * 1.1, 0.1, Math.sin(i / 12 * 6.28) * 1.1); s.castShadow = true; f.add(s); }
    f.position.y = heightAt(0, 0); this.scene.add(f); this.fireGroup = f;
    this.fireLight = new THREE.PointLight(0xff8a3a, 30, 30, 1.5); this.fireLight.position.set(0, f.position.y + 1.3, 0);
    this.fireLight.castShadow = !this.low; this.fireLight.shadow.mapSize.set(512, 512); this.scene.add(this.fireLight);
    const n = 140; this.fireData = Array.from({ length: n }, () => ({ life: Math.random(), x: 0, z: 0, s: 0.5 + Math.random() }));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.fireP = new THREE.Points(g, new THREE.PointsMaterial({ map: T.glowSprite('255,150,60'), size: 0.9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffaa55 }));
    this.fireP.position.copy(f.position); this.scene.add(this.fireP);
  }
  buildFireflies() {
    const n = 120; this.fly = [];
    for (let i = 0; i < n; i++) { const a = R() * 6.28, d = 14 + R() * 40; this.fly.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, y: 0.6 + R() * 2, ph: R() * 10 }); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.flies = new THREE.Points(g, new THREE.PointsMaterial({ map: T.glowSprite('210,255,140'), size: 0.35, color: 0xd8ff8a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.flies);
  }

  setTimeOfDay(t) { this.targetTime = t; }
  applyTime(dt) {
    let d = this.targetTime - this.time; if (d > 0.5) d -= 1; if (d < -0.5) d += 1;
    this.time = (this.time + d * Math.min(1, dt * 1.6) + 1) % 1;
    const ang = (this.time - 0.25) * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(ang) * 0.8, Math.sin(ang), 0.45).normalize();
    const moonDir = sunDir.clone().negate(); moonDir.y = Math.abs(moonDir.y) * 0.8 + 0.3; moonDir.normalize();
    const elev = sunDir.y, nf = smoothstep(0.12, -0.18, elev);
    this.nightFactor = nf;
    this.sky.material.uniforms.sunPosition.value.copy(sunDir);
    this.sky.material.uniforms.rayleigh.value = lerp(1.6, 0.4, nf);
    const dir = nf > 0.5 ? moonDir : sunDir;
    this.sun.position.copy(dir).multiplyScalar(120); this.sun.target.position.set(0, 0, 0);
    const dusk = smoothstep(0.35, 0, Math.abs(elev));
    this.sun.color.set(0xfff1dd).lerp(new THREE.Color(0xff9a55), dusk).lerp(new THREE.Color(0x8fa6ff), nf);
    this.sun.intensity = Math.max(smoothstep(-0.05, 0.25, elev) * 2.6, 1.1 * smoothstep(0.5, 1, nf));
    this.hemi.intensity = lerp(0.55, 0.38, nf);
    this.hemi.color.set(0xbfd4ff).lerp(new THREE.Color(0x5a6fb0), nf);
    this.hemi.groundColor.set(0x3a3020).lerp(new THREE.Color(0x0a0a12), nf);
    this.scene.fog.color.set(0xa7b6c4).lerp(new THREE.Color(0xd59a6e), dusk * 0.6).lerp(new THREE.Color(0x0b1222), nf);
    this.scene.fog.density = lerp(0.006, 0.014, nf);
    this.stars.material.opacity = nf;
    this.moon.position.copy(moonDir).multiplyScalar(1100);
    this.moon.material.opacity = smoothstep(0.1, 0.6, nf); this.moonHalo.material.opacity = 0.45 * nf;
    this.moon.material.color.set(0xe8eeff).lerp(new THREE.Color(0xff9a88), nf * 0.55); // bulan darah
    this.moonHalo.material.color.set(0x9fb4ff).lerp(new THREE.Color(0xff6a5a), nf * 0.6);
    const lamp = smoothstep(0.2, 0.7, nf);
    for (const w of this.windowMats) w.emissiveIntensity = lerp(0.15, 2.2, lamp);
    this.flies.material.opacity = lamp * 0.9;
    this.renderer.toneMappingExposure = lerp(0.95, 1.25, nf);
  }

  // ---------------- avatar ----------------
  sync(players, opts = {}) {
    this._lastPlayers = players; this._lastOpts = opts;
    const seated = players.filter((p) => !p.isMod);
    const mod = players.find((p) => p.isMod);
    const ids = new Set(seated.map((p) => p.id));
    for (const [id, a] of this.avatars) if (!ids.has(id)) {
      disposeDeep(a.root); a.label.remove(); disposeDeep(a.grave); this.avatars.delete(id);
      this.deathQueue = this.deathQueue.filter((x) => x !== a); if (this.cine?.a === a) this.cine = null;
    }
    const n = seated.length, rad = Math.max(6, n * 0.75);
    // saat podium: pemain hidup yang tidak naik podium mundur jadi penonton di belakang
    const crowd = this.podiumIds.length ? seated.filter((p) => p.alive && !this.podiumIds.includes(p.id)).map((p) => p.id) : [];
    seated.forEach((p, i) => {
      let a = this.avatars.get(p.id);
      if (!a) {
        // tiap warga dapat tipe kostum berbeda (16 tipe, tidak kembar selama ≤16 pemain)
        const used = new Set([...this.avatars.values()].map((x) => x.variant));
        let variant = 0; while (used.has(variant) && variant < VARIANTS.length - 1) variant++;
        const rig = (humansReady() && createReal({ color: p.color, seed: p.id + p.name, uTime: this.uTime, variant: VARIANTS[variant] })) || createHero({ color: p.color, seed: p.id + p.name, uTime: this.uTime });
        const root = new THREE.Group(); root.add(rig.root);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; root.add(ring);
        const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2.2, 8), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 1.1; hit.userData.pid = p.id; root.add(hit);
        const label = document.createElement('div'); label.className = 'plabel'; this.labels.appendChild(label);
        this.scene.add(root);
        a = { rig, root, ring, hit, label, angle: 0, deadT: 0, bubbleT: 0, wasAlive: p.alive, variant };
        if (!p.alive) a.deadPose = { x: -Math.PI / 2, z: 0, y: 0.15 };
        this.avatars.set(p.id, a);
      }
      a.p = p;
      const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
      a.seat = new THREE.Vector3(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
      a.seat.y = heightAt(a.seat.x, a.seat.z);
      const rank = this.podiumIds.indexOf(p.id);
      a.onPodium = rank >= 0 && this.fx.spots;
      const ci = crowd.indexOf(p.id);
      if (a.onPodium) a.target = this.fx.spots[rank].clone();
      else if (ci >= 0) {
        // dua sayap kiri-kanan di belakang podium, tengah dikosongkan supaya juara 1 terlihat
        const half = Math.ceil(crowd.length / 2), left = ci < half, j = left ? ci : ci - half, cnt = left ? half : crowd.length - half;
        const f = cnt > 1 ? j / (cnt - 1) : 0.5, ca = left ? -Math.PI * (0.62 + 0.3 * f) : -Math.PI * (0.08 + 0.3 * f), cr = rad + 1.2;
        a.target = new THREE.Vector3(Math.cos(ca) * cr, 0, Math.sin(ca) * cr); a.target.y = heightAt(a.target.x, a.target.z);
      } else a.target = a.seat.clone();
      a.rank = rank;
      if (!a.placed) { a.root.position.copy(a.target); a.placed = true; }
      a.root.rotation.y = a.onPodium ? 0 : ci >= 0 ? Math.atan2(-a.target.x, 6 - a.target.z) : Math.atan2(-a.target.x, -a.target.z);
      // transisi hidup → mati: antrekan animasi kematian sesuai penyebab
      if (a.wasAlive && !p.alive && !a.death && !a.pending) { a.pending = { kind: p.cause || 'other', killer: p.killer }; this.deathQueue.push(a); }
      a.wasAlive = p.alive;
      // werewolf terungkap di akhir game
      const showWolf = opts.reveal && p.role === 'werewolf';
      if (showWolf && !a.wolf) { a.wolf = upgradeWolf(makePlayerWerewolf(), this.uTime); a.root.add(a.wolf.root); a.rig.root.visible = false; a.wolfT = 0; }
      if (!showWolf && a.wolf) { disposeDeep(a.wolf.root); a.wolf = null; a.rig.root.visible = true; }
      if (!p.alive && !a.grave && !a.pending && !a.death) this.makeGrave(a, true);
      // jasad di sisi kamera disembunyikan saat podium supaya tidak menghalangi
      const hideFront = this.podiumIds.length && !a.onPodium && !p.alive && a.seat.z > 1.5;
      a.root.visible = !hideFront;
      if (a.grave) a.grave.visible = !a.onPodium && !hideFront;
      if (p.alive && (a.grave || a.deadPose || a.death || a.pending)) this.revive(a);
    });
    // moderator berdiri di dekat api
    this.modRig.root.visible = !!mod;
    if (mod) { this.modRig.root.position.set(0, heightAt(0, 2.6), 2.6); this.modRig.root.rotation.y = Math.PI; this.modId = mod.id; this.modName = mod.name; }
  }
  /** Ganti semua avatar (dan moderator) ke model realistis setelah selesai dimuat */
  swapRigs() {
    for (const a of this.avatars.values()) {
      if (a.rig.kind === 'real') continue;
      const nr = createReal({ color: a.p.color, seed: a.p.id + a.p.name, uTime: this.uTime, variant: VARIANTS[a.variant] }); if (!nr) return;
      const old = a.rig.root;
      nr.root.rotation.copy(old.rotation); nr.root.position.copy(old.position);
      nr.root.visible = old.visible && !a.wolf;
      disposeDeep(old); a.root.add(nr.root); a.rig = nr;
      a.rig.setDead?.(!a.p.alive);
    }
    const m = createReal({ color: '#ffe2a0', seed: 'moderator', variant: MOD_VARIANT, uTime: this.uTime });
    if (m) { m.root.position.copy(this.modRig.root.position); m.root.rotation.copy(this.modRig.root.rotation); m.root.visible = this.modRig.root.visible; disposeDeep(this.modRig.root); this.scene.add(m.root); this.modRig = m; }
  }
  makeGrave(a, instant) {
    a.grave = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1, 0.18), this.stoneMat); slab.position.y = 0.4; slab.castShadow = true;
    const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ map: this.fx.circle.material.map, color: 0xff5040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    rune.position.set(0, 0.5, 0.095); slab.add(rune);
    a.grave.add(slab);
    a.grave.position.copy(a.seat).add(a.seat.clone().setY(0).normalize().multiplyScalar(1.3));
    a.grave.lookAt(0, a.grave.position.y, 0); a.grave.scale.y = instant ? 1 : 0.001; a.graveT = instant ? 1 : 0;
    this.scene.add(a.grave);
  }
  revive(a) {
    disposeDeep(a.grave);
    a.grave = null; a.deadPose = null; a.death = null; a.pending = null; a.deadT = 0;
    this.deathQueue = this.deathQueue.filter((x) => x !== a);
    a.rig.root.rotation.set(0, 0, 0); a.rig.root.position.set(0, 0, 0);
    a.rig.root.children.filter((c) => c.isGroup && c.userData.arrow).forEach((c) => disposeDeep(c));
    for (const m of a.rig.mats || []) if (m.emissive) { m.emissive.setHex(0x000000); m.emissiveIntensity = 1; }
  }
  /** Pemain yang naik podium (urut peringkat 1,2,3) atau [] untuk menyembunyikan */
  setPodium(ids) {
    const next = (ids || []).slice(0, 3), key = next.join(',');
    // tunda podium sampai animasi kematian terakhir selesai
    if (next.length && (this.deathQueue.length || this.cine)) { clearTimeout(this._podT); this._podT = setTimeout(() => { this.setPodium(ids); this.sync(this._lastPlayers || [], this._lastOpts || {}); }, 400); return; }
    clearTimeout(this._podT);
    if (key === this.podiumIds.join(',')) return;
    this.podiumIds = next;
    this.fx.showPodium(next.length > 0);
    if (next.length) { this.podiumCamT = 0; this.camHold = 0; }
  }
  /** urutkan antrean kematian sesuai urutan di log sistem */
  orderDeaths(ids) { this.deathQueue.sort((x, y) => ids.indexOf(x.p.id) - ids.indexOf(y.p.id)); }
  hasPendingDeath(id) { const a = this.avatars.get(id); return !!(a && (a.pending || a.death)); }
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }
  flashRed(a) { this.redPulse = Math.max(this.redPulse, a); }
  startDeath(a) {
    const pend = a.pending; a.pending = null;
    let from = null;
    if (pend.killer) { const k = this.avatars.get(pend.killer); if (k) from = (k.grave ? k.grave.position : k.root.position).clone(); }
    a.death = this.fx.death(pend.kind, a, from);
    // simpan posisi kamera sebelum zoom-in, untuk dikembalikan setelah animasi
    // posisi kamera ASLI disimpan sekali saja (sebelum korban pertama); tidak ditimpa oleh korban berikutnya
    if (!this.preCam) { this.preCam = this.camera.position.clone(); this.preTarget = this.controls.target.clone(); }
    this.cine = { a, t: 0, dur: a.death.dur + 0.5 }; this.camHold = 0; this.restoreT = 0;
    this.cineGap = a.death.dur + 0.9; // antre penuh: korban berikutnya baru mulai setelah animasi ini selesai
    this.onDeathStart?.(a.p.id, a.death.dur + 0.9);
  }
  poseDeath(a, dt) {
    const d = a.death, t = (d.t += dt), r = a.rig.root;
    let rx = 0, rz = 0, y = 0, crouch = 0, opts = {};
    switch (d.kind) {
      case 'wolf': crouch = seg(t, 0.3, 0.75) * 0.12; rx = -Math.PI / 2 * ease(seg(t, 0.8, 1.35)); y = 0.15 * seg(t, 0.8, 1.35); opts.aim = t < 0.8 && t > 0.4; break;
      case 'vote': {
        const lift = ease(seg(t, 0.6, 1.8)) * 1.2 * (1 - ease(seg(t, 2.05, 2.3)));
        y = lift + 0.15 * seg(t, 2.1, 2.6); rx = Math.PI / 2 * ease(seg(t, 2.1, 2.6)) - Math.sin(seg(t, 0.6, 2.05) * Math.PI) * 0.25;
        r.rotation.y = Math.sin(t * 2) * 0.15 * seg(t, 0.6, 1.5) * (1 - seg(t, 2, 2.1));
        opts.aim = t > 0.8 && t < 2.05; break;
      }
      case 'poison': {
        crouch = ease(seg(t, 0.4, 1.4)) * 0.38; rx = Math.PI / 2 * ease(seg(t, 1.6, 2.3)); y = 0.12 * seg(t, 1.6, 2.3);
        const g = seg(t, 0.2, 1.5); for (const m of a.rig.mats || []) if (m.emissive) { m.emissive.setHex(0x22ff55); m.emissiveIntensity = g * (0.6 + Math.sin(t * 9) * 0.2); }
        break;
      }
      case 'hunter': { const k = seg(t, 0.55, 0.95); rx = -Math.PI / 2 * (ease(k) + Math.sin(k * Math.PI) * 0.12); y = 0.15 * k; break; }
      case 'sniper': { const k = seg(t, 1.05, 1.4); crouch = t < 1.05 ? seg(t, 0.2, 0.6) * 0.05 : 0; rx = -Math.PI / 2 * (ease(k) + Math.sin(k * Math.PI) * 0.15); y = 0.15 * k; opts.aim = false; break; }
      case 'guard': crouch = ease(seg(t, 0.9, 1.6)) * 0.35; rz = Math.PI / 2 * ease(seg(t, 1.6, 2.2)); y = 0.15 * seg(t, 1.6, 2.2); opts.aim = t < 0.9; break;
      default: rx = -Math.PI / 2 * ease(seg(t, 0, 0.7)); y = 0.15 * seg(t, 0, 0.7);
    }
    r.rotation.x = rx; r.rotation.z = rz; r.position.y = y;
    a.rig.update(dt, 0, { crouch, ...opts });
    if (t >= d.dur) {
      a.deadPose = { x: rx, z: rz, y }; a.death = null;
      for (const m of a.rig.mats || []) if (m.emissive && d.kind === 'poison') m.emissiveIntensity = 0.15;
      if (!a.grave && !a.p.alive) this.makeGrave(a, false);
    }
  }

  /** decorations: { [id]: { ring:'#hex', badge:'text', role:'🐺', you:true, selectable:true } } */
  decorate(map) { this.deco = map || {}; }
  bubble(id, text) { const a = this.avatars.get(id); if (a) { a.bubble = text.slice(0, 60); a.bubbleT = 4; } }
  howl() { for (const a of this.avatars.values()) if (a.wolf) a.wolfT = 0.001; }

  pick(e) {
    this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObjects([...this.avatars.values()].map((a) => a.hit));
    if (hits[0]) this.onPick?.(hits[0].object.userData.pid);
  }
  hover(e) {
    this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hit = this.raycaster.intersectObjects([...this.avatars.values()].map((a) => a.hit))[0];
    this.hoverId = hit ? hit.object.userData.pid : null;
    this.renderer.domElement.style.cursor = this.hoverId && this.deco?.[this.hoverId]?.selectable ? 'pointer' : 'grab';
  }

  loop() {
    const dt = Math.min(0.05, this.clock.getDelta()), t = this.clock.elapsedTime;
    this.uTime.value = t;
    this.applyTime(dt);
    this.camera.position.sub(this.shakeOff);
    this.cameraDirector(dt);
    this.controls.update();
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.2);
    this.shakeOff.set((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(this.shakeAmt * 0.6);
    this.camera.position.add(this.shakeOff);
    this.fx.update(dt); this.fx.ambienceUpdate(dt, t, this.nightFactor || 0); this.fx.podiumUpdate(dt);
    this.theme?.update(dt, t, this.nightFactor || 0);
    this.redPulse = Math.max(0, this.redPulse - dt * 0.5);
    this.grade.uniforms.uTime.value = t; this.grade.uniforms.uRed.value = this.redPulse * 0.6;
    this.grade.uniforms.uVig.value = 0.75 + (this.nightFactor || 0) * 0.25;
    // antrean kematian dimainkan satu per satu
    this.cineGap -= dt;
    if (this.deathQueue.length && this.cineGap <= 0) this.startDeath(this.deathQueue.shift());
    // api & kunang-kunang
    const fp = this.fireP.geometry.attributes.position;
    this.fireData.forEach((d, i) => { d.life += dt * 0.9 * d.s; if (d.life > 1) { d.life = 0; d.x = (Math.random() - 0.5) * 0.6; d.z = (Math.random() - 0.5) * 0.6; } fp.setXYZ(i, d.x * (1 - d.life), 0.3 + d.life * 2.2, d.z * (1 - d.life)); });
    fp.needsUpdate = true;
    this.fireOn += ((this.podiumIds.length || this.indoor ? 0 : 1) - this.fireOn) * Math.min(1, dt * 3);
    this.fireLight.intensity = (26 + Math.sin(t * 13) * 3 + Math.sin(t * 7.3) * 4 + Math.random() * 2) * this.fireOn;
    this.fireP.visible = this.fx.embers.visible = this.fireOn > 0.05;
    const ff = this.flies.geometry.attributes.position;
    this.fly.forEach((d, i) => ff.setXYZ(i, d.x + Math.sin(t * 0.5 + d.ph) * 1.5, heightAt(d.x, d.z) + d.y + Math.sin(t * 1.3 + d.ph) * 0.4, d.z + Math.cos(t * 0.4 + d.ph) * 1.5));
    ff.needsUpdate = true;
    this.modRig.update(dt, 0);

    // avatar & label
    const W = innerWidth, H = innerHeight, v = new THREE.Vector3();
    for (const [id, a] of this.avatars) {
      const p = a.p, deco = this.deco?.[id] || {};
      a.root.position.lerp(a.target, Math.min(1, dt * 3));
      const standing = p.alive || a.pending || a.onPodium;
      a.rig.setDead?.(!standing && !a.death);
      if (a.onPodium) {
        a.rig.root.rotation.set(0, 0, 0); a.rig.root.position.y = 0;
        a.cheer = ((a.cheer || a.rank * 0.4) + dt * 0.7) % 1.6; // perayaan bergantian
        if (a.wolf && !(a.wolfT > 0) && Math.random() < dt * 0.5) a.wolfT = 0.001;
      } else if (a.death) this.poseDeath(a, dt);
      else if (!p.alive && !a.pending && a.deadPose) { a.rig.root.rotation.x = a.deadPose.x; a.rig.root.rotation.z = a.deadPose.z; a.rig.root.position.y = a.deadPose.y; }
      if (a.grave && a.graveT < 1) { a.graveT = Math.min(1, a.graveT + dt * 1.5); a.grave.scale.y = Math.max(0.001, ease(a.graveT)); }
      if (a.wolf) { a.wolf.update(dt, 0, { howl: a.wolfT > 0 ? a.wolfT : 0 }); if (a.wolfT > 0) { a.wolfT += dt * 0.4; if (a.wolfT > 1) a.wolfT = 0; } }
      else if (a.onPodium) a.rig.update(dt, 0, { attack: a.cheer < 1 ? a.cheer : 0, attackArm: a.rank % 2, dance: true });
      else if (standing && !a.death) a.rig.update(dt, 0, { attack: a.waveT > 0 ? a.waveT : 0 });
      const showRing = deco.ring || (this.hoverId === id && deco.selectable);
      a.ring.material.opacity += ((showRing ? 0.9 : 0) - a.ring.material.opacity) * Math.min(1, dt * 10);
      if (deco.ring) a.ring.material.color.set(deco.ring); else if (this.hoverId === id) a.ring.material.color.set(0xffffff);
      a.ring.scale.setScalar(1 + (deco.ring ? Math.sin(t * 4) * 0.06 : 0));
      // label DOM
      v.copy(a.root.position); const lh = a.rig.kind === 'real' ? (a.rig.height || 1.8) + 0.62 : 2.6; v.y += (p.alive || a.onPodium || a.pending) ? (a.wolf ? 3.3 : lh) : a.death ? lh : 1.2; v.project(this.camera);
      const off = v.z > 1 || !a.root.visible;
      a.label.style.display = off ? 'none' : '';
      if (!off) {
        a.label.style.transform = `translate(-50%,-100%) translate(${(v.x * 0.5 + 0.5) * W}px,${(-v.y * 0.5 + 0.5) * H}px)`;
        if (a.bubbleT > 0) a.bubbleT -= dt;
        const html = `${a.bubbleT > 0 ? `<div class="bubble">${esc(a.bubble)}</div>` : ''}<div class="pname ${p.alive ? '' : 'dead'} ${deco.you ? 'you' : ''}" style="--c:${p.color}">${deco.role ? `<span class="ri">${deco.role}</span>` : ''}${esc(p.name)}${p.connected ? '' : ' <span class="off">⚠</span>'}${deco.badge ? `<span class="badge">${deco.badge}</span>` : ''}</div>`;
        if (html !== a.lastHtml) { a.label.innerHTML = html; a.lastHtml = html; }
      }
    }
    if (this.bloom.enabled && !this.low) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }
}

Village.prototype.cameraDirector = function (dt) {
  const c = this.controls;
  if (this.camHold > 0) {
    this.camHold -= dt; if (this.cine) this.cine.t += dt;
    if (this.restoreT > 0) { this.restoreT = 0; this.preCam = null; } // pemain menggeser kamera sendiri saat kembali → biarkan
    return;
  }
  let tgt = this.home, dist = null;
  if (this.cine) {
    this.cine.t += dt;
    tgt = this.cine.a.root.position.clone().setY(this.cine.a.root.position.y + 1.1); dist = 11;
    if (this.cine.t > this.cine.dur) this.cine = null;
  } else if (this.preCam && !this.deathQueue.length && !this.podiumIds.length && this.cineGap <= 0.6) {
    // semua animasi kematian selesai → zoom out kembali ke posisi semula
    if (!(this.restoreT > 0)) this.restoreT = 2.5;
    // zoom out kembali ke posisi kamera semula
    this.restoreT -= dt;
    const k = Math.min(1, dt * 2.2);
    c.target.lerp(this.preTarget, k); this.camera.position.lerp(this.preCam, k);
    if (this.restoreT <= 0) this.preCam = null;
    return;
  } else if (this.podiumIds.length) {
    // podium sedikit di atas tengah layar supaya tidak tertutup panel kontribusi
    tgt = this.podiumAt.clone().add(new THREE.Vector3(0, 0.9, 2.6));
    if (this.podiumCamT < 4) { this.podiumCamT += dt; this.camera.position.lerp(new THREE.Vector3(0, this.podiumAt.y + 3.6, this.podiumAt.z + 12.5), Math.min(1, dt * 2)); }
  }
  c.target.lerp(tgt, Math.min(1, dt * 2.2));
  if (dist) {
    const off = this.camera.position.clone().sub(c.target), len = off.length();
    off.setLength(len + (dist - len) * Math.min(1, dt * 1.5));
    if (off.y < 3) off.y += (3 - off.y) * dt * 2;
    this.camera.position.copy(c.target).add(off);
  }
};

function paint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const v = 1 + (Math.random() - 0.5) * 0.25; a.set([c.r * v, c.g * v, c.b * v], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
}
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
