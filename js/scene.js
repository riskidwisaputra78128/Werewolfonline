// =====================================================================
//  Dunia 3D (semi-realistis): rumah di padang rumput saat matahari terbit
//  + ruang tamu galeri. Material PBR, langit & cahaya HDRI, bayangan lembut.
// =====================================================================
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { GroundedSkybox } from "three/addons/objects/GroundedSkybox.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const ASSET = "assets/";
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
function shade(hex, amt) { const c = new THREE.Color(hex); const hsl = {}; c.getHSL(hsl); c.setHSL(hsl.h, hsl.s, clamp(hsl.l + amt, 0, 1)); return "#" + c.getHexString(); }
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function mesh(geo, mat, x = 0, y = 0, z = 0, parent, shadow = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  if (shadow) { m.castShadow = true; m.receiveShadow = true; }
  parent && parent.add(m); return m;
}

// ---------- tekstur prosedural ----------
function cnv(w, h = w) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function toTex(c, { srgb = true, repeat } = {}) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; if (repeat) t.repeat.set(repeat[0], repeat[1]); return t;
}
function canvasTex(w, h, draw, repeat) { const c = cnv(w, h); draw(c.getContext("2d"), w, h); return toTex(c, { repeat }); }
// noise yang bisa diulang (tileable) — value noise fBm
function fbm(size, { oct = 5, base = 4, seed = 1, sx = 1, sy = 1 } = {}) {
  const R = rng(seed), out = new Float32Array(size * size);
  let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const gx = Math.max(1, Math.round(base * sx * 2 ** o)), gy = Math.max(1, Math.round(base * sy * 2 ** o));
    const grid = new Float32Array(gx * gy).map(() => R());
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * gy, y0 = Math.floor(fy), ty = fy - y0, y1 = (y0 + 1) % gy;
      const sy_ = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * gx, x0 = Math.floor(fx), tx = fx - x0, x1 = (x0 + 1) % gx;
        const sx_ = tx * tx * (3 - 2 * tx);
        const a = grid[y0 * gx + x0], b = grid[y0 * gx + x1], c = grid[y1 * gx + x0], d = grid[y1 * gx + x1];
        out[y * size + x] += lerp(lerp(a, b, sx_), lerp(c, d, sx_), sy_) * amp;
      }
    }
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
function normalFromHeight(h, size, strength = 2, repeat) {
  const c = cnv(size), g = c.getContext("2d"), img = g.createImageData(size, size), d = img.data;
  const H = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); return toTex(c, { srgb: false, repeat });
}
function heightFromCanvas(c) {
  const s = c.width, d = c.getContext("2d").getImageData(0, 0, s, s).data, h = new Float32Array(s * s);
  for (let i = 0; i < h.length; i++) h[i] = d[i * 4] / 255; return h;
}
function colorize(h, size, stops) { // stops: [[t, "#hex"], ...]
  const c = cnv(size), g = c.getContext("2d"), img = g.createImageData(size, size), d = img.data;
  const cs = stops.map(([t, hx]) => [t, new THREE.Color(hx)]);
  for (let i = 0; i < h.length; i++) {
    const v = h[i]; let k = 0; while (k < cs.length - 2 && v > cs[k + 1][0]) k++;
    const [t0, c0] = cs[k], [t1, c1] = cs[k + 1], f = clamp((v - t0) / (t1 - t0), 0, 1);
    d[i * 4] = lerp(c0.r, c1.r, f) * 255; d[i * 4 + 1] = lerp(c0.g, c1.g, f) * 255; d[i * 4 + 2] = lerp(c0.b, c1.b, f) * 255; d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0); return c;
}

// plester dinding
function plasterSet(tint = "#efe2c8", seed = 3) {
  const S = 512, h1 = fbm(S, { seed, base: 3, oct: 6 }), h2 = fbm(S, { seed: seed + 9, base: 24, oct: 3 });
  const h = h1.map((v, i) => v * 0.6 + h2[i] * 0.4);
  const t = new THREE.Color(tint);
  const col = colorize(h1, S, [[0.2, "#" + t.clone().multiplyScalar(0.86).getHexString()], [0.5, tint], [0.8, "#" + t.clone().lerp(new THREE.Color("#ffffff"), 0.35).getHexString()]]);
  return { map: toTex(col), normalMap: normalFromHeight(h, S, 3.5) };
}
// genteng tanah liat / sirap batu
function tileSet({ cols = 6, rows = 8, palette = ["#9e4a33", "#ad5539", "#8f3f2c", "#b8613f"], gap = "#2a1610", seed = 5, round = true } = {}) {
  const S = 512, R = rng(seed), col = cnv(S), hgt = cnv(S), gc = col.getContext("2d"), gh = hgt.getContext("2d");
  gc.fillStyle = gap; gc.fillRect(0, 0, S, S); gh.fillStyle = "#000"; gh.fillRect(0, 0, S, S);
  const tw = S / cols, th = S / rows;
  for (let r = -1; r <= rows; r++) for (let c = -1; c <= cols; c++) {
    const x = c * tw + (r % 2 ? tw / 2 : 0), y = r * th, base = new THREE.Color(palette[Math.floor(R() * palette.length)]);
    base.offsetHSL(0, (R() - 0.5) * 0.06, (R() - 0.5) * 0.08);
    for (const [g, isH] of [[gc, false], [gh, true]]) {
      const gr = g.createLinearGradient(0, y, 0, y + th * 1.05);
      if (isH) { gr.addColorStop(0, "#202020"); gr.addColorStop(1, "#ffffff"); }
      else { gr.addColorStop(0, "#" + base.clone().multiplyScalar(0.55).getHexString()); gr.addColorStop(0.75, "#" + base.getHexString()); gr.addColorStop(1, "#" + base.clone().multiplyScalar(1.12).getHexString()); }
      g.fillStyle = gr; g.beginPath();
      if (round) { g.moveTo(x + 2, y); g.lineTo(x + tw - 2, y); g.lineTo(x + tw - 2, y + th * 0.6); g.quadraticCurveTo(x + tw - 2, y + th * 1.05, x + tw / 2, y + th * 1.05); g.quadraticCurveTo(x + 2, y + th * 1.05, x + 2, y + th * 0.6); }
      else roundRect(g, x + 1.5, y, tw - 3, th * 1.02, 3);
      g.fill();
    }
  }
  // noda & lumut tipis
  const n = fbm(S, { seed: seed + 3, base: 5, oct: 4 }), img = gc.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < n.length; i++) { const k = 0.82 + n[i] * 0.3; d[i * 4] *= k; d[i * 4 + 1] *= k * (n[i] > 0.62 ? 1.04 : 1); d[i * 4 + 2] *= k; }
  gc.putImageData(img, 0, 0);
  return { map: toTex(col), normalMap: normalFromHeight(heightFromCanvas(hgt), S, 6) };
}
// batu alam (fondasi, jalan setapak) — pola voronoi
function stoneSet(seed = 11, cells = 26, palette = ["#9b9286", "#8a8379", "#a89f92", "#7d766d", "#b3a998"]) {
  const S = 256, R = rng(seed), pts = [];
  for (let i = 0; i < cells; i++) pts.push([R() * S, R() * S, new THREE.Color(palette[Math.floor(R() * palette.length)]).offsetHSL(0, 0, (R() - 0.5) * 0.08)]);
  const n = fbm(S, { seed, base: 8, oct: 4 }), col = cnv(S), g = col.getContext("2d"), img = g.createImageData(S, S), d = img.data, h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let d1 = 1e9, d2 = 1e9, c1 = null;
    for (const [px, py, pc] of pts) for (let ox = -S; ox <= S; ox += S) for (let oy = -S; oy <= S; oy += S) {
      const dd = Math.hypot(x - px - ox, y - py - oy); if (dd < d1) { d2 = d1; d1 = dd; c1 = pc; } else if (dd < d2) d2 = dd;
    }
    const e = clamp((d2 - d1) / 7, 0, 1), i = y * S + x, v = n[i];
    const k = e < 0.25 ? 0.42 : 0.85 + v * 0.3;
    h[i] = Math.sqrt(e) * 0.8 + v * 0.2;
    d[i * 4] = c1.r * 255 * k; d[i * 4 + 1] = c1.g * 255 * k; d[i * 4 + 2] = c1.b * 255 * k; d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { map: toTex(col), normalMap: normalFromHeight(h, S, 4) };
}
function barkSet() {
  const S = 256, h = fbm(S, { seed: 21, base: 6, oct: 5, sx: 3, sy: 0.35 });
  return { map: toTex(colorize(h, S, [[0.25, "#2e241c"], [0.5, "#5a4838"], [0.75, "#7b6a58"]])), normalMap: normalFromHeight(h, S, 6) };
}
function paintedWoodSet(color = "#f4efe6", seed = 31) {
  const S = 256, h = fbm(S, { seed, base: 3, oct: 5, sx: 0.2, sy: 4 });
  const c = new THREE.Color(color);
  return { map: toTex(colorize(h, S, [[0.3, "#" + c.clone().multiplyScalar(0.88).getHexString()], [0.7, color]])), normalMap: normalFromHeight(h, S, 1.5) };
}
function leafTexture(seed, hues) {
  const S = 256, c = cnv(S), g = c.getContext("2d"), R = rng(seed);
  for (let i = 0; i < 95; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * S * 0.38, x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r;
    const col = new THREE.Color(hues[Math.floor(R() * hues.length)]).offsetHSL((R() - 0.5) * 0.03, 0, (R() - 0.5) * 0.12);
    g.save(); g.translate(x, y); g.rotate(R() * Math.PI * 2);
    const L = 16 + R() * 14, W = L * 0.45;
    const gr = g.createLinearGradient(-W, 0, W, 0); gr.addColorStop(0, "#" + col.clone().multiplyScalar(0.7).getHexString()); gr.addColorStop(0.5, "#" + col.getHexString()); gr.addColorStop(1, "#" + col.clone().multiplyScalar(0.8).getHexString());
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, -L); g.quadraticCurveTo(W, 0, 0, L); g.quadraticCurveTo(-W, 0, 0, -L); g.fill();
    g.strokeStyle = "rgba(0,0,0,.18)"; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -L); g.lineTo(0, L); g.stroke();
    g.restore();
  }
  const t = toTex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
