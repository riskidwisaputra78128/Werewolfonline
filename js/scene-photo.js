// =====================================================================
//  TEMA 4 · Realistis foto asli
//  Luar  : foto rumah asli (bisa diupload admin) + titik pintu yang bisa diklik
//  Dalam : foto 360° ruangan asli, bingkai CV menempel/mengambang di dinding
// =====================================================================
import { HouseWorld as RealWorld, THREE, lerp, clamp, ease, glowTex, canvasTex, ASSET } from "./scene.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export const eyebrow = "✦ CV interaktif · foto asli ✦";
// posisi pintu pada foto contoh (persen dari kiri & atas)
const DEFAULT_DOOR = { x: 50.4, y: 62.3 };

const ringTex = canvasTex(256, 256, (g, w, h) => {
  g.strokeStyle = "rgba(255,255,255,.95)"; g.lineWidth = 10; g.beginPath(); g.arc(w / 2, h / 2, w * 0.38, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 26; g.beginPath(); g.arc(w / 2, h / 2, w * 0.38, 0, Math.PI * 2); g.stroke();
});
ringTex.wrapS = ringTex.wrapT = THREE.ClampToEdgeWrapping;

export class HouseWorld extends RealWorld {
  async init() {
    const ph = this.data.settings?.photo || {};
    this.customHouse = !!ph.house; this.customRoom = !!ph.room;
    this.door = this.customHouse ? { x: +ph.doorX || 50, y: +ph.doorY || 70 } : DEFAULT_DOOR;
    const load = (src) => new Promise((res, rej) => this.texLoader.load(src, res, undefined, rej));
    const [house, room] = await Promise.all([
      load(ph.house || ASSET + "photo/rumah.jpg"),
      load(ph.room || ASSET + "photo/ruang-360.jpg"),
    ]);
    house.colorSpace = room.colorSpace = THREE.SRGBColorSpace;
    room.mapping = THREE.EquirectangularReflectionMapping;
    this.houseTex = house; this.roomTex = room;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envIn = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; pmrem.dispose();
    this.envOut = this.envIn;
    // ruang kustom: bingkai melingkar di sekitar kamera, bisa diputar 360°
    if (this.customRoom) { this.standPos.set(0, 1.6, 0); this.yawLimit = 99; }
    this.composer.passes[1].strength = 0.25;

    this.buildExterior();
    this.buildInterior();
    this.showWorld("outside");
    this.bindEvents();
    addEventListener("resize", () => this.fitPhoto());
    requestAnimationFrame(this.loop);
  }

  showWorld(which) {
    this.world = which;
    this.ext.visible = which === "outside"; this.int.visible = which === "inside";
    this.scene.environment = this.envIn; this.scene.environmentIntensity = 0.6;
    this.scene.background = which === "inside" ? this.roomTex : new THREE.Color("#0d0a14");
    this.scene.backgroundRotation.set(0, this.customRoom ? Math.PI / 2 + ((+this.data.settings.photo.roomYaw || 0) * Math.PI) / 180 : 0, 0);
    this.scene.fog = null;
    this.renderer.toneMapping = THREE.NoToneMapping; // foto sudah "jadi", jangan diproses ulang
    this.renderer.toneMappingExposure = 1;
    this.camera.fov = which === "outside" ? 45 : (innerWidth < innerHeight ? 78 : 62);
    this.baseFov = this.camera.fov;
    this.camera.updateProjectionMatrix();
  }

  // ---------------- luar: foto rumah ----------------
  buildExterior() {
    const g = (this.ext = new THREE.Group()); this.scene.add(g);
    this.photoGroup = new THREE.Group(); g.add(this.photoGroup);
    this.photo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.houseTex, toneMapped: false, transparent: true, opacity: 0 }));
    this.photoGroup.add(this.photo);
    // titik pintu
    this.doorMark = new THREE.Group(); this.photoGroup.add(this.doorMark);
    this.ring1 = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: "#ffe2a6", transparent: true, depthWrite: false, opacity: 0.9 }));
    this.ring2 = this.ring1.clone(); this.ring2.material = this.ring1.material.clone();
    this.doorGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: "#ffd27a", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
    this.doorMark.add(this.doorGlow, this.ring1, this.ring2);
    const hit = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    this.doorMark.add(hit); this.doorTargets = [hit];
    this.trees = []; this.smoke = []; this.lanternLights = [];
    this.fitPhoto();
  }
  fitPhoto() {
    if (!this.photo) return;
    const D = 10, aspect = innerWidth / innerHeight;
    const vh = 2 * D * Math.tan(THREE.MathUtils.degToRad(45 / 2)), vw = vh * aspect;
    const ia = this.houseTex.image.width / this.houseTex.image.height;
    let w, h; if (aspect > ia) { w = vw * 1.08; h = w / ia; } else { h = vh * 1.08; w = h * ia; }
    this.photo.scale.set(w, h, 1); this.photoGroup.position.z = -D;
    this.doorWorldLocal = new THREE.Vector3((this.door.x / 100 - 0.5) * w, (0.5 - this.door.y / 100) * h, 0.01);
    this.doorMark.position.copy(this.doorWorldLocal);
    const s = Math.max(0.55, Math.min(w, h) * 0.07); this.doorMark.scale.setScalar(s);
  }
  animateExterior(t) {
    const dh = this.doorHover || 0;
    const k1 = (t * 0.6) % 1, k2 = (t * 0.6 + 0.5) % 1;
    this.ring1.scale.setScalar(0.6 + k1 * 1.2); this.ring1.material.opacity = (1 - k1) * (0.7 + dh * 0.3);
    this.ring2.scale.setScalar(0.6 + k2 * 1.2); this.ring2.material.opacity = (1 - k2) * (0.7 + dh * 0.3);
    this.doorGlow.scale.setScalar(1.6 + dh * 0.8 + Math.sin(t * 2.5) * 0.15); this.doorGlow.material.opacity = 0.45 + dh * 0.4;
    // Ken Burns pelan + paralaks mouse
    if (this.mode === "outside" || this.mode === "intro") {
      const z = 1 + Math.sin(t * 0.08) * 0.025;
      this.photoGroup.scale.setScalar(this.introScale ?? z);
      this.photoGroup.position.x = lerp(this.photoGroup.position.x, -this.mouseN.x * 0.25, 0.05);
      this.photoGroup.position.y = lerp(this.photoGroup.position.y, -this.mouseN.y * 0.15, 0.05);
    }
  }

  // ---------------- dalam: foto 360° ----------------
  buildInterior() {
    const g = (this.int = new THREE.Group()); this.scene.add(g);
    this.dust = []; this.dustPts = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3)));
    g.add(new THREE.HemisphereLight("#fff4e6", "#5a4a3a", 1.2));
    const dl = new THREE.DirectionalLight("#fff1dc", 1.2); dl.position.set(2, 5, 4); g.add(dl);
    this.frameGroup = new THREE.Group(); g.add(this.frameGroup);
    this.buildFrames();
  }
  frameSlots() {
    if (!this.customRoom) return super.frameSlots();
    const n = Math.min(8, this.data.sections.length), R = 3.4, step = Math.min(45, 300 / Math.max(1, n - 1));
    return Array.from({ length: n }, (_, i) => {
      const a = THREE.MathUtils.degToRad((i - (n - 1) / 2) * step);
      return { p: [-Math.sin(a) * R, 1.55, -Math.cos(a) * R], ry: a };
    });
  }

  // ---------------- alur ----------------
  start() {
    this.mode = "intro"; this.introScale = 1.18;
    this.tween(2.2, (t) => { this.photo.material.opacity = Math.min(1, t * 1.6); this.introScale = lerp(1.18, 1, t); }, {
      easing: ease.out, onDone: () => { this.introScale = undefined; this.mode = "outside"; this.cb.onReady && this.cb.onReady(); },
    });
  }
  enter() {
    if (this.mode !== "outside") return;
    this.mode = "entering"; this.cb.onEnterStart && this.cb.onEnterStart();
    const door = this.doorMark.getWorldPosition(new THREE.Vector3());
    const p0 = this.camPos.clone(), l0 = this.camLook.clone();
    this.tween(1.9, (t) => {
      this.camPos.lerpVectors(p0, door.clone().multiplyScalar(0.72), ease.inOut(t));
      this.camLook.lerpVectors(l0, door, ease.out(Math.min(1, t * 1.8)));
      this.camera.fov = lerp(45, 30, t); this.camera.updateProjectionMatrix();
      this.doorGlow.material.opacity = lerp(0.6, 1, t); this.doorGlow.scale.setScalar(lerp(2, 7, t));
    }, { easing: (x) => x, tag: "cam", onDone: () => arrive() });
    this.after(1.25, () => this.cb.fade && this.cb.fade(1, 650));
    const arrive = () => {
      this.showWorld("inside");
      this.look.yaw = this.look.yawT = 0; this.look.pitch = this.look.pitchT = -0.03;
      this.camPos.copy(this.standPos);
      this.frames.forEach((f, i) => { f.pop = 0; f.popDelay = 0.4 + i * 0.1; }); this.popStart = this.time;
      this.cb.fade && this.cb.fade(0, 900);
      this.mode = "arriving";
      this.after(0.9, () => { this.mode = "inside"; this.cb.onEntered && this.cb.onEntered(); });
    };
  }
  exit() {
    if (this.mode !== "inside") return;
    this.mode = "exiting"; this.cb.onExitStart && this.cb.onExitStart();
    this.cb.fade && this.cb.fade(1, 600);
    this.after(0.65, () => {
      this.showWorld("outside");
      this.camPos.set(0, 0, 0); this.camLook.set(0, 0, -10);
      this.cb.fade && this.cb.fade(0, 800);
      this.after(0.8, () => { this.mode = "outside"; this.cb.onExited && this.cb.onExited(); });
    });
  }
  // fokus = putar + zoom (kamera tetap di titik foto agar perspektif foto 360° tidak rusak)
  focusFrame(index) {
    if (this.mode !== "inside") return;
    const f = this.frames.find((x) => x.index === index);
    const sec = f ? f.sec : this.data.sections[index];
    if (!f) { this.cb.onOpen && this.cb.onOpen(sec, index); return; }
    this.mode = "focus"; this.focused = f;
    const wp = f.group.getWorldPosition(new THREE.Vector3()), d = wp.clone().sub(this.standPos), dist = d.length();
    let yaw = Math.atan2(-d.x, -d.z); const pitch = Math.asin(clamp(d.y / dist, -1, 1));
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan((1.25 / 0.62) / dist));
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) * this.camera.aspect);
    if (innerWidth > 900) yaw -= hfov * 0.2; // bingkai di kiri, panel di kanan
    const L = this.look, y0 = L.yaw, p0 = L.pitch, f0 = this.camera.fov;
    while (yaw - y0 > Math.PI) yaw -= Math.PI * 2; while (yaw - y0 < -Math.PI) yaw += Math.PI * 2;
    this.focusFrom = { yaw: y0, pitch: p0 };
    this.tween(1.0, (t) => { L.yaw = lerp(y0, yaw, t); L.pitch = lerp(p0, pitch, t); this.camera.fov = lerp(f0, Math.min(this.baseFov, fov), t); this.camera.updateProjectionMatrix(); }, { easing: ease.inOut, tag: "cam" });
    this.after(0.6, () => this.cb.onOpen && this.cb.onOpen(sec, index));
  }
  unfocus(cb) {
    if (this.mode !== "focus") return;
    const L = this.look, y0 = L.yaw, p0 = L.pitch, f0 = this.camera.fov;
    L.yawT = y0; L.pitchT = clamp(p0, -0.35, 0.35); this.focused = null;
    this.tween(0.8, (t) => { L.pitch = lerp(p0, L.pitchT, t); this.camera.fov = lerp(f0, this.baseFov, t); this.camera.updateProjectionMatrix(); }, {
      easing: ease.inOut, tag: "cam", onDone: () => { this.mode = "inside"; cb && cb(); },
    });
  }

  loop() {
    requestAnimationFrame(this.loop);
    const raw = this.clock.getDelta(); if (!this.low) this.adapt(raw);
    const dt = Math.min(raw, 0.05); this.time += dt; const t = this.time;
    this.stepTweens(dt);
    if (this.world === "outside") {
      this.animateExterior(t);
      if (this.mode === "outside" || this.mode === "intro") { this.camPos.set(0, 0, 0); this.camLook.set(0, 0, -10); }
    } else {
      this.animateInterior(t, dt);
      const L = this.look;
      if (this.mode === "inside") {
        L.yaw = lerp(L.yaw, L.yawT - this.mouseN.x * 0.1, 0.07);
        L.pitch = lerp(L.pitch, L.pitchT + this.mouseN.y * 0.05, 0.07);
      }
      this.camPos.copy(this.standPos); this.idleLook(this.camLook);
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.updateHover();
    this.composer.render();
  }
  updateData(data) { this.data = data; this.buildFrames(); }
}
