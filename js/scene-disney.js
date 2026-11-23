// =====================================================================
//  TEMA 1 · Disney: rumah di pulau melayang (luar) + ruang tamu galeri (dalam)
// =====================================================================
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// ---------- helper umum ----------
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const toonGrad = (() => {
  const t = new THREE.DataTexture(new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]), 4, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
const matCache = new Map();
function toon(color, opts = {}) {
  const { unique, ...rest } = opts;
  const key = color + JSON.stringify(rest);
  if (!unique && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonGrad, ...rest });
  if (!unique) matCache.set(key, m);
  return m;
}
function mesh(geo, mat, x = 0, y = 0, z = 0, parent, shadow = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  if (shadow) { m.castShadow = true; m.receiveShadow = true; }
  parent && parent.add(m); return m;
}
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const glowTex = canvasTex(128, 128, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,.55)");
  gr.addColorStop(0.6, "rgba(255,255,255,.12)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
const sparkTex = canvasTex(128, 128, (g, w, h) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.15, "rgba(255,255,255,.8)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(255,255,255,.9)";
  g.beginPath(); g.moveTo(64, 4); g.lineTo(69, 59); g.lineTo(124, 64); g.lineTo(69, 69); g.lineTo(64, 124); g.lineTo(59, 69); g.lineTo(4, 64); g.lineTo(59, 59); g.closePath(); g.fill();
});
function glowSprite(color, scale, opacity = 1, tex = glowTex) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(scale); return s;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function shade(hex, amt) { const c = new THREE.Color(hex); const hsl = {}; c.getHSL(hsl); c.setHSL(hsl.h, hsl.s, clamp(hsl.l + amt, 0, 1)); return "#" + c.getHexString(); }

// =====================================================================
export class HouseWorld {
  constructor(canvas, data, cb = {}) {
    this.canvas = canvas; this.data = data; this.cb = cb;
    this.mode = "intro"; // intro | outside | entering | inside | focus | exiting
    this.tweens = []; this.clock = new THREE.Clock(); this.time = 0;
    this.pointer = new THREE.Vector2(-9, -9); this.mouseN = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.hovered = null;

    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 600);
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3();

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.5, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.buildExterior();
    this.buildInterior();
    this.showWorld("outside");

    // orbit luar
    this.orbit = { theta: -1.25, r: 50, y: 26, drag: 0, dragV: 0 };
    this.look = { yaw: 0, pitch: -0.03, yawT: 0, pitchT: -0.03 };
    this.standPos = new THREE.Vector3(0, 1.75, 3.3);