const glowTex = canvasTex(128, 128, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,.55)");
  gr.addColorStop(0.6, "rgba(255,255,255,.12)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
glowTex.wrapS = glowTex.wrapT = THREE.ClampToEdgeWrapping;
function glowSprite(color, scale, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(scale); return s;
}

// =====================================================================
export class HouseWorld {
  constructor(canvas, data, cb = {}) {
    this.canvas = canvas; this.data = data; this.cb = cb;
    this.mode = "loading";
    this.tweens = []; this.clock = new THREE.Clock(); this.time = 0;
    this.pointer = new THREE.Vector2(-9, -9); this.mouseN = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.hovered = null;
    this.low = new URLSearchParams(location.search).get("q") === "low";
    this.mobile = this.low || matchMedia("(pointer: coarse)").matches || innerWidth < 760;

    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, this.mobile ? 1.25 : 1.5));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.85;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 800);
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3();

    this.composer = new EffectComposer(r, new THREE.WebGLRenderTarget(innerWidth * r.getPixelRatio(), innerHeight * r.getPixelRatio(), { type: THREE.HalfFloatType, samples: this.low ? 0 : 4 }));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.4, 1.25);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.manager = new THREE.LoadingManager();
    this.manager.onProgress = (_u, a, b) => this.cb.onProgress && this.cb.onProgress(a / b);
    this.texLoader = new THREE.TextureLoader(this.manager);

    this.orbit = { theta: -1.3, r: 40, y: 15, drag: 0, dragV: 0 };
    this.look = { yaw: 0, pitch: -0.03, yawT: 0, pitchT: -0.03 };
    this.standPos = new THREE.Vector3(0, 1.7, 3.3);
    this.loop = this.loop.bind(this);
    this.ready = this.init();
  }

  get hdrFile() { return "spruit_sunrise_1k.hdr"; }

  tex(file, { srgb = true, repeat = [1, 1] } = {}) {
    const t = this.texLoader.load(ASSET + "tex/" + file);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]); t.anisotropy = 8; return t;
  }
  // set material kayu/bata asli dengan pengulangan tertentu
  woodMat(repeat = [1, 1], color = "#ffffff", extra = {}) {
    return new THREE.MeshStandardMaterial({ color, map: this.tex("wood_col.jpg", { repeat }), roughnessMap: this.tex("wood_rough.jpg", { srgb: false, repeat }), bumpMap: this.tex("wood_bump.jpg", { srgb: false, repeat }), bumpScale: 1.2, roughness: 1, ...extra });
  }
  brickMat(repeat = [1, 1]) {
    return new THREE.MeshStandardMaterial({ map: this.tex("brick_col.jpg", { repeat }), roughnessMap: this.tex("brick_rough.jpg", { srgb: false, repeat }), bumpMap: this.tex("brick_bump.jpg", { srgb: false, repeat }), bumpScale: 3, roughness: 1 });
  }
  std(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o }); }
  setMat({ map, normalMap }, repeat, o = {}) {
    const m = map.clone(), n = normalMap.clone(); m.repeat.set(...repeat); n.repeat.set(...repeat); m.needsUpdate = n.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: m, normalMap: n, roughness: 0.9, metalness: 0, ...o });
  }

  async init() {
    // HDRI langit
    const hdr = await new RGBELoader(this.manager).setDataType(THREE.HalfFloatType).loadAsync(ASSET + "hdr/" + this.hdrFile);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envOut = pmrem.fromEquirectangular(hdr).texture;
    this.envIn = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.hdr = hdr;

    // cari arah matahari dari piksel paling terang di HDR, lalu putar langit agar
    // matahari ada di depan-kiri rumah (wajah rumah tersinari)
    const { data, width: W, height: H } = hdr.image; let best = -1, bi = 0;
    const hf = THREE.DataUtils.fromHalfFloat;
    for (let i = 0; i < W * H; i++) { const l = hf(data[i * 4]) * 0.3 + hf(data[i * 4 + 1]) * 0.59 + hf(data[i * 4 + 2]) * 0.11; if (l > best) { best = l; bi = i; } }
    const u = ((bi % W) + 0.5) / W, v = 1 - (Math.floor(bi / W) + 0.5) / H;
    const sunAz = (u - 0.5) * Math.PI * 2, sunEl = (v - 0.5) * Math.PI;
    const wantAz = Math.atan2(0.75, -0.55); // depan (+z) agak kiri (-x)
    this.skyRot = sunAz - wantAz;
    this.sunDir = new THREE.Vector3(Math.cos(wantAz) * Math.cos(Math.max(sunEl, 0.42)), Math.sin(Math.max(sunEl, 0.42)), Math.sin(wantAz) * Math.cos(Math.max(sunEl, 0.42))).normalize();

    await this.beforeBuild?.();
    this.buildExterior();
    this.buildInterior();
    this.showWorld("outside");
    this.bindEvents();
    // kompilasi shader di muka agar transisi mulus
    this.int.visible = true; this.renderer.compile(this.scene, this.camera); this.int.visible = false;
    requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------------
  tween(dur, onUpdate, { easing = ease.inOut, delay = 0, onDone, tag } = {}) {
    if (tag) this.tweens = this.tweens.filter((x) => x.tag !== tag);
    const tw = { dur, t: -delay, onUpdate, easing, onDone, tag };
    this.tweens.push(tw); return tw;
  }
  after(sec, fn) { return this.tween(sec, () => {}, { onDone: fn, easing: (x) => x }); }
  stepTweens(dt) {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i]; if (!tw) continue; tw.t += dt;
      if (tw.t < 0) continue;
      const p = clamp(tw.t / tw.dur, 0, 1);
      tw.onUpdate(tw.easing(p), p);
      if (p >= 1) { const k = this.tweens.indexOf(tw); if (k >= 0) this.tweens.splice(k, 1); tw.onDone && tw.onDone(); }
    }
  }

  showWorld(which) {
    this.world = which;
    this.ext.visible = which === "outside";
    this.int.visible = which === "inside";
    this.scene.environment = which === "outside" ? this.envOut : this.envIn;
    this.scene.environmentIntensity = which === "outside" ? 1.0 : 0.35;
    this.scene.environmentRotation.y = which === "outside" ? this.skyRot : 0;
    this.scene.background = which === "outside" ? null : new THREE.Color("#120c08");
    this.bloom.strength = which === "outside" ? 0.3 : 0.4;
    this.renderer.toneMappingExposure = which === "outside" ? 0.8 : 1.0;
    this.camera.fov = which === "outside" ? 45 : (innerWidth < innerHeight ? 72 : 58);
    this.camera.updateProjectionMatrix();
  }

  // ==================================================================
  //  LUAR RUMAH
  // ==================================================================
  buildExterior() {
    const g = (this.ext = new THREE.Group()); this.scene.add(g);
    const R = rng(7);

    // langit + tanah HDRI yang "menapak"
    const sky = new GroundedSkybox(this.hdr, 12, 120); sky.position.y = 12 - 0.02; sky.rotation.y = this.skyRot;
    sky.material.toneMapped = true; g.add(sky);

    // matahari
    const sun = new THREE.DirectionalLight("#ffd2a0", 2.1);
    sun.position.copy(this.sunDir).multiplyScalar(45); sun.castShadow = true;
    sun.shadow.mapSize.set(this.mobile ? 1024 : 2048, this.mobile ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 110 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 4;
    g.add(sun);

    // tanah rumput dengan tepi memudar ke tanah HDRI
    const grassTex = this.tex("grass_col.jpg", { repeat: [14, 14] });
    const fadeMap = canvasTex(256, 256, (c, w, h) => {
      const gr = c.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w / 2);
      gr.addColorStop(0, "#fff"); gr.addColorStop(1, "#000"); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    });
    fadeMap.colorSpace = THREE.NoColorSpace; fadeMap.wrapS = fadeMap.wrapT = THREE.ClampToEdgeWrapping;
    const ground = mesh(new THREE.CircleGeometry(34, 96), new THREE.MeshStandardMaterial({ map: grassTex, color: "#d9cf92", roughness: 1, alphaMap: fadeMap, transparent: true, depthWrite: true }), 0, 0.005, 0, g);
    ground.rotation.x = -Math.PI / 2; ground.castShadow = false; ground.renderOrder = -1;

    // helai rumput instanced, bergoyang tertiup angin
    this.buildGrass(g, R);

    this.buildHouse(g);

    // jalan setapak batu
    const stone = stoneSet(41, 18, ["#a39c91", "#958e83", "#b1a99c", "#8b847a"]);
    const pathMat = this.setMat(stone, [1, 1], { roughness: 0.95 });
    for (let i = 0; i < 12; i++) {
      const s = mesh(new THREE.CylinderGeometry(0.5, 0.52, 0.08, 9), pathMat, Math.sin(i * 0.55) * 0.55, 0.03, 3.85 + i * 0.95, g);
      s.scale.set(0.85 + R() * 0.35, 1, 0.75 + R() * 0.3); s.rotation.y = R() * 3; s.castShadow = false;
    }

    // lampu taman besi
    const iron = this.std("#1c1a19", { metalness: 0.85, roughness: 0.45 });
    this.lanternLights = []; this.lanternGlass = this.std("#ffe2a8", { emissive: "#ffb460", emissiveIntensity: 3, roughness: 0.2 });
    [[-1.6, 5.6], [1.6, 5.6], [-1.6, 10.2], [1.6, 10.2]].forEach(([x, z], i) => {
      const L = new THREE.Group(); L.position.set(x + Math.sin((z - 3.85) * 0.55) * 0.55, 0, z); g.add(L);
      mesh(new THREE.CylinderGeometry(0.035, 0.06, 1.7, 10), iron, 0, 0.85, 0, L);
      mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.05, 10), iron, 0, 1.72, 0, L);
      mesh(new THREE.BoxGeometry(0.2, 0.28, 0.2), this.lanternGlass, 0, 1.88, 0, L, false);
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mesh(new THREE.BoxGeometry(0.02, 0.3, 0.02), iron, a * 0.1, 1.88, b * 0.1, L);
      const cap = mesh(new THREE.ConeGeometry(0.19, 0.18, 4), iron, 0, 2.11, 0, L); cap.rotation.y = Math.PI / 4;
      const gl = glowSprite("#ffb85c", 0.9, 0.45); gl.position.y = 1.88; L.add(gl);
      if (i < 2) { const pl = new THREE.PointLight("#ffb35c", 2.5, 6, 2); pl.position.y = 1.88; L.add(pl); this.lanternLights.push(pl); }
    });

    // pepohonan
    this.trees = [];
    [[-8.5, -4, 1.15, 0], [-11, 3, 0.95, 1], [9, -5, 1.25, 0], [11.5, 2, 0.9, 2], [-6.5, -10, 1.1, 1], [6.5, -10.5, 1.0, 0],
     [-12.5, 9, 0.85, 2], [12.8, 8, 0.9, 1], [0.5, -12.5, 1.2, 0], [-14, -3.5, 0.9, 0], [14.2, -4, 0.85, 2]]
      .forEach(([x, z, s, type]) => this.makeTree(g, x, z, s, type, R));
    // barisan hutan di kejauhan (membingkai halaman & menutupi latar yang mengganggu)
    const ringN = this.low ? 18 : this.mobile ? 24 : 32;
    for (let i = 0; i < ringN; i++) {
      const a = (i / ringN) * Math.PI * 2 + R() * 0.12; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) - Math.PI / 2) < 0.28) continue; // celah di arah kamera depan
      const rr = 24 + R() * 7;
      this.makeTree(g, Math.cos(a) * rr, Math.sin(a) * rr, 1.3 + R() * 0.7, Math.floor(R() * 3), R, 170);
    }
    // semak & bunga di depan rumah
    [[-3.2, 3.5], [-4.4, 3.1], [-5.1, 1.5], [2.2, 3.5], [5.4, 3.2], [5.6, 0.4], [-4.8, -2.8], [5.1, -3]].forEach(([x, z], i) => this.makeBush(g, x, z, 0.75 + R() * 0.3, R, i));

    // papan nama kayu
    const sign = new THREE.Group(); sign.position.set(3.1, 0, 11.2); sign.rotation.y = -0.4; g.add(sign);
    const post = this.woodMat([0.3, 1], "#8a6a4f");
    mesh(new THREE.BoxGeometry(0.12, 1.9, 0.12), post, -1.05, 0.95, 0, sign);
    mesh(new THREE.BoxGeometry(0.12, 1.9, 0.12), post, 1.05, 0.95, 0, sign);
    mesh(new THREE.BoxGeometry(2.5, 1.05, 0.08), this.woodMat([1, 0.5], "#b08a66"), 0, 1.42, 0, sign);
    const name = this.data.profile.name || "Saya";
    this.signFace = new THREE.Mesh(new THREE.PlaneGeometry(2.36, 0.92), new THREE.MeshStandardMaterial({ map: this.signTexture(name), roughness: 0.85, transparent: true }));
    this.signFace.position.set(0, 1.42, 0.041); sign.add(this.signFace);

    // kotak surat
    const mb = new THREE.Group(); mb.position.set(-2.7, 0, 10.6); mb.rotation.y = 0.3; g.add(mb);
    mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), post, 0, 0.55, 0, mb);
    mesh(new RoundedBoxGeometry(0.42, 0.38, 0.62, 4, 0.15), this.std("#2f4a6b", { metalness: 0.6, roughness: 0.4 }), 0, 1.28, 0, mb);
    mesh(new THREE.BoxGeometry(0.03, 0.3, 0.05), this.std("#b3261e", { metalness: 0.5, roughness: 0.4 }), 0.23, 1.42, 0.1, mb);

    // debu cahaya keemasan (serbuk sari di sinar matahari)
    const FFN = 140; this.ffData = [];
    const fpos = new Float32Array(FFN * 3);
    for (let i = 0; i < FFN; i++) this.ffData.push({ x: (R() - 0.5) * 24, y: 0.3 + R() * 3.5, z: (R() - 0.5) * 24, p: R() * 6.28, s: 0.2 + R() * 0.4 });
    const fg = new THREE.BufferGeometry(); fg.setAttribute("position", new THREE.BufferAttribute(fpos, 3));
    this.fireflies = new THREE.Points(fg, new THREE.PointsMaterial({ map: glowTex, color: new THREE.Color(1.6, 1.3, 0.8), size: 0.12, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(this.fireflies);

    // asap cerobong
    const smokeTex = this.tex("smoke.png"); smokeTex.wrapS = smokeTex.wrapT = THREE.ClampToEdgeWrapping;
    this.smoke = [];
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: "#cfc8c0", transparent: true, opacity: 0, depthWrite: false, rotation: R() * 6 }));
      s.userData.t = i / 12; g.add(s); this.smoke.push(s);
    }
  }

  buildGrass(g, R) {
    // geometri helai: strip meruncing 4 segmen dengan gradasi warna
    const segs = 4, pos = [], colA = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, w = 0.045 * (1 - t * 0.9), bend = t * t * 0.18;
      pos.push(-w, t, bend, w, t, bend);
      const c = new THREE.Color("#46561f").lerp(new THREE.Color("#cfc57e"), t);
      colA.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colA, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 });
    this.windUniform = { value: 0 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.windUniform;
      sh.vertexShader = "uniform float uTime;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
        vec4 wp0 = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
        float sway = sin(uTime*1.6 + wp0.x*0.45 + wp0.z*0.3) * 0.5 + sin(uTime*3.1 + wp0.x*1.3) * 0.2;
        transformed.x += sway * 0.09 * position.y * position.y;
        transformed.z += sway * 0.04 * position.y * position.y;`);
      // normal mengarah ke atas agar rumput tampak menyatu dengan tanah
      sh.fragmentShader = sh.fragmentShader.replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\n normal = normalize(mix(normal, (viewMatrix * vec4(0.,1.,0.,0.)).xyz, 0.65));");
    };
    const N = this.low ? 2500 : this.mobile ? 6000 : 12000, grass = new THREE.InstancedMesh(geo, mat, N);
    const dm = new THREE.Object3D(), col = new THREE.Color(); let k = 0, guard = 0;
    while (k < N && guard++ < 200000) {
      const a = R() * Math.PI * 2, rr = 2 + Math.sqrt(R()) * 18, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (Math.abs(x) < 4.6 && z > -3.6 && z < 3.6) continue; // tapak rumah
      if (x > 2.2 && x < 5.4 && z > 0 && z < 3.4) continue; // menara
      if (Math.abs(x - Math.sin((z - 3.85) / 0.95 * 0.55) * 0.55) < 0.75 && z > 3.3 && z < 15) continue; // jalan
      if (rr > 15 && R() > (20 - rr) / 5) continue; // menipis di tepi
      if (this.grassFilter && !this.grassFilter(x, z)) continue;
      dm.position.set(x, 0, z); dm.rotation.set(0, R() * Math.PI, 0);
      const h = 0.25 + R() * 0.35; dm.scale.set(0.8 + R() * 0.6, h, 1); dm.updateMatrix();
      grass.setMatrixAt(k, dm.matrix);
      col.setHSL(0.15 + R() * 0.07, 0.4 + R() * 0.2, 0.5 + R() * 0.25); grass.setColorAt(k, col); k++;
    }
    grass.count = k; grass.receiveShadow = true; g.add(grass);
    // bunga liar kecil
    const FN = 260, fl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.045, 1), this.std("#ffffff", { roughness: 0.6 }), FN);
    const fc = ["#fff6e8", "#ffd34d", "#d9a0ff", "#ff9ab8"].map((c) => new THREE.Color(c)); let f = 0; guard = 0;
    while (f < FN && guard++ < 20000) {
      const x = (R() - 0.5) * 26, z = (R() - 0.5) * 26; if (Math.hypot(x, z) > 13 || (Math.abs(x) < 5.4 && z > -4 && z < 4.2) || (Math.abs(x) < 1.3 && z > 3)) continue;
      dm.position.set(x, 0.3 + R() * 0.2, z); dm.rotation.set(0, 0, 0); dm.scale.set(1, 0.6, 1); dm.updateMatrix(); fl.setMatrixAt(f, dm.matrix); fl.setColorAt(f, fc[Math.floor(R() * fc.length)]); f++;
    }
    fl.count = f; g.add(fl);
  }

  signTexture(name) {
    return canvasTex(768, 300, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.textAlign = "center"; g.textBaseline = "middle";
      g.font = "600 40px Fredoka, Nunito, sans-serif"; g.fillStyle = "rgba(52,30,14,.85)"; g.fillText("Selamat datang di", w / 2, 88);
      g.font = "700 100px Fredoka, Nunito, sans-serif"; g.fillStyle = "#3a2210";
      g.shadowColor = "rgba(255,235,200,.45)"; g.shadowOffsetY = 2; g.shadowBlur = 1;
      g.fillText(`Rumah ${name}`, w / 2, 192, w - 60);
    });
  }

  makeTree(parent, x, z, s, type, R, leafN) {
    if (!this._leafMats) {
      const bark = barkSet();
      this._barkMat = new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normalMap, roughness: 1 });
      this._barkMat.map.repeat.set(2, 3); this._barkMat.normalMap.repeat.set(2, 3);
      const palettes = [["#2c4d1d", "#3a5f24", "#46692b", "#243f18"], ["#3e5a1f", "#4d6a26", "#5b772e", "#33491b"], ["#1f3f22", "#2b4f2c", "#1b351c", "#355a33"]];
      this._leafMats = palettes.map((p, i) => {
        const t = leafTexture(50 + i, p);
        return new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.45, alphaToCoverage: !this.low, side: THREE.DoubleSide, roughness: 0.75 });
      });
      this._leafDepth = this._leafMats.map((m) => new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: m.map, alphaTest: 0.45 }));
    }
    const t = new THREE.Group(); t.position.set(x, 0, z); t.scale.setScalar(s); t.rotation.y = R() * 6; parent.add(t);
    const tall = type === 2;
    const trunkH = tall ? 5.0 : 3.0;
    const tg = new THREE.CylinderGeometry(0.16, 0.3, trunkH, 10, 6);
    { const p = tg.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) / trunkH + 0.5; p.setX(i, p.getX(i) + Math.sin(y * 3) * 0.08); } tg.computeVertexNormals(); }
    mesh(tg, this._barkMat, 0, trunkH / 2, 0, t);
    const blobs = [];
    if (tall) { for (let i = 0; i < 6; i++) blobs.push([0, 2.4 + i * 0.85, 0, 1.25 - i * 0.12]); }
    else {
      blobs.push([0, trunkH + 1.2, 0, 1.7]);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + R(), d = 1.0 + R() * 0.5, by = trunkH - 0.2 + R() * 0.9;
        const br = new THREE.CylinderGeometry(0.04, 0.09, d * 1.25, 6); br.translate(0, d * 0.62, 0);
        const b = mesh(br, this._barkMat, 0, trunkH - 0.6, 0, t); b.rotation.set(0, -a, 0.95); b.rotation.order = "YXZ";
        blobs.push([Math.cos(a) * d * 1.05, by + 0.35, Math.sin(a) * d * 1.05, 1.05 + R() * 0.3]);
      }
    }
    const N = leafN || (tall ? 200 : 320), li = new THREE.InstancedMesh(new THREE.PlaneGeometry(leafN ? 1.6 : 1.25, leafN ? 1.6 : 1.25), this._leafMats[type], N);
    li.customDepthMaterial = this._leafDepth[type];
    const dm = new THREE.Object3D(), col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const [bx, by, bz, br] = blobs[Math.floor(R() * blobs.length)];
      const u = R() * 2 - 1, a = R() * Math.PI * 2, rr = Math.cbrt(R()) * br, q = Math.sqrt(1 - u * u);
      dm.position.set(bx + Math.cos(a) * q * rr, by + u * rr * 0.8, bz + Math.sin(a) * q * rr);
      dm.rotation.set(R() * 6, R() * 6, R() * 6); dm.scale.setScalar(0.7 + R() * 0.6); dm.updateMatrix();
      li.setMatrixAt(i, dm.matrix);
      // daun di bagian bawah/dalam lebih gelap (oklusi palsu)
      const shadeK = 0.55 + 0.45 * clamp((dm.position.y - (tall ? 2 : trunkH)) / (tall ? 5 : 3), 0, 1) * (rr / br * 0.5 + 0.5);
      col.setRGB(shadeK, shadeK, shadeK); li.setColorAt(i, col);
    }
    li.castShadow = !leafN; li.receiveShadow = true; t.add(li);
    t.userData.sway = R() * 6; this.trees.push(t);
    return t;
  }

  makeBush(parent, x, z, s, R, i) {
    if (!this._leafMats) this.makeTree(new THREE.Group(), 0, 0, 1, 0, R); // siapkan material
    const b = new THREE.Group(); b.position.set(x, 0, z); b.scale.setScalar(s); parent.add(b);
    const N = 70, li = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.75, 0.75), this._leafMats[i % 2 ? 1 : 0], N);
    li.customDepthMaterial = this._leafDepth[i % 2 ? 1 : 0];
    const dm = new THREE.Object3D(), col = new THREE.Color();
    for (let k = 0; k < N; k++) {
      const u = R(), a = R() * 6.28, rr = Math.sqrt(R()) * 0.75;
      dm.position.set(Math.cos(a) * rr, 0.15 + u * 0.75, Math.sin(a) * rr * 0.8); dm.rotation.set(R() * 6, R() * 6, R() * 6); dm.scale.setScalar(0.7 + R() * 0.5); dm.updateMatrix();
      li.setMatrixAt(k, dm.matrix); const c = 0.55 + u * 0.45; col.setRGB(c, c, c); li.setColorAt(k, col);
    }
    li.castShadow = li.receiveShadow = true; b.add(li);
    const fc = ["#f5f0ff", "#ffb3c8", "#ffd966"][i % 3];
    for (let k = 0; k < 9; k++) mesh(new THREE.IcosahedronGeometry(0.05, 1), this.std(fc, { roughness: 0.5 }), (R() - 0.5) * 1.2, 0.5 + R() * 0.45, 0.35 + R() * 0.3, b, false);
  }

  buildHouse(g) {
    const H = (this.house = new THREE.Group()); g.add(H);
    const plaster = plasterSet("#d9c7a6", 3), stone = stoneSet(11), tiles = tileSet({}), slate = tileSet({ cols: 10, rows: 12, palette: ["#4b5260", "#545c6b", "#3f4653", "#5e6675"], gap: "#15181d", seed: 9, round: false });
    const trimW = paintedWoodSet("#f3eee4"), shutterW = paintedWoodSet("#3d5c52", 33);
    const wall = this.setMat(plaster, [3, 1.6], { roughness: 0.92 });
    const stoneM = this.setMat(stone, [6, 0.6]);
    const roofM = this.setMat(tiles, [4.5, 5.5], { roughness: 0.75 });
    const trim = this.setMat(trimW, [1, 1], { roughness: 0.6 });
    this._trim = trim; this._shutter = this.setMat(shutterW, [1, 2], { roughness: 0.6 });
    this._glass = new THREE.MeshPhysicalMaterial({ color: "#ffd59a", emissive: "#ffa64d", emissiveIntensity: 1.1, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 });

    mesh(new RoundedBoxGeometry(7.5, 0.55, 5.9, 3, 0.05), stoneM, 0, 0.27, 0, H);
    mesh(new RoundedBoxGeometry(7, 3.6, 5.5, 3, 0.04), wall, 0, 2.3, 0, H);
    // gable
    const tri = new THREE.Shape(); tri.moveTo(-3.5, 0); tri.lineTo(3.5, 0); tri.lineTo(0, 2.5); tri.closePath();
    const gableM = this.setMat(plaster, [0.45, 0.45], { roughness: 0.92 });
    mesh(new THREE.ExtrudeGeometry(tri, { depth: 5.4, bevelEnabled: false }), gableM, 0, 4.1, -2.7, H);
    // papan lis bawah atap
    mesh(new THREE.BoxGeometry(7.1, 0.18, 5.6), trim, 0, 4.15, 0, H);
    // atap genteng
    const ang = Math.atan2(2.5, 3.5), len = Math.hypot(3.5, 2.5) + 0.9;
    [-1, 1].forEach((s) => {
      const slab = mesh(new THREE.BoxGeometry(len, 0.18, 6.5), [roofM, roofM, roofM, roofM, roofM, roofM], 0, 0, 0, H);
      slab.position.set(s * 1.75 + s * Math.sin(ang) * 0.1 + s * Math.cos(ang) * 0.25, 5.35 + Math.cos(ang) * 0.1 - Math.sin(ang) * 0.25, 0);
      slab.rotation.z = -s * ang;
      // lis kayu di ujung atap (fascia)
      const fas = mesh(new THREE.BoxGeometry(len, 0.26, 0.08), trim, 0, -0.06, 3.27, slab); void fas;
      mesh(new THREE.BoxGeometry(len, 0.26, 0.08), trim, 0, -0.06, -3.27, slab);
    });
    const ridge = mesh(new THREE.CylinderGeometry(0.16, 0.16, 6.6, 14, 1, false, 0, Math.PI), this.std("#8f3f2c", { roughness: 0.7 }), 0, 6.62, 0, H);
    ridge.rotation.set(Math.PI / 2, 0, Math.PI);

    // cerobong bata
    const ch = new THREE.Group(); ch.position.set(-2.1, 0, -1.2); H.add(ch);
    mesh(new THREE.BoxGeometry(0.85, 2.4, 0.85), this.brickMat([0.6, 1.6]), 0, 6.1, 0, ch);
    mesh(new THREE.BoxGeometry(1.0, 0.16, 1.0), stoneM, 0, 7.36, 0, ch);
    mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 12), this.std("#7a3e2b"), 0.15, 7.58, 0.1, ch);
    this.chimneyTop = new THREE.Vector3(-1.95, 7.75, -1.1);

    // menara batu dengan atap sirap batu (slate)
    const tw = new THREE.Group(); tw.position.set(3.75, 0, 1.75); H.add(tw);
    mesh(new THREE.CylinderGeometry(1.32, 1.42, 6.6, 36), this.setMat(stone, [5, 4.5]), 0, 3.3, 0, tw);
    mesh(new THREE.CylinderGeometry(1.46, 1.46, 0.2, 36), trim, 0, 6.6, 0, tw);
    mesh(new THREE.ConeGeometry(1.8, 3.3, 36, 1, true), this.setMat(slate, [7, 3], { roughness: 0.6, side: THREE.DoubleSide }), 0, 8.35, 0, tw);
    const metal = this.std("#2a2522", { metalness: 0.9, roughness: 0.35 });
    mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6), metal, 0, 10.4, 0, tw);
    mesh(new THREE.SphereGeometry(0.07, 12, 10), this.std("#c9a14a", { metalness: 1, roughness: 0.3 }), 0, 10.05, 0, tw);
    this.flag = mesh(new THREE.PlaneGeometry(0.7, 0.4, 10, 2), this.std("#b8322a", { side: THREE.DoubleSide, roughness: 0.9 }), 0.36, 10.75, 0, tw);
    this.flagBase = this.flag.geometry.attributes.position.array.slice();
    [[0, 4.6, 1.33, 0], [1.33, 3.0, 0, Math.PI / 2]].forEach(([x, y, z, ry]) => { const w = this.makeRoundWindow(0.38); w.position.set(x, y, z); w.rotation.y = ry; tw.add(w); });

    // jendela
    const wins = [[-2.2, 2.15, 2.76, 0], [1.4, 2.15, 2.76, 0], [-3.51, 2.3, 0.9, -Math.PI / 2], [-3.51, 2.3, -1.3, -Math.PI / 2], [3.51, 2.3, -1.3, Math.PI / 2]];
    wins.forEach(([x, y, z, ry], i) => { const w = this.makeWindow(i < 2); w.position.set(x, y, z); w.rotation.y = ry; H.add(w); });
    const gw = this.makeRoundWindow(0.45); gw.position.set(0, 5.0, 2.72); H.add(gw);

    // pintu kayu (berengsel kiri) dengan bingkai batu
    const D = 1.3, Hs = 1.6, r = D / 2;
    const arch = (ww, hs) => { const s = new THREE.Shape(); s.moveTo(-ww / 2, 0); s.lineTo(ww / 2, 0); s.lineTo(ww / 2, hs); s.absarc(0, hs, ww / 2, 0, Math.PI, false); s.lineTo(-ww / 2, 0); return s; };
    const frameShape = arch(D + 0.45, Hs); frameShape.holes.push(arch(D, Hs));
    mesh(new THREE.ExtrudeGeometry(frameShape, { depth: 0.18, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 28 }), this.setMat(stone, [0.7, 0.7]), 0, 0.55, 2.7, H);
    this.doorwayMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#1c120a") });
    this.doorway = mesh(new THREE.ShapeGeometry(arch(D, Hs), 24), this.doorwayMat, 0, 0.55, 2.765, H, false);
    this.doorPivot = new THREE.Group(); this.doorPivot.position.set(-r, 0.55, 2.8); H.add(this.doorPivot);
    const doorM = this.woodMat([0.6, 0.9], "#9a6a48", { emissive: new THREE.Color(0, 0, 0) });
    const door = mesh(new THREE.ExtrudeGeometry(arch(D - 0.04, Hs), { depth: 0.09, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, curveSegments: 28 }), doorM, r, 0, -0.045, this.doorPivot);
    this.doorMesh = door;
    for (let k = -1; k <= 1; k++) mesh(new THREE.BoxGeometry(0.012, 1.55, 0.01), this.std("#2a1a10"), r + k * 0.32, 0.85, 0.055, this.doorPivot, false);
    [0.42, 1.48].forEach((y) => mesh(new THREE.BoxGeometry(1.1, 0.06, 0.02), metal, r - 0.05, y, 0.06, this.doorPivot, false));
    const brass = this.std("#c9a14a", { metalness: 1, roughness: 0.25 });
    mesh(new THREE.SphereGeometry(0.05, 16, 12), brass, r + 0.45, 1.02, 0.09, this.doorPivot);
    mesh(new THREE.TorusGeometry(0.07, 0.012, 8, 20), brass, r, 1.5, 0.08, this.doorPivot);
    mesh(new THREE.CircleGeometry(0.17, 24), this._glass, r, 1.85, 0.056, this.doorPivot, false);
    // tangga batu
    mesh(new RoundedBoxGeometry(2.2, 0.26, 0.7, 2, 0.03), this.setMat(stone, [1.5, 0.4]), 0, 0.13, 3.2, H);
    mesh(new RoundedBoxGeometry(1.8, 0.26, 0.5, 2, 0.03), this.setMat(stone, [1.2, 0.3]), 0, 0.4, 2.98, H);
    // kanopi di atas pintu
    const can = mesh(new THREE.BoxGeometry(1.9, 0.12, 1.0), [roofM, roofM, roofM, roofM, roofM, roofM], 0, 3.25, 3.15, H); can.rotation.x = 0.3;
    [-0.8, 0.8].forEach((x) => { const br = mesh(new THREE.BoxGeometry(0.07, 0.07, 0.62), this.woodMat([0.2, 0.5], "#7a5a40"), x, 2.98, 3.08, H); br.rotation.x = -0.75; });
    // lampu dinding di samping pintu
    [-1.0, 1.0].forEach((x) => {
      mesh(new THREE.BoxGeometry(0.16, 0.3, 0.16), this.lanternGlass || this.std("#ffe2a8", { emissive: "#ffb460", emissiveIntensity: 3 }), x, 2.3, 2.9, H, false);
      mesh(new THREE.ConeGeometry(0.14, 0.12, 4), metal, x, 2.51, 2.9, H).rotation.y = Math.PI / 4;
    });

    this.doorLight = new THREE.PointLight("#ffcf85", 2.5, 8, 2); this.doorLight.position.set(0, 2.4, 3.5); H.add(this.doorLight);
    this.doorGlow = glowSprite("#ffd890", 2.4, 0.18); this.doorGlow.position.set(0, 1.7, 3.0); H.add(this.doorGlow);
    this.doorTargets = [door, this.doorway, ...this.doorPivot.children];
  }

  makeWindow(withBox) {
    const w = new THREE.Group();
    mesh(new THREE.BoxGeometry(1.2, 1.4, 0.12), this._trim, 0, 0, 0, w);
    mesh(new THREE.BoxGeometry(1.3, 0.08, 0.22), this._trim, 0, -0.72, 0.06, w);
    mesh(new THREE.PlaneGeometry(1.0, 1.2), this._glass, 0, 0, 0.065, w, false);
    mesh(new THREE.BoxGeometry(0.05, 1.2, 0.04), this._trim, 0, 0, 0.08, w, false);
    mesh(new THREE.BoxGeometry(1.0, 0.05, 0.04), this._trim, 0, 0.05, 0.08, w, false);
    // tirai dalam (memberi kedalaman)
    mesh(new THREE.PlaneGeometry(0.32, 1.15), this.std("#e9d7b9", { emissive: "#c98a45", emissiveIntensity: 0.5 }), -0.33, 0, 0.03, w, false);
    mesh(new THREE.PlaneGeometry(0.32, 1.15), this.std("#e9d7b9", { emissive: "#c98a45", emissiveIntensity: 0.5 }), 0.33, 0, 0.03, w, false);
    [-1, 1].forEach((s) => {
      const sh = new THREE.Group(); sh.position.set(s * 0.82, 0, 0.05); w.add(sh);
      mesh(new THREE.BoxGeometry(0.42, 1.4, 0.05), this._shutter, 0, 0, 0, sh);
      for (let k = 0; k < 9; k++) mesh(new THREE.BoxGeometry(0.36, 0.035, 0.02), this._shutter, 0, -0.56 + k * 0.14, 0.035, sh, false);
    });
    if (withBox) {
      mesh(new THREE.BoxGeometry(1.3, 0.24, 0.3), this.woodMat([0.8, 0.2], "#8a6a4f"), 0, -0.88, 0.2, w);
      const R = rng(Math.floor(Math.random() * 999));
      const li = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.3, 0.3), this._leafMats ? this._leafMats[0] : this.std("#4f7d33"), 22);
      const dm = new THREE.Object3D();
      for (let k = 0; k < 22; k++) { dm.position.set((R() - 0.5) * 1.15, -0.7 + R() * 0.15, 0.2 + (R() - 0.5) * 0.2); dm.rotation.set(R() * 6, R() * 6, R() * 6); dm.updateMatrix(); li.setMatrixAt(k, dm.matrix); }
      w.add(li);
      for (let k = 0; k < 8; k++) mesh(new THREE.IcosahedronGeometry(0.05, 1), this.std(["#d8324a", "#f5efe6", "#e86a9a"][k % 3], { roughness: 0.5 }), -0.52 + k * 0.15, -0.62 + R() * 0.06, 0.24 + (k % 2) * 0.05, w, false);
    }
    return w;
  }
  makeRoundWindow(r) {
    const w = new THREE.Group();
    mesh(new THREE.TorusGeometry(r, 0.06, 12, 40), this._trim, 0, 0, 0.03, w);
    mesh(new THREE.CircleGeometry(r, 36), this._glass, 0, 0, 0.015, w, false);
    mesh(new THREE.BoxGeometry(0.04, r * 2, 0.03), this._trim, 0, 0, 0.05, w, false);
    mesh(new THREE.BoxGeometry(r * 2, 0.04, 0.03), this._trim, 0, 0, 0.05, w, false);
    return w;
  }

  // ==================================================================
  //  DALAM RUMAH
  // ==================================================================
  buildInterior() {
    const g = (this.int = new THREE.Group()); this.scene.add(g);
    const W = 12, Dz0 = -6, Dz1 = 5, HT = 4.6, R = rng(3);
    const depth = Dz1 - Dz0, cz = (Dz0 + Dz1) / 2;

    // lantai parket asli
    const floor = mesh(new THREE.PlaneGeometry(W, depth), this.woodMat([3, 5.5], "#d9b896", { roughness: 1 }), 0, 0, cz, g); floor.rotation.x = -Math.PI / 2;
    floor.castShadow = false;

    // dinding plester dicat hangat
    const st = this.interiorStyle ? this.interiorStyle() : {};
    const plaster = st.wallMat ? null : plasterSet("#e8d3b6", 17);
    const wallMat = st.wallMat || this.setMat(plaster, [3, 1.3], { roughness: 0.95 });
    const sideMat = st.sideMat || st.wallMat || this.setMat(plaster, [2.8, 1.3], { roughness: 0.95 });
    mesh(new THREE.PlaneGeometry(W, HT), wallMat, 0, HT / 2, Dz0, g);
    const left = mesh(new THREE.PlaneGeometry(depth, HT), sideMat, -W / 2, HT / 2, cz, g); left.rotation.y = Math.PI / 2;
    const right = mesh(new THREE.PlaneGeometry(depth, HT), sideMat, W / 2, HT / 2, cz, g); right.rotation.y = -Math.PI / 2;
    const front = mesh(new THREE.PlaneGeometry(W, HT), wallMat, 0, HT / 2, Dz1, g); front.rotation.y = Math.PI;
    const ceil = mesh(new THREE.PlaneGeometry(W, depth), this.setMat(plasterSet("#f3ece2", 23), [3, 3]), 0, HT, cz, g); ceil.rotation.x = Math.PI / 2;
    const beamM = this.woodMat([2, 0.2], "#6e4a32");
    [-4.2, -1.2, 1.8].forEach((z) => mesh(new THREE.BoxGeometry(W, 0.3, 0.3), beamM, 0, HT - 0.15, z, g));

    // panel kayu (wainscot) + list profil
    const wain = st.wain || this.woodMat([3, 0.4], "#5e3f2a", { roughness: 0.6 });
    const railM = st.railM || this.woodMat([3, 0.1], "#4a3120", { roughness: 0.5 });
    const wainscot = (len, place) => {
      const grp = new THREE.Group(); place(grp); g.add(grp);
      mesh(new THREE.BoxGeometry(len, 1.05, 0.05), wain, 0, 0.525, 0.025, grp);
      const n = Math.round(len / 1.1);
      for (let i = 0; i < n; i++) mesh(new THREE.BoxGeometry(len / n - 0.18, 0.7, 0.025), wain, -len / 2 + (i + 0.5) * (len / n), 0.53, 0.06, grp);
      mesh(new THREE.BoxGeometry(len, 0.07, 0.1), railM, 0, 1.07, 0.05, grp);
      mesh(new THREE.BoxGeometry(len, 0.14, 0.07), railM, 0, 0.07, 0.04, grp);
    };
    wainscot(W, (o) => o.position.set(0, 0, Dz0));
    wainscot(depth, (o) => { o.position.set(-W / 2, 0, cz); o.rotation.y = Math.PI / 2; });
    wainscot(depth, (o) => { o.position.set(W / 2, 0, cz); o.rotation.y = -Math.PI / 2; });
    wainscot(W, (o) => { o.position.set(0, 0, Dz1); o.rotation.y = Math.PI; });
    // list langit-langit
    [[0, Dz0 + 0.05, 0, W], [0, Dz1 - 0.05, 0, W]].forEach(([x, z, , l]) => mesh(new THREE.BoxGeometry(l, 0.14, 0.1), this._trim, x, HT - 0.07, z, g));
    // pintu dalam
    mesh(new THREE.BoxGeometry(1.4, 2.6, 0.08), this.woodMat([0.6, 1], "#8a5a3a"), 0, 1.3, Dz1 - 0.06, g);

    // karpet persia
    const rugTex = st.rugTex || canvasTex(1024, 1024, (c, w, h) => {
      c.fillStyle = "#6e1f22"; c.fillRect(0, 0, w, h);
      c.strokeStyle = "#1f2a44"; c.lineWidth = 70; c.strokeRect(35, 35, w - 70, h - 70);
      c.strokeStyle = "#c9a45c"; c.lineWidth = 8; c.strokeRect(78, 78, w - 156, h - 156); c.strokeRect(14, 14, w - 28, h - 28);
      for (let i = 0; i < 28; i++) { c.fillStyle = i % 2 ? "#c9a45c" : "#8d2a2c"; const t = (i + 0.5) / 28 * (w - 140) + 70; for (const [x, y] of [[t, 35], [t, h - 35], [35, t], [w - 35, t]]) { c.beginPath(); c.arc(x, y, 12, 0, 7); c.fill(); } }
      c.save(); c.translate(w / 2, h / 2);
      for (let r = 5; r >= 1; r--) { c.fillStyle = ["#1f2a44", "#c9a45c", "#8d2a2c", "#e8d6b0", "#1f2a44"][r - 1]; c.beginPath(); for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, rr = r * 52 * (k % 2 ? 0.78 : 1); c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.fill(); }
      c.restore();
      const RR = rng(8); c.fillStyle = "#c9a45c";
      for (let i = 0; i < 70; i++) { const x = 140 + RR() * (w - 280), y = 140 + RR() * (h - 280); if (Math.hypot(x - w / 2, y - h / 2) < 300) continue; c.save(); c.translate(x, y); c.rotate(RR() * 6); c.fillRect(-10, -3, 20, 6); c.fillRect(-3, -10, 6, 20); c.restore(); }
      const img = c.getImageData(0, 0, w, h), d = img.data; for (let i = 0; i < d.length; i += 4) { const n = 0.85 + Math.random() * 0.2; d[i] *= n; d[i + 1] *= n; d[i + 2] *= n; } c.putImageData(img, 0, 0);
    });
    const rug = mesh(new THREE.PlaneGeometry(5.2, 3.6), new THREE.MeshPhysicalMaterial({ map: rugTex, roughness: 1, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color("#ffd9c0") }), 0, 0.008, -1.2, g);
    rug.rotation.x = -Math.PI / 2; rug.castShadow = false;

    // meja kopi kayu + laptop
    const tb = new THREE.Group(); tb.position.set(0, 0, -1.2); g.add(tb);
    const tableM = this.woodMat([1, 1], "#a67a55", { roughness: 0.45 });
    mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.06, 48), tableM, 0, 0.5, 0, tb);
    mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.47, 16), tableM, 0, 0.24, 0, tb);
    mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.04, 32), tableM, 0, 0.02, 0, tb);
    const alu = this.std("#c4c7cc", { metalness: 0.9, roughness: 0.3 });
    mesh(new RoundedBoxGeometry(0.62, 0.02, 0.42, 2, 0.008), alu, 0, 0.54, 0.05, tb);
    const scr = new THREE.Group(); scr.position.set(0, 0.55, -0.16); scr.rotation.x = -0.28; tb.add(scr);
    mesh(new RoundedBoxGeometry(0.62, 0.41, 0.015, 2, 0.006), alu, 0, 0.205, 0, scr);
    const chartTex = canvasTex(512, 340, (c, w, h) => {
      c.fillStyle = "#0b1224"; c.fillRect(0, 0, w, h);
      c.strokeStyle = "rgba(255,255,255,.07)"; for (let x = 0; x < w; x += 48) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
      let y = 240; for (let x = 20; x < w - 16; x += 20) { const ny = clamp(y + (R() - 0.55) * 50, 40, 300); c.fillStyle = ny < y ? "#26c281" : "#ef4f5f"; c.fillRect(x, Math.min(y, ny), 12, Math.max(4, Math.abs(ny - y))); c.fillRect(x + 5, Math.min(y, ny) - 10, 2, Math.abs(ny - y) + 20); y = ny; }
      c.strokeStyle = "#f2c94c"; c.lineWidth = 3; c.beginPath(); for (let x = 0; x < w; x += 10) c.lineTo(x, 220 - x * 0.28 + Math.sin(x * 0.04) * 20); c.stroke();
    });
    mesh(new THREE.PlaneGeometry(0.58, 0.37), new THREE.MeshBasicMaterial({ map: chartTex, color: new THREE.Color(1.2, 1.2, 1.2) }), 0, 0.205, 0.009, scr, false);
    mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 24), this.std("#f2efe9", { roughness: 0.25 }), 0.45, 0.58, 0.15, tb);

    // tanaman pot terakota
    const potM = this.std("#b5653f", { roughness: 0.85 });
    [[-5.45, -5.45, 0.7], [5.45, -5.45, 0.7], [-5.2, 4.2, 1], [5.2, 4.2, 1]].forEach(([x, z, sc], i) => {
      const p = new THREE.Group(); p.position.set(x, 0, z); p.scale.setScalar(sc); g.add(p);
      mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.55, 24), potM, 0, 0.275, 0, p);
      mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 24), potM, 0, 0.55, 0, p).rotation.x = Math.PI / 2;
      this.makeBush(p, 0, 0.35, 1.1, R, i);
    });

    // lampu berdiri kuningan
    const brass = this.std("#b8913f", { metalness: 1, roughness: 0.3 });
    const shadeM = new THREE.MeshStandardMaterial({ color: "#f3e3c3", emissive: "#ffb867", emissiveIntensity: 0.9, side: THREE.DoubleSide, roughness: 0.9 });
    [-1, 1].forEach((s) => {
      const L = new THREE.Group(); L.position.set(s * 5.35, 0, -1.25); g.add(L);
      mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.04, 24), brass, 0, 0.02, 0, L);
      mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.65, 10), brass, 0, 0.85, 0, L);
      mesh(new THREE.CylinderGeometry(0.2, 0.32, 0.38, 28, 1, true), shadeM, 0, 1.8, 0, L, false);
      const pl = new THREE.PointLight("#ffbf70", 6, 0, 2); pl.position.y = 1.75; L.add(pl);
    });

    // lampu gantung kuningan
    const chand = new THREE.Group(); chand.position.set(0, HT, -1.2); g.add(chand);
    mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.8, 6), brass, 0, -0.4, 0, chand);
    mesh(new THREE.TorusGeometry(0.5, 0.025, 10, 48), brass, 0, -0.85, 0, chand).rotation.x = Math.PI / 2;
    const bulb = this.std("#fff4dc", { emissive: "#ffd9a0", emissiveIntensity: 6, roughness: 0.1 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.08, 10), brass, Math.cos(a) * 0.5, -0.82, Math.sin(a) * 0.5, chand);
      mesh(new THREE.SphereGeometry(0.045, 14, 10), bulb, Math.cos(a) * 0.5, -0.74, Math.sin(a) * 0.5, chand, false);
    }
    const cl = new THREE.PointLight("#ffd6a0", 22, 0, 2); cl.position.set(0, -0.95, 0);
    cl.castShadow = !this.mobile; cl.shadow.mapSize.set(1024, 1024); cl.shadow.bias = -0.003; cl.shadow.radius = 6; chand.add(cl);
    const cg = glowSprite("#ffd27a", 1.6, 0.35); cg.position.y = -0.78; chand.add(cg);
    g.add(new THREE.HemisphereLight("#ffe6cc", "#3a2a20", 0.35));

    // debu melayang
    const DN = 160, dpos = new Float32Array(DN * 3); this.dust = [];
    for (let i = 0; i < DN; i++) this.dust.push({ x: (R() - 0.5) * 10, y: R() * 4, z: -5.5 + R() * 9, p: R() * 6.28 });
    const dg = new THREE.BufferGeometry(); dg.setAttribute("position", new THREE.BufferAttribute(dpos, 3));
    this.dustPts = new THREE.Points(dg, new THREE.PointsMaterial({ map: glowTex, color: new THREE.Color(1.2, 1.0, 0.75), size: 0.035, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(this.dustPts);

    this.frameGroup = new THREE.Group(); g.add(this.frameGroup);
    this.buildFrames();
  }

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
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(fw + 1.6, fh + 1.6), new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(sec.color).multiplyScalar(1.1), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.z = 0.01; inner.add(glow);
      const border = mesh(new RoundedBoxGeometry(fw + 0.3, fh + 0.3, 0.12, 3, 0.05), new THREE.MeshStandardMaterial({ color: "#d4ac5a", metalness: 1, roughness: 0.32 }), 0, 0, 0.07, inner);
      mesh(new RoundedBoxGeometry(fw + 0.1, fh + 0.1, 0.04, 2, 0.01), this.std("#f4efe6", { roughness: 0.95 }), 0, 0, 0.13, inner, false);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), new THREE.MeshBasicMaterial({ map: this.frameTexture(sec), toneMapped: false }));
      face.position.z = 0.155; inner.add(face);
      // lampu galeri di atas bingkai
      mesh(new RoundedBoxGeometry(0.9, 0.08, 0.1, 2, 0.03), this.std("#b8913f", { metalness: 1, roughness: 0.3 }), 0, fh / 2 + 0.32, 0.28, inner, false);
      mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.28, 6), this.std("#b8913f", { metalness: 1, roughness: 0.3 }), 0, fh / 2 + 0.24, 0.15, inner, false).rotation.x = Math.PI / 2;
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(fw + 0.6, fh + 0.5), new THREE.MeshBasicMaterial({
        map: (() => { const t = canvasTex(128, 128, (c2, w, h) => { c2.save(); c2.scale(1, 2); const gg = c2.createRadialGradient(w / 2, 0, 2, w / 2, 0, w * 0.55); gg.addColorStop(0, "rgba(255,230,180,.6)"); gg.addColorStop(1, "rgba(255,230,180,0)"); c2.fillStyle = gg; c2.fillRect(0, 0, w, h); c2.restore(); }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; })(),
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
        if (this.mode === "inside") { this.look.yawT = clamp(this.look.yawT + dx * 0.0042, -(this.yawLimit ?? 1.9), this.yawLimit ?? 1.9); this.look.pitchT = clamp(this.look.pitchT + dy * 0.003, -0.35, 0.35); }
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
    this.tween(4.2, (t) => { o.r = lerp(40, this.orbitR(), t); o.y = lerp(15, 6.2, t); o.theta = lerp(-1.3, this.orbitBase || 0, t); }, {
      easing: ease.inOut, onDone: () => { this.mode = "outside"; this.orbitBaseTime = this.time; this.cb.onReady && this.cb.onReady(); },
    });
  }

  orbitR() { return 24.5 / Math.min(1, this.camera.aspect * 1.35); }

  enter() {
    if (this.mode !== "outside") return;
    this.mode = "entering"; this.cb.onEnterStart && this.cb.onEnterStart();
    const p0 = this.camera.position.clone();
    const dy = this.doorY || 0;
    const curve = new THREE.CatmullRomCurve3([p0, new THREE.Vector3(p0.x * 0.35, 3.0 + dy, 10), new THREE.Vector3(0, 1.9 + dy, 5.6), new THREE.Vector3(0, 1.75 + dy, 3.6), new THREE.Vector3(0, 1.7 + dy, 1.4)]);
    const l0 = this.camLook.clone(), door = new THREE.Vector3(0, 1.65 + dy, 2.75), inside = new THREE.Vector3(0, 1.65 + dy, -6);
    // pintu terbuka + cahaya membanjir
    this.tween(1.5, (t) => { this.doorPivot.rotation.y = t * 1.75; }, { delay: 0.55, easing: ease.inOut });
    this.tween(1.6, (t) => {
      this.doorwayMat.color.setRGB(lerp(0.11, 3.2, t), lerp(0.07, 2.5, t), lerp(0.04, 1.5, t));
      this.doorLight.intensity = lerp(2.5, 16, t); this.doorGlow.material.opacity = lerp(0.18, 0.9, t); this.doorGlow.scale.setScalar(lerp(2.4, 5, t));
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
      this.doorPivot.rotation.y = 0; this.doorwayMat.color.set("#1c120a"); this.doorLight.intensity = 2.5; this.doorGlow.material.opacity = 0.18; this.doorGlow.scale.setScalar(2.4);
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
      this.camPos.set(0, 1.8 + (this.doorY || 0), 4.4); this.camLook.set(0, 1.6 + (this.doorY || 0), 20);
      this.doorPivot.rotation.y = 1.75;
      this.cb.fade && this.cb.fade(0, 800);
      this.tween(1.2, (t) => { this.doorPivot.rotation.y = (1 - t) * 1.75; }, { delay: 0.6, easing: ease.inOut });
      const o = this.orbit; o.drag = 0; o.dragV = 0;
      const ob = this.orbitBase || 0, target = new THREE.Vector3(Math.sin(ob) * this.orbitR(), 6.2, Math.cos(ob) * this.orbitR());
      const p0 = this.camPos.clone(), lA = this.camLook.clone(), lB = (this.lookTarget || new THREE.Vector3(0, 1.5, 0)).clone();
      this.tween(2.4, (t) => { this.camPos.lerpVectors(p0, target, t); this.camLook.lerpVectors(lA, lB, ease.out(Math.min(1, t * 1.6))); }, {
        delay: 0.2, easing: ease.inOut, tag: "cam",
        onDone: () => { o.theta = this.orbitBase || 0; o.r = this.orbitR(); o.y = 6.2; this.orbitBaseTime = this.time; this.mode = "outside"; this.cb.onExited && this.cb.onExited(); },
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
  // turunkan resolusi otomatis bila FPS rendah (mengurangi lag)
  adapt(rawDt) {
    const a = (this._perf ||= { sum: 0, n: 0, pr: this.renderer.getPixelRatio() });
    a.sum += rawDt; a.n++;
    if (a.n < 90) return;
    const fps = a.n / a.sum; a.sum = 0; a.n = 0;
    if (fps < 40 && a.pr > 0.75) a.pr = Math.max(0.75, a.pr - 0.25);
    else if (fps > 58 && a.pr < Math.min(devicePixelRatio, this.mobile ? 1.25 : 1.5)) a.pr = Math.min(a.pr + 0.25, devicePixelRatio);
    else return;
    this.renderer.setPixelRatio(a.pr); this.composer.setPixelRatio?.(a.pr); this.composer.setSize(innerWidth, innerHeight);
  }

  loop() {
    requestAnimationFrame(this.loop);
    const raw = this.clock.getDelta(); if (!this.low) this.adapt(raw);
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
        o.theta = lerp(o.theta, (this.orbitBase || 0) + auto + o.drag + this.mouseN.x * 0.05, 0.05);
        o.y = lerp(o.y, 6.2 + this.mouseN.y * 0.5, 0.05);
      }
      this.camPos.set(Math.sin(o.theta) * o.r, o.y, Math.cos(o.theta) * o.r);
      this.camLook.copy(this.lookTarget || new THREE.Vector3(0, 1.5, 0));
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
    this.windUniform.value = t;
    const fp = this.fireflies.geometry.attributes.position;
    this.ffData.forEach((f, i) => fp.setXYZ(i, f.x + Math.sin(t * f.s + f.p) * 1.2, f.y + Math.sin(t * f.s * 1.7 + f.p) * 0.4, f.z + Math.cos(t * f.s * 0.8 + f.p) * 1.2));
    fp.needsUpdate = true;
    const dh = this.doorHover || 0;
    if (this.mode === "outside" || this.mode === "intro") {
      this.doorGlow.material.opacity = 0.14 + Math.sin(t * 2) * 0.05 + dh * 0.35;
      this.doorMesh.material.emissive.setRGB(dh * 0.18, dh * 0.1, dh * 0.03);
    }
    this.smoke.forEach((s) => {
      s.userData.t = (s.userData.t + 0.0025) % 1; const k = s.userData.t;
      s.position.set(this.chimneyTop.x + Math.sin(k * 5 + t * 0.4) * 0.3 + k * 1.6, this.chimneyTop.y + k * 5, this.chimneyTop.z - k * 0.6);
      s.scale.setScalar(0.5 + k * 3.2); s.material.opacity = Math.sin(k * Math.PI) * 0.35 * (1 - k * 0.4);
      s.material.rotation += 0.002;
    });
    const fa = this.flag.geometry.attributes.position, b = this.flagBase;
    for (let i = 0; i < fa.count; i++) { const x = b[i * 3] + 0.35; fa.setZ(i, Math.sin(x * 8 - t * 5) * 0.05 * x * 1.6); }
    fa.needsUpdate = true; this.flag.geometry.computeVertexNormals();
    this.trees.forEach((tr) => { tr.rotation.z = Math.sin(t * 0.9 + tr.userData.sway) * 0.008; tr.rotation.x = Math.cos(t * 0.7 + tr.userData.sway) * 0.006; });
    this.lanternLights.forEach((l, i) => (l.intensity = 2.5 + Math.sin(t * 9 + i * 2) * 0.15));
  }

  animateInterior(t, dt) {
    const dp = this.dustPts.geometry.attributes.position;
    this.dust.forEach((d, i) => { d.y += dt * 0.06; if (d.y > 4.2) d.y = 0.2; dp.setXYZ(i, d.x + Math.sin(t * 0.3 + d.p) * 0.3, d.y, d.z + Math.cos(t * 0.25 + d.p) * 0.3); });
    dp.needsUpdate = true;
    this.frames.forEach((f) => {
      if (this.popStart != null) { const k = clamp((t - this.popStart - (f.popDelay || 0)) / 0.7, 0, 1); f.pop = k; }
      else f.pop = 1;
      const isHover = this.hovered === f || this.focused === f;
      f.hover = lerp(f.hover, isHover ? 1 : 0, 0.12);
      const sc = (f.pop < 1 ? ease.outBack(f.pop) : 1) * (1 + f.hover * 0.04);
      f.inner.scale.setScalar(Math.max(0.001, sc));
      f.inner.position.z = f.hover * 0.1;
      f.glow.material.opacity = f.hover * 0.45;
      const c = 0.88 + f.hover * 0.12; f.face.material.color.setRGB(c, c, c);
      f.beam.material.opacity = 0.18 * (1 - f.hover);
      f.border.material.emissive.setRGB(f.hover * 0.25, f.hover * 0.17, f.hover * 0.04);
    });
  }
}

export { THREE, mesh, rng, lerp, clamp, ease, shade, roundRect, canvasTex, toTex, cnv, fbm, normalFromHeight, colorize, plasterSet, tileSet, stoneSet, barkSet, paintedWoodSet, leafTexture, glowSprite, glowTex, RoundedBoxGeometry, ASSET };