    this.bindEvents();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------------
  tween(dur, onUpdate, { easing = ease.inOut, delay = 0, onDone, tag } = {}) {
    if (tag) this.tweens = this.tweens.filter((x) => x.tag !== tag); // satu animasi kamera saja pada satu waktu
    const tw = { dur, t: -delay, onUpdate, easing, onDone, tag };
    this.tweens.push(tw); return tw;
  }
  after(sec, fn) { return this.tween(sec, () => {}, { onDone: fn, easing: (x) => x }); }
  stepTweens(dt) {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i]; tw.t += dt;
      if (tw.t < 0) continue;
      const p = clamp(tw.t / tw.dur, 0, 1);
      tw.onUpdate(tw.easing(p), p);
      if (p >= 1) { this.tweens.splice(i, 1); tw.onDone && tw.onDone(); }
    }
  }

  showWorld(which) {
    this.world = which;
    this.ext.visible = which === "outside";
    this.int.visible = which === "inside";
    this.scene.fog = which === "outside" ? this.extFog : null;
    this.scene.background = which === "outside" ? null : new THREE.Color("#1d1430");
    this.bloom.strength = which === "outside" ? 0.5 : 0.32;
    this.camera.fov = which === "outside" ? 45 : (innerWidth < innerHeight ? 72 : 58);
    this.camera.updateProjectionMatrix();
  }

  // ==================================================================
  //  LUAR RUMAH
  // ==================================================================
  buildExterior() {
    const g = (this.ext = new THREE.Group()); this.scene.add(g);
    this.extFog = new THREE.Fog("#3a2a6e", 60, 220);
    const R = rng(7);

    // --- langit senja ---
    const sky = new THREE.Mesh(new THREE.SphereGeometry(260, 48, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color("#0b1243") }, mid: { value: new THREE.Color("#5a3a95") },
        warm: { value: new THREE.Color("#ffa77f") }, deep: { value: new THREE.Color("#24164f") },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `uniform vec3 top, mid, warm, deep; varying vec3 vP;
        void main(){ float h = vP.y;
          vec3 c = mix(warm, mid, smoothstep(-0.02, 0.22, h));
          c = mix(c, top, smoothstep(0.22, 0.8, h));
          c = mix(c, deep, smoothstep(-0.03, -0.5, h));
          gl_FragColor = vec4(c, 1.0); }`,
    }));
    sky.renderOrder = -10; g.add(sky);

    // bintang berkelip
    const N = 1400, sp = new Float32Array(N * 3), ss = new Float32Array(N), sph = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const th = R() * Math.PI * 2, y = 0.08 + R() * 0.92, rr = Math.sqrt(1 - y * y);
      sp.set([Math.cos(th) * rr * 240, y * 240, Math.sin(th) * rr * 240], i * 3);
      ss[i] = 1 + R() * 2.6; sph[i] = R() * 6.28;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    sg.setAttribute("size", new THREE.BufferAttribute(ss, 1));
    sg.setAttribute("phase", new THREE.BufferAttribute(sph, 1));
    this.starMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { time: { value: 0 }, pr: { value: this.renderer.getPixelRatio() } },
      vertexShader: `attribute float size; attribute float phase; uniform float time; uniform float pr; varying float vA;
        void main(){ vA = 0.55 + 0.45*sin(time*1.7 + phase); gl_PointSize = size*pr*(0.7+0.5*vA);
        gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d);
        gl_FragColor = vec4(vec3(1.0,0.95,0.85)*1.6, a*vA);} `,
    });
    g.add(new THREE.Points(sg, this.starMat));

    // bulan (tribute untuk si werewolf 🐺)
    const moonPos = new THREE.Vector3(-60, 62, -150);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(9, 32, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.5), fog: false }));
    moon.position.copy(moonPos); g.add(moon);
    const halo = glowSprite("#ffe3b0", 70, 0.55); halo.material.fog = false; halo.position.copy(moonPos); g.add(halo);

    // --- cahaya ---
    g.add(new THREE.HemisphereLight("#a9b8ff", "#6b3f6e", 0.95));
    g.add(new THREE.AmbientLight("#3c2f6b", 0.5));
    const key = new THREE.DirectionalLight("#ffd9b8", 1.7);
    key.position.set(14, 22, 16); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 70 });
    key.shadow.bias = -0.0006; key.shadow.normalBias = 0.03;
    g.add(key);
    const rim = new THREE.DirectionalLight("#8fa2ff", 1.2); rim.position.set(-20, 10, -18); g.add(rim);

    // --- pulau melayang ---
    const island = new THREE.Group(); g.add(island);
    mesh(new THREE.CylinderGeometry(15, 14.7, 1.0, 72), toon("#74c96b"), 0, -0.5, 0, island);
    mesh(new THREE.CylinderGeometry(14.7, 14.2, 0.9, 72), toon("#a8744f"), 0, -1.45, 0, island);
    let coneGeo = new THREE.ConeGeometry(14.2, 11, 10, 4);
    { // jitter vertex agar berbatu, lalu jadikan faceted
      const p = coneGeo.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > -5.4 && y < 5.4) { const k = 0.9 + R() * 0.2; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } }
      coneGeo = coneGeo.toNonIndexed(); coneGeo.computeVertexNormals();
    }
    const cone = mesh(coneGeo, toon("#8a6252"), 0, -7.4, 0, island);
    cone.rotation.x = Math.PI;
    // pulau-pulau kecil melayang
    this.floaters = [];
    [[-21, 2, -6, 1.6], [22, -1, -3, 1.9], [-17, -3, 14, 1.2], [19, 3, 13, 1.1], [3, 5, -24, 1.4]].forEach(([x, y, z, s], i) => {
      const f = new THREE.Group(); f.position.set(x, y, z); f.scale.setScalar(s);
      mesh(new THREE.CylinderGeometry(1.2, 1.1, 0.35, 16), toon("#74c96b"), 0, 0, 0, f);
      const fg0 = new THREE.ConeGeometry(1.1, 1.8, 7).toNonIndexed(); fg0.computeVertexNormals();
      const c = mesh(fg0, toon("#8a6252"), 0, -1.07, 0, f); c.rotation.x = Math.PI;
      if (i % 2 === 0) this.makeTree(f, 0, 0, 0.45, R);
      else { const fl = mesh(new THREE.SphereGeometry(0.35, 12, 10), toon("#ff9ac2"), 0.2, 0.35, 0, f); fl.scale.y = 0.7; }
      f.userData = { base: y, ph: i * 1.3 }; g.add(f); this.floaters.push(f);
    });

    // --- rumah ---
    this.buildHouse(g);

    // --- jalan setapak & lampu taman ---
    for (let i = 0; i < 11; i++) {
      const s = mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.12, 10), toon(i % 2 ? "#d8cfc4" : "#c7bdb1"), Math.sin(i * 0.55) * 0.55, 0.04, 3.9 + i * 1.0, g);
      s.scale.set(0.9 + R() * 0.3, 1, 0.8 + R() * 0.25); s.rotation.y = R() * 3;
    }
    this.lanternLights = [];
    [[-1.6, 5.6], [1.6, 5.6], [-1.6, 10.2], [1.6, 10.2]].forEach(([x, z], i) => {
      const L = new THREE.Group(); L.position.set(x + Math.sin((z - 3.9) * 0.55) * 0.55, 0, z); g.add(L);
      mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.6, 8), toon("#3d3350"), 0, 0.8, 0, L);
      mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.08, 8), toon("#3d3350"), 0, 1.62, 0, L);
      mesh(new THREE.BoxGeometry(0.3, 0.38, 0.3), toon("#ffd27a", { emissive: "#ffb347", emissiveIntensity: 2.6 }), 0, 1.85, 0, L, false);
      const cap = mesh(new THREE.ConeGeometry(0.27, 0.25, 4), toon("#3d3350"), 0, 2.15, 0, L); cap.rotation.y = Math.PI / 4;
      const gl = glowSprite("#ffb85c", 1.8, 0.7); gl.position.y = 1.85; L.add(gl);
      if (i < 2 || i === 3) { const pl = new THREE.PointLight("#ffb35c", 6, 7, 1.6); pl.position.y = 1.9; L.add(pl); this.lanternLights.push(pl); }
    });

    // --- pepohonan & semak ---
    [[-8, -4, 1.2], [-10.5, 2.5, 1.0], [8.5, -5, 1.25], [10.8, 1.5, 0.95], [-6.5, -9, 1.1], [6, -9.5, 1.0],
     [-11.5, 7.5, 0.85], [11.6, 7, 0.9], [0.5, -10.8, 1.15], [-3.8, -11.8, 0.8], [3.8, -12, 0.85], [-12.5, -3, 0.9], [12.6, -4, 0.85]]
      .forEach(([x, z, s], i) => (i % 3 === 1 ? this.makePine(g, x, z, s, R) : this.makeTree(g, x, 0, s, R, z)));
    [[-3.2, 3.4], [-4.3, 3.0], [-4.9, 1.6], [2.0, 3.4], [5.3, 2.4], [5.6, 0.6], [-4.6, -2.8], [4.9, -2.9]].forEach(([x, z]) => {
      const b = new THREE.Group(); b.position.set(x, 0, z); g.add(b);
      for (let k = 0; k < 3; k++) mesh(new THREE.SphereGeometry(0.45 + R() * 0.2, 14, 12), toon(k ? "#4fae5a" : "#5fbf63"), (k - 1) * 0.4, 0.4, (R() - 0.5) * 0.3, b);
      for (let k = 0; k < 4; k++) mesh(new THREE.SphereGeometry(0.08, 8, 6), toon(["#ff7fb0", "#fff07a", "#ffffff"][k % 3]), (R() - 0.5) * 1.1, 0.55 + R() * 0.35, 0.3 + R() * 0.15, b, false);
    });

    // --- bunga & rumput (instanced) ---
    const inGrass = (x, z) => { const d = Math.hypot(x, z); if (d > 14 || d < 2) return false; if (Math.abs(x) < 5.2 && z > -4 && z < 4.2) return false; if (Math.abs(x) < 1.4 && z > 3.4) return false; return true; };
    const flowerCols = ["#ff7fb0", "#ffd84d", "#ffffff", "#c79bff", "#ff9a62", "#7fd3ff"].map((c) => new THREE.Color(c));
    const FN = 380, flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.1, 1), toon("#ffffff"), FN);
    const TN = 900, tufts = new THREE.InstancedMesh(new THREE.ConeGeometry(0.06, 0.38, 4), toon("#4fa955"), TN);
    const dm = new THREE.Object3D();
    let fi = 0, ti = 0, guard = 0;
    while ((fi < FN || ti < TN) && guard++ < 20000) {
      const x = (R() - 0.5) * 29, z = (R() - 0.5) * 29; if (!inGrass(x, z)) continue;
      if (fi < FN && R() < 0.35) {
        dm.position.set(x, 0.12, z); dm.scale.setScalar(0.8 + R() * 0.7); dm.rotation.set(0, 0, 0); dm.updateMatrix();
        flowers.setMatrixAt(fi, dm.matrix); flowers.setColorAt(fi, flowerCols[Math.floor(R() * flowerCols.length)]); fi++;
      } else if (ti < TN) {
        dm.position.set(x, 0.16, z); dm.scale.set(1, 0.6 + R() * 0.9, 1); dm.rotation.set((R() - 0.5) * 0.4, R() * 3, (R() - 0.5) * 0.4); dm.updateMatrix();
        tufts.setMatrixAt(ti++, dm.matrix);
      }
    }
    flowers.count = fi; tufts.count = ti; g.add(flowers, tufts);

    // --- papan nama & kotak surat ---
    const sign = new THREE.Group(); sign.position.set(3.1, 0, 11.2); sign.rotation.y = -0.4; g.add(sign);
    mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.9, 8), toon("#6b4429"), -1.0, 0.95, 0, sign);
    mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.9, 8), toon("#6b4429"), 1.0, 0.95, 0, sign);
    mesh(new RoundedBoxGeometry(2.6, 1.15, 0.14, 3, 0.06), toon("#8a5a34"), 0, 1.45, 0, sign);
    const name = this.data.profile.name || "Saya";
    this.signFace = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.98), new THREE.MeshBasicMaterial({ map: this.signTexture(name), color: new THREE.Color(0.85, 0.85, 0.85), toneMapped: false }));
    this.signFace.position.set(0, 1.45, 0.075); sign.add(this.signFace);

    const mb = new THREE.Group(); mb.position.set(-2.7, 0, 10.6); mb.rotation.y = 0.3; g.add(mb);
    mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 8), toon("#6b4429"), 0, 0.55, 0, mb);
    mesh(new RoundedBoxGeometry(0.5, 0.45, 0.75, 3, 0.15), toon("#4a7fd9"), 0, 1.3, 0, mb);
    mesh(new THREE.BoxGeometry(0.04, 0.35, 0.08), toon("#ff5a5a"), 0.28, 1.45, 0.1, mb);
    mesh(new THREE.BoxGeometry(0.04, 0.12, 0.22), toon("#ff5a5a"), 0.28, 1.6, 0.2, mb);

    // --- awan ---
    this.clouds = [];
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Group(); const a = (i / 9) * Math.PI * 2 + R();
      const rad = 34 + R() * 26; c.userData = { a, rad, y: -8 + R() * 20, sp: 0.006 + R() * 0.01 };
      const n = 4 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) {
        const s = mesh(new THREE.SphereGeometry(1.6 + R() * 1.6, 16, 12), toon(i % 3 ? "#efe6ff" : "#ffd9e8"), (k - n / 2) * 2.1, R() * 0.9, (R() - 0.5) * 1.6, c, false);
        s.scale.y = 0.75;
      }
      c.scale.setScalar(0.9 + R() * 0.9); g.add(c); this.clouds.push(c);
    }

    // --- kunang-kunang ---
    const FFN = 110; this.ffData = [];
    const fpos = new Float32Array(FFN * 3);
    for (let i = 0; i < FFN; i++) this.ffData.push({ x: (R() - 0.5) * 26, y: 0.4 + R() * 3.5, z: (R() - 0.5) * 26, p: R() * 6.28, s: 0.3 + R() * 0.6 });
    const fg = new THREE.BufferGeometry(); fg.setAttribute("position", new THREE.BufferAttribute(fpos, 3));
    this.fireflies = new THREE.Points(fg, new THREE.PointsMaterial({ map: glowTex, color: new THREE.Color(2.2, 2.0, 0.8), size: 0.45, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(this.fireflies);

    // --- asap cerobong ---
    this.smoke = [];
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: "#d9cfee", transparent: true, opacity: 0, depthWrite: false }));
      s.userData.t = i / 9; g.add(s); this.smoke.push(s);
    }
  }

  signTexture(name) {
    return canvasTex(768, 312, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#b77b47"); gr.addColorStop(1, "#8f5a31");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(60,30,10,.35)"; g.lineWidth = 3;
      for (let y = 30; y < h; y += 52) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + 8, w * 0.6, y - 8, w, y + 4); g.stroke(); }
      g.textAlign = "center"; g.textBaseline = "middle";
      g.font = "600 46px Fredoka, Nunito, sans-serif"; g.fillStyle = "#ffe9c4"; g.fillText("✦ Selamat datang di ✦", w / 2, 92);
      g.font = "700 104px Fredoka, Nunito, sans-serif"; g.fillStyle = "#fff6e3";
      g.shadowColor = "rgba(60,25,5,.55)"; g.shadowOffsetY = 5; g.shadowBlur = 6;
      g.fillText(`Rumah ${name}`, w / 2, 200, w - 60);
    });
  }

  makeTree(parent, x, y, s, R, z = 0) {
    const t = new THREE.Group(); t.position.set(x, y, z); t.scale.setScalar(s); parent.add(t);
    mesh(new THREE.CylinderGeometry(0.22, 0.32, 2.2, 8), toon("#7a4b2c"), 0, 1.1, 0, t);
    const greens = ["#4cae55", "#5cc062", "#3f9a4f"];
    [[0, 2.8, 0, 1.45], [-0.8, 2.3, 0.2, 1.0], [0.85, 2.4, -0.1, 1.05], [0.1, 3.7, 0.1, 1.05]].forEach(([a, b, c, r], k) =>
      mesh(new THREE.IcosahedronGeometry(r, 2), toon(greens[k % 3]), a, b, c, t));
    if (R() > 0.5) for (let k = 0; k < 4; k++) mesh(new THREE.SphereGeometry(0.13, 8, 6), toon("#ff6b6b"), (R() - 0.5) * 2, 2.3 + R() * 1.4, 0.9 + R() * 0.3, t, false);
    t.userData.sway = R() * 6; (this.trees ||= []).push(t);
    return t;
  }
  makePine(parent, x, z, s, R) {
    const t = new THREE.Group(); t.position.set(x, 0, z); t.scale.setScalar(s); parent.add(t);
    mesh(new THREE.CylinderGeometry(0.2, 0.28, 1.4, 8), toon("#6e4127"), 0, 0.7, 0, t);
    [[1.7, 1.9, 1.6], [1.35, 1.7, 2.6], [0.95, 1.5, 3.5]].forEach(([r, h, y], k) => mesh(new THREE.ConeGeometry(r, h, 9), toon(k % 2 ? "#3a8f58" : "#2f7d4f"), 0, y, 0, t));
    t.userData.sway = R() * 6; (this.trees ||= []).push(t);
  }

  buildHouse(g) {
    const H = (this.house = new THREE.Group()); g.add(H);
    const cream = toon("#f8e6c6"), stone = toon("#b7a69a"), roofC = toon("#e0604f"), trim = toon("#fff7ea"), wood = toon("#8b4f2c");
    // fondasi & badan
    mesh(new RoundedBoxGeometry(7.5, 0.55, 5.9, 3, 0.12), stone, 0, 0.27, 0, H);
    mesh(new RoundedBoxGeometry(7, 3.6, 5.5, 4, 0.12), cream, 0, 2.3, 0, H);
    // dinding segitiga (gable)
    const tri = new THREE.Shape(); tri.moveTo(-3.5, 0); tri.lineTo(3.5, 0); tri.lineTo(0, 2.5); tri.closePath();
    const gable = mesh(new THREE.ExtrudeGeometry(tri, { depth: 5.4, bevelEnabled: false }), cream, 0, 4.1, -2.7, H);
    // atap
    const ang = Math.atan2(2.5, 3.5), len = Math.hypot(3.5, 2.5) + 0.9;
    [-1, 1].forEach((s) => {
      const slab = mesh(new RoundedBoxGeometry(len, 0.32, 6.5, 2, 0.1), roofC, 0, 0, 0, H);
      slab.position.set(s * 1.75 + s * Math.sin(ang) * 0.16 + s * Math.cos(ang) * 0.25, 5.35 + Math.cos(ang) * 0.16 - Math.sin(ang) * 0.25, 0);
      slab.rotation.z = -s * ang;
      // baris genteng (scallop)
      for (let k = 0; k < 4; k++) {
        const row = mesh(new THREE.CylinderGeometry(0.09, 0.09, 6.5, 8), toon("#c94c3e"), 0, 0, 0, slab);
        row.rotation.x = Math.PI / 2; row.position.set(-len / 2 + 0.5 + k * (len - 0.8) / 3.6, 0.17, 0);
      }
    });
    const ridge = mesh(new THREE.CylinderGeometry(0.22, 0.22, 6.7, 12), toon("#b8433a"), 0, 6.72, 0, H); ridge.rotation.x = Math.PI / 2;

    // cerobong
    const ch = new THREE.Group(); ch.position.set(-2.1, 0, -1.2); H.add(ch);
    mesh(new RoundedBoxGeometry(0.85, 2.4, 0.85, 2, 0.06), toon("#b5624a"), 0, 6.1, 0, ch);
    mesh(new RoundedBoxGeometry(1.05, 0.28, 1.05, 2, 0.06), toon("#8e4636"), 0, 7.35, 0, ch);
    this.chimneyTop = new THREE.Vector3(-2.1, 7.6, -1.2);

    // menara bundar ala dongeng
    const tw = new THREE.Group(); tw.position.set(3.75, 0, 1.75); H.add(tw);
    mesh(new THREE.CylinderGeometry(1.35, 1.45, 0.6, 28), stone, 0, 0.3, 0, tw);
    mesh(new THREE.CylinderGeometry(1.3, 1.3, 6.2, 28), toon("#f3dcb8"), 0, 3.4, 0, tw);
    mesh(new THREE.CylinderGeometry(1.48, 1.48, 0.22, 28), trim, 0, 6.5, 0, tw);
    mesh(new THREE.ConeGeometry(1.85, 3.2, 28), toon("#5b63d6"), 0, 8.2, 0, tw);
    mesh(new THREE.SphereGeometry(0.16, 12, 10), toon("#ffd34d", { emissive: "#ffb000", emissiveIntensity: 0.6 }), 0, 9.9, 0, tw);
    mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6), toon("#444"), 0, 10.4, 0, tw);
    this.flag = mesh(new THREE.PlaneGeometry(0.75, 0.42, 8, 1), new THREE.MeshToonMaterial({ color: "#ffcd3c", gradientMap: toonGrad, side: THREE.DoubleSide }), 0.39, 10.7, 0, tw);
    this.flagBase = this.flag.geometry.attributes.position.array.slice();
    // jendela menara
    [[0, 4.6, 1.31, 0], [1.31, 3.0, 0, Math.PI / 2], [0, 2.6, 1.31, 0]].slice(0, 2).forEach(([x, y, z, ry]) => {
      const w = this.makeRoundWindow(0.42); w.position.set(x, y, z); w.rotation.y = ry; tw.add(w);
    });

    // jendela depan + samping
    const wins = [[-2.2, 2.15, 2.76, 0], [1.4, 2.15, 2.76, 0], [-3.51, 2.3, 0.9, -Math.PI / 2], [-3.51, 2.3, -1.3, -Math.PI / 2], [3.51, 2.3, -1.3, Math.PI / 2]];
    wins.forEach(([x, y, z, ry], i) => { const w = this.makeWindow(i < 2); w.position.set(x, y, z); w.rotation.y = ry; H.add(w); });
    const gw = this.makeRoundWindow(0.5); gw.position.set(0, 5.0, 2.72); H.add(gw);

    // pintu (berengsel di kiri)
    const D = 1.3, Hs = 1.6, r = D / 2;
    const arch = (ww, hs) => { const s = new THREE.Shape(); s.moveTo(-ww / 2, 0); s.lineTo(ww / 2, 0); s.lineTo(ww / 2, hs); s.absarc(0, hs, ww / 2, 0, Math.PI, false); s.lineTo(-ww / 2, 0); return s; };
    // bingkai batu
    const frameShape = arch(D + 0.5, Hs); frameShape.holes.push(arch(D, Hs));
    mesh(new THREE.ExtrudeGeometry(frameShape, { depth: 0.2, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2, curveSegments: 24 }), toon("#cdbdae"), 0, 0.55, 2.68, H);
    // lubang pintu bercahaya (terlihat saat pintu terbuka)
    this.doorwayMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#3a2410") });
    this.doorway = mesh(new THREE.ShapeGeometry(arch(D, Hs), 24), this.doorwayMat, 0, 0.55, 2.765, H, false);
    this.doorPivot = new THREE.Group(); this.doorPivot.position.set(-r, 0.55, 2.8); H.add(this.doorPivot);
    const door = mesh(new THREE.ExtrudeGeometry(arch(D - 0.04, Hs), { depth: 0.1, bevelEnabled: false, curveSegments: 24 }), toon("#9a5530", { unique: true }), r, 0, -0.05, this.doorPivot);
    this.doorMesh = door;
    for (let k = -1; k <= 1; k++) mesh(new THREE.BoxGeometry(0.03, 1.5, 0.02), toon("#6e3a1e"), r + k * 0.32, 0.85, 0.06, this.doorPivot, false);
    mesh(new THREE.BoxGeometry(1.15, 0.08, 0.03), toon("#2e2a33"), r, 0.45, 0.07, this.doorPivot, false);
    mesh(new THREE.BoxGeometry(1.15, 0.08, 0.03), toon("#2e2a33"), r, 1.5, 0.07, this.doorPivot, false);
    mesh(new THREE.SphereGeometry(0.075, 12, 10), toon("#ffd34d", { emissive: "#ffae00", emissiveIntensity: 0.5 }), r + 0.45, 1.05, 0.1, this.doorPivot);
    const dwin = mesh(new THREE.CircleGeometry(0.2, 20), toon("#ffd27a", { emissive: "#ffb347", emissiveIntensity: 2.2 }), r, 1.85, 0.06, this.doorPivot, false);
    void dwin;
    // tangga
    mesh(new RoundedBoxGeometry(2.2, 0.28, 0.7, 2, 0.06), stone, 0, 0.14, 3.2, H);
    mesh(new RoundedBoxGeometry(1.8, 0.28, 0.5, 2, 0.06), toon("#c6b6a9"), 0, 0.42, 2.98, H);
    // kanopi kecil di atas pintu
    const can = mesh(new RoundedBoxGeometry(1.9, 0.16, 1.0, 2, 0.06), roofC, 0, 3.25, 3.15, H); can.rotation.x = 0.28;
    [-0.8, 0.8].forEach((x) => mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), trim, x, 2.98, 3.5, H));

    // cahaya & kilau pintu
    this.doorLight = new THREE.PointLight("#ffcf85", 4, 9, 1.5); this.doorLight.position.set(0, 2.2, 3.6); H.add(this.doorLight);
    this.doorGlow = glowSprite("#ffd890", 3.4, 0.35); this.doorGlow.position.set(0, 1.7, 3.0); H.add(this.doorGlow);
    const SN = 46, spos = new Float32Array(SN * 3); this.sparkData = [];
    for (let i = 0; i < SN; i++) { const a = Math.random() * Math.PI; this.sparkData.push({ a, rr: 0.95 + Math.random() * 0.5, p: Math.random() * 6.28, y0: Math.random() }); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(spos, 3));
    this.sparkles = new THREE.Points(sg, new THREE.PointsMaterial({ map: sparkTex, color: new THREE.Color(2.4, 2.1, 1.3), size: 0.28, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    H.add(this.sparkles);

    this.doorTargets = [door, this.doorway, ...this.doorPivot.children];
  }

  makeWindow(withBox) {
    const w = new THREE.Group();
    const glass = toon("#ffd884", { emissive: "#ffb24d", emissiveIntensity: 1.9 });
    mesh(new RoundedBoxGeometry(1.25, 1.45, 0.14, 2, 0.05), toon("#fff7ea"), 0, 0, 0, w);
    mesh(new THREE.PlaneGeometry(1.0, 1.2), glass, 0, 0, 0.075, w, false);
    mesh(new THREE.BoxGeometry(0.07, 1.2, 0.04), toon("#fff7ea"), 0, 0, 0.09, w, false);
    mesh(new THREE.BoxGeometry(1.0, 0.07, 0.04), toon("#fff7ea"), 0, 0.05, 0.09, w, false);
    [-1, 1].forEach((s) => mesh(new RoundedBoxGeometry(0.42, 1.45, 0.08, 2, 0.03), toon("#3f8f9a"), s * 0.86, 0, 0.04, w));
    if (withBox) {
      mesh(new RoundedBoxGeometry(1.35, 0.3, 0.35, 2, 0.06), toon("#8b5a34"), 0, -0.85, 0.2, w);
      for (let k = 0; k < 6; k++) mesh(new THREE.SphereGeometry(0.11, 10, 8), toon(["#ff7fb0", "#ffd84d", "#c79bff"][k % 3]), -0.5 + k * 0.2, -0.64, 0.22 + (k % 2) * 0.06, w, false);
    }
    return w;
  }
  makeRoundWindow(r) {
    const w = new THREE.Group();
    const ring = mesh(new THREE.TorusGeometry(r, 0.08, 10, 32), toon("#fff7ea"), 0, 0, 0.04, w);
    void ring;
    mesh(new THREE.CircleGeometry(r, 32), toon("#ffd884", { emissive: "#ffb24d", emissiveIntensity: 1.9 }), 0, 0, 0.02, w, false);
    mesh(new THREE.BoxGeometry(0.05, r * 2, 0.03), toon("#fff7ea"), 0, 0, 0.06, w, false);
    mesh(new THREE.BoxGeometry(r * 2, 0.05, 0.03), toon("#fff7ea"), 0, 0, 0.06, w, false);
    return w;
  }

  // ==================================================================
  //  DALAM RUMAH
  // ==================================================================
  buildInterior() {
    const g = (this.int = new THREE.Group()); this.scene.add(g);
    const W = 12, Dz0 = -6, Dz1 = 5, HT = 4.6, R = rng(3);
    const depth = Dz1 - Dz0, cz = (Dz0 + Dz1) / 2;

    const floorTex = canvasTex(512, 512, (c, w, h) => {
      const cols = ["#b77846", "#a96c3c", "#c08451", "#a26637"];
      for (let i = 0; i < 8; i++) {
        c.fillStyle = cols[i % 4]; c.fillRect(0, i * 64, w, 64);
        c.fillStyle = "rgba(0,0,0,.18)"; c.fillRect(0, i * 64 + 61, w, 3);
        const off = (i % 2) * 180 + 90; c.fillRect(off, i * 64, 3, 64); c.fillRect(off + 256, i * 64, 3, 64);
        c.strokeStyle = "rgba(80,40,10,.12)"; c.lineWidth = 2;
        for (let k = 0; k < 3; k++) { c.beginPath(); const y = i * 64 + 14 + k * 16; c.moveTo(0, y); c.bezierCurveTo(150, y + 6, 350, y - 6, 512, y + 3); c.stroke(); }
      }
    }, [3, 3]);
    const floor = mesh(new THREE.PlaneGeometry(W, depth), toon("#ffffff", { map: floorTex }), 0, 0, cz, g); floor.rotation.x = -Math.PI / 2;

    const wallTex = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = "#f6d8c2"; c.fillRect(0, 0, w, h);
      c.fillStyle = "#f1cbb2"; for (let x = 0; x < w; x += 64) c.fillRect(x, 0, 26, h);
      c.fillStyle = "#e9a98e";
      const star = (x, y, r) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.fill(); };
      star(45, 40, 7); star(109, 120, 6); star(173, 50, 7); star(237, 170, 6); star(45, 200, 6); star(173, 230, 6);
    }, [5, 2]);
    const wallMat = toon("#ffffff", { map: wallTex });
    const back = mesh(new THREE.PlaneGeometry(W, HT), wallMat, 0, HT / 2, Dz0, g);
    const left = mesh(new THREE.PlaneGeometry(depth, HT), wallMat, -W / 2, HT / 2, cz, g); left.rotation.y = Math.PI / 2;
    const right = mesh(new THREE.PlaneGeometry(depth, HT), wallMat, W / 2, HT / 2, cz, g); right.rotation.y = -Math.PI / 2;
    const front = mesh(new THREE.PlaneGeometry(W, HT), wallMat, 0, HT / 2, Dz1, g); front.rotation.y = Math.PI;
    void back;
    const ceil = mesh(new THREE.PlaneGeometry(W, depth), toon("#fbe9da"), 0, HT, cz, g); ceil.rotation.x = Math.PI / 2;
    [-4.2, -1.2, 1.8].forEach((z) => mesh(new THREE.BoxGeometry(W, 0.28, 0.32), toon("#8b5a34"), 0, HT - 0.14, z, g));

    // panel kayu bawah (wainscot) + list
    const wain = toon("#3f7f8c"), rail = toon("#fff4e3");
    mesh(new THREE.BoxGeometry(W, 1.05, 0.08), wain, 0, 0.525, Dz0 + 0.04, g);
    mesh(new THREE.BoxGeometry(W, 0.08, 0.14), rail, 0, 1.08, Dz0 + 0.07, g);
    [-1, 1].forEach((s) => {
      mesh(new THREE.BoxGeometry(0.08, 1.05, depth), wain, s * (W / 2 - 0.04), 0.525, cz, g);
      mesh(new THREE.BoxGeometry(0.14, 0.08, depth), rail, s * (W / 2 - 0.07), 1.08, cz, g);
    });
    mesh(new THREE.BoxGeometry(W, 1.05, 0.08), wain, 0, 0.525, Dz1 - 0.04, g);
    // pintu dalam (dinding depan)
    const dIn = mesh(new RoundedBoxGeometry(1.4, 2.6, 0.12, 2, 0.06), toon("#9a5530"), 0, 1.3, Dz1 - 0.08, g); void dIn;

    // karpet
    const rugTex = canvasTex(512, 512, (c, w, h) => {
      const ring = ["#b8324a", "#f2b632", "#b8324a", "#5b3a8f", "#f6e2c4", "#5b3a8f", "#b8324a"];
      ring.forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(256, 256, 256 - i * 30, 0, Math.PI * 2); c.fill(); });
      c.fillStyle = "#f2b632"; for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; c.beginPath(); c.arc(256 + Math.cos(a) * 160, 256 + Math.sin(a) * 160, 9, 0, 7); c.fill(); }
    });
    const rug = mesh(new THREE.CircleGeometry(2.7, 64), toon("#ffffff", { map: rugTex }), 0, 0.012, -1.2, g); rug.rotation.x = -Math.PI / 2; rug.scale.set(1.35, 1, 1);

    // meja bundar + laptop (ngoding & trading)
    const tb = new THREE.Group(); tb.position.set(0, 0, -1.2); g.add(tb);
    mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.09, 32), toon("#8b5a34"), 0, 0.55, 0, tb);
    mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.5, 12), toon("#6b4429"), 0, 0.27, 0, tb);
    mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.05, 24), toon("#6b4429"), 0, 0.03, 0, tb);
    mesh(new RoundedBoxGeometry(0.62, 0.03, 0.42, 2, 0.01), toon("#cfd3dc"), 0, 0.615, 0.05, tb);
    const scr = new THREE.Group(); scr.position.set(0, 0.63, -0.16); scr.rotation.x = -0.25; tb.add(scr);
    mesh(new RoundedBoxGeometry(0.62, 0.42, 0.025, 2, 0.01), toon("#cfd3dc"), 0, 0.21, 0, scr);
    const chartTex = canvasTex(256, 170, (c, w, h) => {
      c.fillStyle = "#0e1630"; c.fillRect(0, 0, w, h);
      c.strokeStyle = "rgba(255,255,255,.08)"; for (let x = 0; x < w; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
      let y = 120; for (let x = 12; x < w - 8; x += 14) { const ny = clamp(y + (R() - 0.55) * 30, 20, 150); c.fillStyle = ny < y ? "#2fd17a" : "#ff5f6d"; c.fillRect(x, Math.min(y, ny), 8, Math.max(3, Math.abs(ny - y))); y = ny; }
      c.strokeStyle = "#ffd34d"; c.lineWidth = 2; c.beginPath(); for (let x = 0; x < w; x += 8) c.lineTo(x, 110 - x * 0.28 + Math.sin(x * 0.08) * 10); c.stroke();
    });
    mesh(new THREE.PlaneGeometry(0.56, 0.36), new THREE.MeshBasicMaterial({ map: chartTex, color: new THREE.Color(1.5, 1.5, 1.5) }), 0, 0.21, 0.014, scr, false);
    mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.13, 14), toon("#ff9a62"), 0.45, 0.665, 0.15, tb);

    // tanaman pot di sudut
    [[-5.45, -5.45, 0.62], [5.45, -5.45, 0.62], [-5.2, 4.2, 1], [5.2, 4.2, 1]].forEach(([x, z, sc]) => {
      const p = new THREE.Group(); p.position.set(x, 0, z); p.scale.setScalar(sc); g.add(p);
      mesh(new THREE.CylinderGeometry(0.38, 0.3, 0.6, 16), toon("#d9734e"), 0, 0.3, 0, p);
      for (let k = 0; k < 7; k++) { const l = mesh(new THREE.SphereGeometry(0.32, 10, 8), toon(k % 2 ? "#4cae55" : "#3f9a4f"), (R() - 0.5) * 0.5, 0.85 + R() * 0.8, (R() - 0.5) * 0.5, p); l.scale.set(0.7, 1.3, 0.7); }
    });

    // lampu berdiri di antara bingkai samping
    this.intLights = [];
    [-1, 1].forEach((s) => {
      const L = new THREE.Group(); L.position.set(s * 5.35, 0, -1.25); g.add(L);
      mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.06, 16), toon("#3d3350"), 0, 0.03, 0, L);
      mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.7, 8), toon("#3d3350"), 0, 0.88, 0, L);
      mesh(new THREE.CylinderGeometry(0.22, 0.38, 0.45, 20, 1, true), toon("#ffe0a8", { emissive: "#ffb85c", emissiveIntensity: 1.4, side: THREE.DoubleSide }), 0, 1.85, 0, L, false);
      const pl = new THREE.PointLight("#ffbf70", 5, 6, 1.5); pl.position.y = 1.8; L.add(pl);
      const gl = glowSprite("#ffb85c", 1.6, 0.5); gl.position.y = 1.85; L.add(gl);
    });

    // lampu gantung
    const chand = new THREE.Group(); chand.position.set(0, HT, -1.2); g.add(chand);
    mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.8, 6), toon("#3d3350"), 0, -0.4, 0, chand);
    mesh(new THREE.TorusGeometry(0.55, 0.04, 8, 32), toon("#d9a441"), 0, -0.85, 0, chand).rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      mesh(new THREE.SphereGeometry(0.08, 10, 8), toon("#fff1c9", { emissive: "#ffd27a", emissiveIntensity: 3 }), Math.cos(a) * 0.55, -0.74, Math.sin(a) * 0.55, chand, false);
    }
    const cl = new THREE.PointLight("#ffd29a", 8, 14, 1.4); cl.position.set(0, -1.0, 0); chand.add(cl);
    const cg = glowSprite("#ffd27a", 2.6, 0.6); cg.position.y = -0.8; chand.add(cg);

    g.add(new THREE.HemisphereLight("#ffe6cc", "#5a3a5e", 0.85));
    g.add(new THREE.AmbientLight("#ffd9c2", 0.35));

    // debu melayang di cahaya
    const DN = 160, dpos = new Float32Array(DN * 3); this.dust = [];
    for (let i = 0; i < DN; i++) this.dust.push({ x: (R() - 0.5) * 10, y: R() * 4, z: -5.5 + R() * 9, p: R() * 6.28 });
    const dg = new THREE.BufferGeometry(); dg.setAttribute("position", new THREE.BufferAttribute(dpos, 3));
    this.dustPts = new THREE.Points(dg, new THREE.PointsMaterial({ map: glowTex, color: new THREE.Color(1.4, 1.2, 0.8), size: 0.06, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(this.dustPts);

    this.frameGroup = new THREE.Group(); g.add(this.frameGroup);
    this.buildFrames();
  }

  // posisi slot bingkai di dinding
  frameSlots() {
    const y = 2.45, b = -5.98, s = 5.98;
    return [
      { p: [-4.35, y, b], ry: 0 }, { p: [-1.45, y, b], ry: 0 }, { p: [1.45, y, b], ry: 0 }, { p: [4.35, y, b], ry: 0 },
      { p: [-s, y, -3.3], ry: Math.PI / 2 }, { p: [s, y, -3.3], ry: -Math.PI / 2 },
      { p: [-s, y, 0.85], ry: Math.PI / 2 }, { p: [s, y, 0.85], ry: -Math.PI / 2 },
    ];
  }

  frameTexture(sec) {
    return canvasTex(560, 430, (c, w, h) => {
      const col = sec.color || "#5b8def";
      const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, shade(col, 0.18)); gr.addColorStop(1, shade(col, -0.18));
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      const rg = c.createRadialGradient(w / 2, h * 0.42, 10, w / 2, h * 0.42, w * 0.55);
      rg.addColorStop(0, "rgba(255,255,255,.45)"); rg.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = rg; c.fillRect(0, 0, w, h);
      const R = rng(sec.title.length * 31 + 7);
      c.fillStyle = "rgba(255,255,255,.55)";
      for (let i = 0; i < 26; i++) { c.beginPath(); c.arc(R() * w, R() * h, 1 + R() * 3, 0, 7); c.fill(); }
      c.textAlign = "center"; c.textBaseline = "middle";
      c.font = "170px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
      c.shadowColor = "rgba(0,0,0,.25)"; c.shadowBlur = 18; c.shadowOffsetY = 8;
      c.fillText(sec.icon || "⭐", w / 2, h * 0.4);
      c.shadowBlur = 8; c.shadowOffsetY = 4; c.shadowColor = "rgba(0,0,0,.35)";
      c.fillStyle = "rgba(255,255,255,.92)"; roundRect(c, 40, h - 112, w - 80, 78, 39); c.fill();
      c.shadowColor = "transparent";
      c.fillStyle = shade(col, -0.3); c.font = "700 44px Fredoka, Nunito, sans-serif";
      c.fillText(sec.title, w / 2, h - 72, w - 110);
    });
  }

  buildFrames() {
    // bersihkan
    while (this.frameGroup.children.length) this.frameGroup.remove(this.frameGroup.children[0]);
    this.frames = [];
    const slots = this.frameSlots(), fw = 2.15, fh = 1.65;
    this.data.sections.slice(0, slots.length).forEach((sec, i) => {
      const sl = slots[i];
      const fr = new THREE.Group(); fr.position.set(...sl.p); fr.rotation.y = sl.ry; this.frameGroup.add(fr);
      const inner = new THREE.Group(); fr.add(inner);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(fw + 1.6, fh + 1.6), new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(sec.color).multiplyScalar(2.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.z = 0.01; inner.add(glow);
      const border = mesh(new RoundedBoxGeometry(fw + 0.3, fh + 0.3, 0.12, 3, 0.05), toon("#d9a441", { unique: true }), 0, 0, 0.07, inner);
      mesh(new RoundedBoxGeometry(fw + 0.08, fh + 0.08, 0.04, 2, 0.02), toon("#7a4f1e"), 0, 0, 0.13, inner, false);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), new THREE.MeshBasicMaterial({ map: this.frameTexture(sec), toneMapped: false }));
      face.position.z = 0.155; inner.add(face);
      // lampu galeri di atas bingkai
      mesh(new RoundedBoxGeometry(0.9, 0.08, 0.1, 2, 0.03), toon("#c99a3c"), 0, fh / 2 + 0.32, 0.28, inner, false);
      mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.28, 6), toon("#c99a3c"), 0, fh / 2 + 0.24, 0.15, inner, false).rotation.x = Math.PI / 2;
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(fw + 0.6, fh + 0.5), new THREE.MeshBasicMaterial({
        map: canvasTex(64, 128, (c2, w, h) => { const gg = c2.createLinearGradient(0, 0, 0, h); gg.addColorStop(0, "rgba(255,230,180,.55)"); gg.addColorStop(1, "rgba(255,230,180,0)"); c2.fillStyle = gg; c2.fillRect(0, 0, w, h); }),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.22 }));
      beam.position.set(0, 0.25, 0.17); inner.add(beam);
      [border, face].forEach((m) => (m.userData.frameIndex = i));
      this.frames.push({ group: fr, inner, glow, face, border, beam, sec, index: i, hover: 0, pop: 0 });
    });
    this.frameTargets = this.frames.flatMap((f) => [f.face, f.border]);
  }

  updateData(data) {
    this.data = data;
    this.signFace.material.map?.dispose();
    this.signFace.material.map = this.signTexture(data.profile.name || "Saya");
    this.buildFrames();
  }

  // ==================================================================
  //  INTERAKSI
  // ==================================================================
  bindEvents() {
    addEventListener("resize", () => {
      this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight); this.composer.setSize(innerWidth, innerHeight);
      if (this.mode === "outside") this.orbit.r = this.orbitR();
      this.showWorld(this.world);
    });
    const c = this.canvas; let down = null, last = null;
    c.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; last = { ...down }; c.setPointerCapture(e.pointerId); });
    c.addEventListener("pointermove", (e) => {
      this.pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      this.mouseN.copy(this.pointer);
      if (down) {
        const dx = e.clientX - last.x, dy = e.clientY - last.y; last = { x: e.clientX, y: e.clientY };
        if (this.mode === "outside") this.orbit.dragV = -dx * 0.004;
        if (this.mode === "inside") { this.look.yawT = clamp(this.look.yawT + dx * 0.0042, -1.9, 1.9); this.look.pitchT = clamp(this.look.pitchT + dy * 0.003, -0.35, 0.35); }
      }
    });
    c.addEventListener("pointerup", (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved < 7) { this.pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); this.handleClick(); }
    });
    c.addEventListener("pointerleave", () => this.pointer.set(-9, -9));
  }

  pick(targets) {
    if (this.pointer.x < -2) return null;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(targets, false)[0] || null;
  }

  handleClick() {
    if (this.mode === "outside") { if (this.pick(this.doorTargets)) this.enter(); }
    else if (this.mode === "inside") {
      const hit = this.pick(this.frameTargets);
      if (hit) this.focusFrame(hit.object.userData.frameIndex);
    } else if (this.mode === "focus") this.cb.onBackground && this.cb.onBackground();
  }

  updateHover() {
    let cursor = "grab", hov = null;
    if (this.mode === "outside") {
      const hit = this.pick(this.doorTargets);
      this.doorHover = lerp(this.doorHover || 0, hit ? 1 : 0, 0.15);
      if (hit) { cursor = "pointer"; hov = "door"; }
    } else if (this.mode === "inside") {
      const hit = this.pick(this.frameTargets);
      if (hit) { cursor = "pointer"; hov = this.frames[hit.object.userData.frameIndex]; }
    } else cursor = "default";
    this.canvas.style.cursor = cursor;
    if (hov !== this.hovered) { this.hovered = hov; this.cb.onHover && this.cb.onHover(hov && hov.sec ? hov.sec : hov); }
  }

  // ---------- urutan sinematik ----------
  start() {
    this.mode = "intro";
    const o = this.orbit;
    this.tween(4.2, (t) => { o.r = lerp(56, this.orbitR(), t); o.y = lerp(28, 7.6, t); o.theta = lerp(-1.3, 0.0, t); }, {
      easing: ease.inOut, onDone: () => { this.mode = "outside"; this.orbitBaseTime = this.time; this.cb.onReady && this.cb.onReady(); },
    });
  }

  orbitR() { return 24.5 / Math.min(1, this.camera.aspect * 1.35); }

  enter() {
    if (this.mode !== "outside") return;
    this.mode = "entering"; this.cb.onEnterStart && this.cb.onEnterStart();
    const p0 = this.camera.position.clone();
    const curve = new THREE.CatmullRomCurve3([p0, new THREE.Vector3(p0.x * 0.35, 3.0, 10), new THREE.Vector3(0, 1.9, 5.6), new THREE.Vector3(0, 1.75, 3.6), new THREE.Vector3(0, 1.7, 1.4)]);
    const l0 = this.camLook.clone(), door = new THREE.Vector3(0, 1.65, 2.75), inside = new THREE.Vector3(0, 1.65, -6);
    // pintu terbuka + cahaya membanjir
    this.tween(1.5, (t) => { this.doorPivot.rotation.y = t * 1.75; }, { delay: 0.55, easing: ease.inOut });
    this.tween(1.6, (t) => {
      this.doorwayMat.color.setRGB(lerp(0.23, 3.2, t), lerp(0.14, 2.6, t), lerp(0.06, 1.6, t));
      this.doorLight.intensity = lerp(4, 22, t); this.doorGlow.material.opacity = lerp(0.35, 1, t); this.doorGlow.scale.setScalar(lerp(3.4, 6, t));
    }, { delay: 0.7 });
    this.tween(3.4, (t) => {
      this.camPos.copy(curve.getPoint(t));
      if (t < 0.55) this.camLook.lerpVectors(l0, door, ease.inOut(t / 0.55));
      else this.camLook.lerpVectors(door, inside, ease.inOut((t - 0.55) / 0.45));
    }, { easing: ease.inOutSine, tag: "cam", onDone: () => arrive() });
    this.after(2.7, () => this.cb.fade && this.cb.fade(1, 650));
    const arrive = () => {
      this.showWorld("inside");
      this.look.yaw = this.look.yawT = 0; this.look.pitch = this.look.pitchT = -0.03;
      this.camPos.set(0, 1.75, 4.6); this.camLook.set(0, 1.75, -3);
      // reset pintu luar diam-diam
      this.doorPivot.rotation.y = 0; this.doorwayMat.color.set("#3a2410"); this.doorLight.intensity = 4; this.doorGlow.material.opacity = 0.35; this.doorGlow.scale.setScalar(3.4);
      this.frames.forEach((f, i) => { f.pop = 0; f.popDelay = 0.5 + i * 0.12; });
      this.popStart = this.time;
      this.cb.fade && this.cb.fade(0, 900);
      const s0 = this.camPos.clone();
      this.tween(1.6, (t) => { this.camPos.lerpVectors(s0, this.standPos, t); }, {
        easing: ease.out, tag: "cam", onDone: () => { this.mode = "inside"; this.cb.onEntered && this.cb.onEntered(); },
      });
      this.mode = "arriving";
    };
  }

  exit() {
    if (this.mode !== "inside") return;
    this.mode = "exiting"; this.cb.onExitStart && this.cb.onExitStart();
    const s0 = this.camPos.clone(), l0 = this.camLook.clone();
    this.tween(1.0, (t) => { this.camPos.lerpVectors(s0, new THREE.Vector3(0, 1.75, 4.7), t); this.camLook.lerpVectors(l0, new THREE.Vector3(0, 1.7, 8), t); }, { easing: ease.inOut, tag: "cam" });
    this.cb.fade && this.cb.fade(1, 600);
    this.after(0.65, () => {
      this.showWorld("outside");
      this.camPos.set(0, 1.8, 4.4); this.camLook.set(0, 1.6, 20);
      this.doorPivot.rotation.y = 1.75;
      this.cb.fade && this.cb.fade(0, 800);
      this.tween(1.2, (t) => { this.doorPivot.rotation.y = (1 - t) * 1.75; }, { delay: 0.6, easing: ease.inOut });
      const o = this.orbit; o.drag = 0; o.dragV = 0;
      const target = new THREE.Vector3(0, 7.6, this.orbitR());
      const p0 = this.camPos.clone(), lA = this.camLook.clone(), lB = new THREE.Vector3(0, 1.5, 0);
      this.tween(2.4, (t) => { this.camPos.lerpVectors(p0, target, t); this.camLook.lerpVectors(lA, lB, ease.out(Math.min(1, t * 1.6))); }, {
        delay: 0.2, easing: ease.inOut, tag: "cam",
        onDone: () => { o.theta = 0; o.r = this.orbitR(); o.y = 7.6; this.orbitBaseTime = this.time; this.mode = "outside"; this.cb.onExited && this.cb.onExited(); },
      });
    });
  }

  focusFrame(index) {
    if (this.mode !== "inside") return;
    const f = this.frames.find((x) => x.index === index);
    const sec = f ? f.sec : this.data.sections[index];
    if (!f) { this.cb.onOpen && this.cb.onOpen(sec, index); return; } // bagian tanpa bingkai
    this.mode = "focus";
    const wp = new THREE.Vector3(); f.group.getWorldPosition(wp);
    const n = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), f.group.rotation.y);
    const dist = innerWidth < 760 ? 4.4 : 3.7;
    const toPos = wp.clone().addScaledVector(n, dist); toPos.y = wp.y - 0.05;
    // geser sedikit agar bingkai di kiri layar (panel muncul di kanan)
    const side = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize();
    const shift = innerWidth > 900 ? 0.95 : 0;
    toPos.addScaledVector(side, -shift);
    const toLook = wp.clone().addScaledVector(side, -shift);
    const p0 = this.camPos.clone(), l0 = this.camLook.clone();
    this.focusFrom = { p: p0, l: l0 };
    this.focused = f;
    this.tween(1.1, (t) => { this.camPos.lerpVectors(p0, toPos, t); this.camLook.lerpVectors(l0, toLook, t); }, { easing: ease.inOut, tag: "cam" });
    this.after(0.65, () => this.cb.onOpen && this.cb.onOpen(sec, index));
  }

  unfocus(cb) {
    if (this.mode !== "focus") return;
    const p0 = this.camPos.clone(), l0 = this.camLook.clone();
    const back = this.idleLook(new THREE.Vector3());
    this.focused = null;
    this.tween(1.0, (t) => { this.camPos.lerpVectors(p0, this.standPos, t); this.camLook.lerpVectors(l0, back, t); }, {
      easing: ease.inOut, tag: "cam", onDone: () => { this.mode = "inside"; cb && cb(); },
    });
  }

  idleLook(out) {
    const { yaw, pitch } = this.look;
    return out.set(this.standPos.x - Math.sin(yaw) * Math.cos(pitch) * 6, this.standPos.y + Math.sin(pitch) * 6, this.standPos.z - Math.cos(yaw) * Math.cos(pitch) * 6);
  }

  // ==================================================================
  adapt(rawDt) {
    const a = (this._perf ||= { sum: 0, n: 0, pr: this.renderer.getPixelRatio() });
    a.sum += rawDt; a.n++;
    if (a.n < 90) return;
    const fps = a.n / a.sum; a.sum = 0; a.n = 0;
    if (fps < 40 && a.pr > 0.75) a.pr = Math.max(0.75, a.pr - 0.25);
    else if (fps > 58 && a.pr < Math.min(devicePixelRatio, 1.5)) a.pr = Math.min(a.pr + 0.25, devicePixelRatio);
    else return;
    this.renderer.setPixelRatio(a.pr); this.composer.setPixelRatio?.(a.pr); this.composer.setSize(innerWidth, innerHeight);
  }

  loop() {
    requestAnimationFrame(this.loop);
    const raw = this.clock.getDelta(); this.adapt(raw);
    const dt = Math.min(raw, 0.05); this.time += dt; const t = this.time;
    this.stepTweens(dt);

    if (this.world === "outside") this.animateExterior(t, dt);
    else this.animateInterior(t, dt);

    if (this.mode === "intro" || this.mode === "outside") {
      const o = this.orbit;
      if (this.mode === "outside") {
        o.drag += o.dragV; o.dragV *= 0.92; o.drag = clamp(o.drag, -1.3, 1.3);
        if (Math.abs(o.dragV) < 0.0005) o.drag *= 0.995;
        const auto = Math.sin((t - (this.orbitBaseTime || 0)) * 0.12) * 0.45;
        o.theta = lerp(o.theta, auto + o.drag + this.mouseN.x * 0.05, 0.05);
        o.y = lerp(o.y, 7.6 + this.mouseN.y * 0.6, 0.05);
      }
      this.camPos.set(Math.sin(o.theta) * o.r, o.y, Math.cos(o.theta) * o.r);
      this.camLook.set(0, 1.5, 0);
    } else if (this.mode === "inside") {
      const L = this.look;
      L.yaw = lerp(L.yaw, L.yawT - this.mouseN.x * 0.12, 0.07);
      L.pitch = lerp(L.pitch, L.pitchT + this.mouseN.y * 0.05, 0.07);
      this.camPos.lerp(this.standPos, 0.1);
      this.idleLook(this.camLook);
    }
    this.camera.position.copy(this.camPos);
    // sedikit "napas" kamera
    this.camera.position.y += Math.sin(t * 0.8) * 0.03;
    this.camera.lookAt(this.camLook);

    this.updateHover();
    this.composer.render();
  }

  animateExterior(t) {
    this.starMat.uniforms.time.value = t;
    // kunang-kunang
    const fp = this.fireflies.geometry.attributes.position;
    this.ffData.forEach((f, i) => fp.setXYZ(i, f.x + Math.sin(t * f.s + f.p) * 1.2, f.y + Math.sin(t * f.s * 1.7 + f.p) * 0.5, f.z + Math.cos(t * f.s * 0.8 + f.p) * 1.2));
    fp.needsUpdate = true;
    this.fireflies.material.opacity = 0.65 + Math.sin(t * 3) * 0.2;
    // kilau di pintu
    const sp = this.sparkles.geometry.attributes.position;
    const dh = this.doorHover || 0;
    this.sparkData.forEach((s, i) => {
      const a = s.a + Math.sin(t * 0.6 + s.p) * 0.1, rr = s.rr + Math.sin(t * 2 + s.p) * 0.08 + dh * 0.1;
      sp.setXYZ(i, Math.cos(a) * rr, 0.55 + 1.6 + Math.sin(a) * rr * 1.1 - 0.6 + ((t * 0.25 + s.y0) % 1) * 0.3, 2.95 + Math.sin(t + s.p) * 0.05);
    });
    sp.needsUpdate = true;
    this.sparkles.material.opacity = 0.55 + Math.sin(t * 2.4) * 0.25 + dh * 0.3;
    this.sparkles.material.size = 0.26 + dh * 0.1;
    if (this.mode === "outside" || this.mode === "intro") {
      this.doorGlow.material.opacity = 0.3 + Math.sin(t * 2) * 0.1 + dh * 0.35;
      this.doorMesh.material.emissive.setRGB(dh * 0.25, dh * 0.15, dh * 0.04);
    }
    // asap
    this.smoke.forEach((s) => {
      s.userData.t = (s.userData.t + 0.0035) % 1; const k = s.userData.t;
      s.position.set(this.chimneyTop.x + Math.sin(k * 6 + t * 0.5) * 0.4 + k * 1.2, this.chimneyTop.y + k * 4.5, this.chimneyTop.z - k * 0.5);
      s.scale.setScalar(0.6 + k * 2.4); s.material.opacity = Math.sin(k * Math.PI) * 0.45;
    });
    // bendera berkibar
    const fa = this.flag.geometry.attributes.position, b = this.flagBase;
    for (let i = 0; i < fa.count; i++) { const x = b[i * 3] + 0.375; fa.setZ(i, Math.sin(x * 7 - t * 6) * 0.07 * x * 1.5); }
    fa.needsUpdate = true;
    // awan, pulau kecil, pohon
    this.clouds.forEach((c) => { c.userData.a += c.userData.sp * 0.05; c.position.set(Math.cos(c.userData.a) * c.userData.rad, c.userData.y + Math.sin(t * 0.3 + c.userData.a) * 0.6, Math.sin(c.userData.a) * c.userData.rad); c.lookAt(0, c.position.y, 0); });
    this.floaters.forEach((f) => { f.position.y = f.userData.base + Math.sin(t * 0.8 + f.userData.ph) * 0.5; f.rotation.y = t * 0.1 + f.userData.ph; });
    this.trees.forEach((tr) => { tr.rotation.z = Math.sin(t * 1.1 + tr.userData.sway) * 0.015; });
    this.lanternLights.forEach((l, i) => (l.intensity = 6 + Math.sin(t * 9 + i * 2) * 0.4 + Math.sin(t * 23 + i) * 0.25));
  }

  animateInterior(t, dt) {
    const dp = this.dustPts.geometry.attributes.position;
    this.dust.forEach((d, i) => { d.y += dt * 0.08; if (d.y > 4.2) d.y = 0.2; dp.setXYZ(i, d.x + Math.sin(t * 0.3 + d.p) * 0.3, d.y, d.z + Math.cos(t * 0.25 + d.p) * 0.3); });
    dp.needsUpdate = true;
    this.frames.forEach((f) => {
      // animasi muncul (pop) saat pertama masuk
      if (this.popStart != null) { const k = clamp((t - this.popStart - (f.popDelay || 0)) / 0.7, 0, 1); f.pop = k; }
      else f.pop = 1;
      const isHover = this.hovered === f || this.focused === f;
      f.hover = lerp(f.hover, isHover ? 1 : 0, 0.12);
      const sc = (f.pop < 1 ? ease.outBack(f.pop) : 1) * (1 + f.hover * 0.05);
      f.inner.scale.setScalar(Math.max(0.001, sc));
      f.inner.position.z = f.hover * 0.12;
      f.inner.rotation.z = Math.sin(t * 0.9 + f.index) * 0.006 * (1 - f.hover);
      f.glow.material.opacity = f.hover * 0.6 + Math.sin(t * 2 + f.index) * 0.05 + 0.06;
      const c = 0.9 + f.hover * 0.1; f.face.material.color.setRGB(c, c, c);
      f.beam.material.opacity = 0.22 * (1 - f.hover);
      f.border.material.emissive.setRGB(f.hover * 0.35, f.hover * 0.24, f.hover * 0.05);
    });
  }
}
