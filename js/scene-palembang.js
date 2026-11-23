// =====================================================================
//  TEMA 5 · Kota Palembang
//  Rumah limas di tepi Sungai Musi, Jembatan Ampera, perahu ketek,
//  kota di seberang sungai saat senja. Interior kayu + songket.
// =====================================================================
import { HouseWorld as RealWorld, THREE, mesh, rng, lerp, canvasTex, tileSet, stoneSet, paintedWoodSet, glowSprite, glowTex, RoundedBoxGeometry } from "./scene.js";

export const brand = (name) => `Rumah Limas ${name}`;
export const eyebrow = "✦ Wong Kito Galo · Palembang ✦";

// motif songket (merah-emas) untuk dinding & karpet
function songketTex(size = 512, { bg = "#7a1420", gold = "#d8ad4f", accent = "#2b1a12", rows = 4 } = {}) {
  return canvasTex(size, size, (c, w, h) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    const cell = w / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < rows; x++) {
      const cx = (x + 0.5) * cell, cy = (y + 0.5) * cell, r = cell * 0.42;
      c.fillStyle = gold; c.beginPath(); c.moveTo(cx, cy - r); c.lineTo(cx + r, cy); c.lineTo(cx, cy + r); c.lineTo(cx - r, cy); c.closePath(); c.fill();
      c.fillStyle = bg; c.beginPath(); c.moveTo(cx, cy - r * 0.72); c.lineTo(cx + r * 0.72, cy); c.lineTo(cx, cy + r * 0.72); c.lineTo(cx - r * 0.72, cy); c.closePath(); c.fill();
      c.fillStyle = gold; c.beginPath(); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, rr = k % 2 ? r * 0.16 : r * 0.38; c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } c.fill();
      c.fillStyle = accent; c.beginPath(); c.arc(cx, cy, r * 0.08, 0, 7); c.fill();
      c.fillStyle = gold; for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { c.beginPath(); c.arc(x * cell + (dx + 1) * cell / 2, y * cell + (dy + 1) * cell / 2, cell * 0.035, 0, 7); c.fill(); }
    }
    c.strokeStyle = gold; c.lineWidth = 3;
    for (let y = 0; y <= rows; y++) { c.beginPath(); c.moveTo(0, y * cell); c.lineTo(w, y * cell); c.stroke(); }
    // serat kain
    const img = c.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = 0.88 + ((i / 4) % 2 ? 0.08 : 0) + Math.random() * 0.06; d[i] *= n; d[i + 1] *= n; d[i + 2] *= n; }
    c.putImageData(img, 0, 0);
  });
}
function frondTexture() {
  const t = canvasTex(128, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = "#5b6b2a"; c.lineWidth = 4; c.beginPath(); c.moveTo(w / 2, h); c.lineTo(w / 2, 4); c.stroke();
    for (let y = 20; y < h - 10; y += 9) {
      const k = 1 - y / h, L = (w / 2 - 6) * (0.35 + 0.65 * Math.sin(k * Math.PI));
      c.strokeStyle = `hsl(${78 + Math.random() * 18}, ${45 + Math.random() * 15}%, ${26 + Math.random() * 12}%)`; c.lineWidth = 5;
      c.beginPath(); c.moveTo(w / 2, y); c.quadraticCurveTo(w / 2 - L * 0.6, y + 8, w / 2 - L, y + 22); c.stroke();
      c.beginPath(); c.moveTo(w / 2, y); c.quadraticCurveTo(w / 2 + L * 0.6, y + 8, w / 2 + L, y + 22); c.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
function windowsTex(seed) {
  const R = rng(seed);
  return canvasTex(128, 256, (c, w, h) => {
    c.fillStyle = "#000"; c.fillRect(0, 0, w, h);
    for (let y = 8; y < h - 8; y += 18) for (let x = 8; x < w - 8; x += 16) {
      if (R() < 0.45) { c.fillStyle = R() < 0.7 ? "#ffcf86" : "#fff1d0"; c.fillRect(x, y, 9, 10); }
    }
  });
}

export class HouseWorld extends RealWorld {
  get hdrFile() { return "venice_sunset_1k.hdr"; }
  get doorY() { return 1.37; }
  get orbitBase() { return 0.15; }
  get lookTarget() { return (this._lt ||= new THREE.Vector3(-5, 2.6, -3)); }

  showWorld(which) {
    super.showWorld(which);
    if (which === "outside") {
      this.scene.background = null;
      this.scene.fog = this.fog;
      this.renderer.toneMappingExposure = 0.75;
    } else { this.scene.fog = null; }
  }

  grassFilter(x, z) {
    if (x < -3.2) return false; // sungai
    if (Math.abs(x) < 4.6 && z > -3.8 && z < 3.4) return false; // kolong rumah
    if (Math.abs(x) < 1.6 && z > 3 && z < 15) return false; // tangga & jalan
    return true;
  }

  signTexture(name) {
    return canvasTex(768, 300, (g, w, h) => {
      g.textAlign = "center"; g.textBaseline = "middle";
      g.font = "600 38px Fredoka, Nunito, sans-serif"; g.fillStyle = "rgba(52,30,14,.85)"; g.fillText("Selamat datang di", w / 2, 82);
      g.font = "700 74px Fredoka, Nunito, sans-serif"; g.fillStyle = "#3a2210"; g.fillText(`Rumah Limas ${name}`, w / 2, 186, w - 90);
    });
  }

  // ================================================================
  buildExterior() {
    const g = (this.ext = new THREE.Group()); this.scene.add(g);
    const R = rng(29);
    this.fog = new THREE.Fog("#d99a76", 90, 340);
    // langit senja Palembang (gradasi + cahaya matahari)
    const sunD = this.sunDir.clone().setY(0.08).normalize();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color("#25366b") }, mid: { value: new THREE.Color("#c86f5c") }, hor: { value: new THREE.Color("#ffbf86") }, sun: { value: new THREE.Vector3(-sunD.x, sunD.y, -sunD.z) } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ",
      fragmentShader: `uniform vec3 top, mid, hor, sun; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, h)); c = mix(c, top, smoothstep(0.18, 0.75, h));
          c = mix(c, hor * 0.8, smoothstep(0.0, -0.2, h));
          float s = max(dot(normalize(vP), normalize(sun)), 0.0); c += vec3(1.0, 0.7, 0.4) * (pow(s, 600.0) * 6.0 + pow(s, 12.0) * 0.45);
          gl_FragColor = vec4(c, 1.0); }`,
    }));
    sky.renderOrder = -10; g.add(sky);
    this.trees = []; this.smoke = []; this.lanternLights = [];

    const sun = new THREE.DirectionalLight("#ffc48a", 2.2);
    sun.position.copy(this.sunDir).multiplyScalar(45); sun.castShadow = true;
    sun.shadow.mapSize.set(this.mobile ? 1024 : 2048, this.mobile ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 120 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; g.add(sun);

    // ---- Sungai Musi ----
    const wn = this.tex("waternormals.jpg", { srgb: false, repeat: [24, 24] });
    this.waterMat = new THREE.MeshStandardMaterial({ color: "#2f3c3a", roughness: 0.1, metalness: 0.1, normalMap: wn, normalScale: new THREE.Vector2(0.55, 0.55), envMapIntensity: 1.2 });
    const water = mesh(new THREE.PlaneGeometry(700, 700), this.waterMat, -60, -0.55, -60, g, false); water.rotation.x = -Math.PI / 2; water.receiveShadow = true;

    // ---- tepian (sisi rumah) ----
    const grassTex = this.tex("grass_col.jpg", { repeat: [26, 60] });
    const bank = mesh(new THREE.PlaneGeometry(100, 260), new THREE.MeshStandardMaterial({ map: grassTex, color: "#b7b783", roughness: 1 }), 46, 0, -40, g, false);
    bank.rotation.x = -Math.PI / 2; bank.receiveShadow = true;
    const stone = stoneSet(61, 22, ["#8d877c", "#7f796f", "#99938a", "#6e695f"]);
    mesh(new THREE.BoxGeometry(0.9, 1.4, 260), this.setMat(stone, [80, 0.6]), -4.45, -0.65, -40, g);
    mesh(new THREE.BoxGeometry(0.3, 0.6, 260), this.std("#d9d2c4", { roughness: 0.8 }), -4.2, 0.3, -40, g); // pagar talud
    this.buildGrass(g, R);

    // ---- seberang sungai: kota ----
    const far = mesh(new THREE.PlaneGeometry(300, 420), this.std("#4b4a35", { roughness: 1 }), -224, -0.2, -60, g, false); far.rotation.x = -Math.PI / 2;
    mesh(new THREE.BoxGeometry(0.9, 1.2, 420), this.setMat(stone, [120, 0.6]), -74, -0.6, -60, g, false);
    this.buildCity(g, R);

    // ---- Jembatan Ampera ----
    this.buildAmpera(g);

    // ---- rumah limas ----
    this.buildLimas(g);

    // ---- dermaga kayu & perahu ketek ----
    const plank = this.woodMat([0.5, 4], "#7d5a3c");
    mesh(new THREE.BoxGeometry(7, 0.14, 1.8), plank, -8, 0.05, 1.5, g);
    for (let x = -11; x <= -5; x += 2) for (const z of [0.7, 2.3]) mesh(new THREE.CylinderGeometry(0.09, 0.1, 1.6, 8), plank, x, -0.6, z, g);
    this.boats = [];
    [[-8.5, 3.6, 0, 0], [-18, -20, 2.2, 1], [-32, 10, -1.8, 2], [-48, -60, 2.6, 0], [-60, -10, -2.0, 1]].forEach(([x, z, v, c]) => {
      const b = this.makeKetek(c); b.position.set(x, -0.45, z); b.userData = { v, ph: R() * 6, x }; g.add(b); this.boats.push(b);
    });

    // ---- pepohonan tropis & kelapa ----
    this.frondMat = new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.4, alphaToCoverage: !this.low, side: THREE.DoubleSide, roughness: 0.8 });
    [[9, -3, 7.5], [11.5, 4, 8.5], [-1.8, -9, 7], [6, 12, 6.5], [15, -8, 8]].forEach(([x, z, h]) => this.makePalm(g, x, z, h, R));
    [[13, 0, 1.0, 0], [8, -9.5, 1.1, 1], [16, 9, 0.9, 0], [20, -2, 1.2, 1], [3, -13, 1.0, 0]].forEach(([x, z, s, t]) => this.makeTree(g, x, z, s, t, R));
    [[3.8, 4.2], [-2.6, 5.4], [5.6, 2], [-2.8, 9]].forEach(([x, z], i) => this.makeBush(g, x, z, 0.75, R, i));

    // jalan setapak & lampu
    const pathMat = this.setMat(stoneSet(41, 18), [1, 1], { roughness: 0.95 });
    for (let i = 0; i < 8; i++) { const s = mesh(new THREE.CylinderGeometry(0.5, 0.52, 0.08, 9), pathMat, Math.sin(i * 0.5) * 0.35, 0.03, 7.3 + i * 0.95, g); s.scale.set(0.9 + R() * 0.3, 1, 0.8 + R() * 0.25); s.castShadow = false; }
    const iron = this.std("#1c1a19", { metalness: 0.85, roughness: 0.45 });
    this.lanternGlass = this.std("#ffe2a8", { emissive: "#ffb460", emissiveIntensity: 3, roughness: 0.2 });
    [[-1.7, 8.2], [1.7, 8.2], [-1.7, 12], [1.7, 12]].forEach(([x, z], i) => {
      const L = new THREE.Group(); L.position.set(x, 0, z); g.add(L);
      mesh(new THREE.CylinderGeometry(0.035, 0.06, 1.7, 10), iron, 0, 0.85, 0, L);
      mesh(new THREE.BoxGeometry(0.2, 0.28, 0.2), this.lanternGlass, 0, 1.88, 0, L, false);
      const cap = mesh(new THREE.ConeGeometry(0.19, 0.18, 4), iron, 0, 2.11, 0, L); cap.rotation.y = Math.PI / 4;
      const gl = glowSprite("#ffb85c", 0.9, 0.45); gl.position.y = 1.88; L.add(gl);
      if (i < 2) { const pl = new THREE.PointLight("#ffb35c", 2.5, 6, 2); pl.position.y = 1.88; L.add(pl); this.lanternLights.push(pl); }
    });

    // tiang bendera merah putih
    mesh(new THREE.CylinderGeometry(0.04, 0.05, 7, 10), this.std("#d9d9d9", { metalness: 0.8, roughness: 0.3 }), 6.5, 3.5, 9, g);
    const flagTex = canvasTex(64, 64, (c, w, h) => { c.fillStyle = "#d61f26"; c.fillRect(0, 0, w, h / 2); c.fillStyle = "#f7f7f7"; c.fillRect(0, h / 2, w, h / 2); });
    this.flag = mesh(new THREE.PlaneGeometry(1.5, 1.0, 12, 3), this.std("#ffffff", { map: flagTex, side: THREE.DoubleSide, roughness: 0.9 }), 7.27, 6.45, 9, g);
    this.flagBase = this.flag.geometry.attributes.position.array.slice();

    // papan nama
    const sign = new THREE.Group(); sign.position.set(3.4, 0, 12.2); sign.rotation.y = -0.4; g.add(sign);
    const post = this.woodMat([0.3, 1], "#6e4a32");
    mesh(new THREE.BoxGeometry(0.12, 1.9, 0.12), post, -1.1, 0.95, 0, sign); mesh(new THREE.BoxGeometry(0.12, 1.9, 0.12), post, 1.1, 0.95, 0, sign);
    mesh(new THREE.BoxGeometry(2.6, 1.05, 0.08), this.woodMat([1, 0.5], "#b08a66"), 0, 1.42, 0, sign);
    this.signFace = new THREE.Mesh(new THREE.PlaneGeometry(2.46, 0.92), new THREE.MeshStandardMaterial({ map: this.signTexture(this.data.profile.name || "Saya"), roughness: 0.85, transparent: true }));
    this.signFace.position.set(0, 1.42, 0.041); sign.add(this.signFace);

    // kunang-kunang senja
    const FFN = 120; this.ffData = []; const fpos = new Float32Array(FFN * 3);
    for (let i = 0; i < FFN; i++) this.ffData.push({ x: (R() - 0.3) * 30, y: 0.4 + R() * 4, z: (R() - 0.5) * 30, p: R() * 6.28, s: 0.2 + R() * 0.4 });
    const fg = new THREE.BufferGeometry(); fg.setAttribute("position", new THREE.BufferAttribute(fpos, 3));
    this.fireflies = new THREE.Points(fg, new THREE.PointsMaterial({ map: glowTex, color: new THREE.Color(1.8, 1.4, 0.7), size: 0.14, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(this.fireflies);
  }

  buildCity(g, R) {
    const N = this.low ? 40 : 90;
    const wins = [windowsTex(3), windowsTex(9)];
    const mats = wins.map((t, i) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; return new THREE.MeshStandardMaterial({ color: ["#9a8f80", "#8a8f96"][i], roughness: 0.85, emissive: "#ffffff", emissiveMap: t, emissiveIntensity: 1.4 }); });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    mats.forEach((m, k) => {
      const im = new THREE.InstancedMesh(geo, m, N); const dm = new THREE.Object3D(); let n = 0;
      for (let i = 0; i < N; i++) {
        const x = -80 - R() * 90, z = -200 + R() * 220; if (Math.abs(x + 92) < 9 && Math.abs(z + 30) < 9) continue; // ruang masjid
        const h = 2.5 + R() * R() * 24 * (x > -100 ? 0.6 : 1);
        dm.position.set(x, h / 2 - 0.2, z); dm.scale.set(3 + R() * 6, h, 3 + R() * 6); dm.rotation.y = (R() - 0.5) * 0.3; dm.updateMatrix();
        im.setMatrixAt(n++, dm.matrix);
      }
      im.count = n; g.add(im);
    });
    // Masjid Agung (kubah & menara)
    const ms = new THREE.Group(); ms.position.set(-92, -0.2, -30); g.add(ms);
    const wall = this.std("#efe6d2", { roughness: 0.8 }), dome = this.std("#3d7f6a", { roughness: 0.4, metalness: 0.3 });
    mesh(new THREE.BoxGeometry(10, 5, 10), wall, 0, 2.5, 0, ms);
    mesh(new THREE.CylinderGeometry(3.4, 3.6, 1.5, 32), wall, 0, 5.7, 0, ms);
    mesh(new THREE.SphereGeometry(3.4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), dome, 0, 6.4, 0, ms);
    mesh(new THREE.ConeGeometry(0.25, 1.4, 12), this.std("#d8ad4f", { metalness: 1, roughness: 0.3 }), 0, 10.4, 0, ms);
    [[-6, -6], [6, -6], [-6, 6], [6, 6]].forEach(([x, z]) => { mesh(new THREE.CylinderGeometry(0.45, 0.55, 12, 14), wall, x, 6, z, ms); mesh(new THREE.ConeGeometry(0.6, 2, 14), dome, x, 13, z, ms); });
  }

  buildAmpera(g) {
    const B = new THREE.Group(); B.position.set(0, 0, -72); g.add(B);
    const red = this.std("#b01e28", { roughness: 0.45, metalness: 0.35 }), conc = this.std("#a8a29a", { roughness: 0.9 }), asph = this.std("#3a3a3c", { roughness: 0.9 });
    const deckY = 7, x0 = -130, x1 = 25;
    // lantai jembatan
    mesh(new THREE.BoxGeometry(x1 - x0, 0.5, 5), asph, (x0 + x1) / 2, deckY, 0, B);
    for (const z of [-2.6, 2.6]) mesh(new THREE.BoxGeometry(x1 - x0, 1.1, 0.35), red, (x0 + x1) / 2, deckY - 0.4, z, B);
    for (const z of [-2.5, 2.5]) mesh(new THREE.BoxGeometry(x1 - x0, 0.08, 0.08), conc, (x0 + x1) / 2, deckY + 0.9, z, B, false);
    // pilar
    for (let x = x0 + 6; x < x1; x += 11) { if (x > -70 && x < -36) continue; mesh(new THREE.CylinderGeometry(0.7, 0.8, deckY + 0.6, 12), conc, x, (deckY - 0.6) / 2 - 0.3, 0, B); }
    // dua menara merah
    const towers = [-64, -42], TH = 30;
    towers.forEach((x) => {
      for (const z of [-2.3, 2.3]) {
        mesh(new THREE.BoxGeometry(1.5, TH, 1.3), red, x, TH / 2 - 0.6, z, B);
        mesh(new THREE.BoxGeometry(2.4, 1.6, 2.2), conc, x, -0.2, z, B); // kaki
      }
      for (const y of [deckY - 1.2, 15, 22, TH - 1.4]) mesh(new THREE.BoxGeometry(1.5, 1.3, 5.9), red, x, y, 0, B);
      // pengaku diagonal
      for (const z of [-2.3, 2.3]) { void z; }
      for (const y of [18.5]) { const d = mesh(new THREE.BoxGeometry(0.35, 8.6, 0.35), red, x, y, 0, B); d.rotation.x = 0.68; const d2 = d.clone(); d2.rotation.x = -0.68; B.add(d2); }
    });
    // balok atas penghubung + kabel penggantung
    for (const z of [-2.3, 2.3]) {
      mesh(new THREE.BoxGeometry(towers[1] - towers[0] + 1.5, 1.6, 0.9), red, (towers[0] + towers[1]) / 2, TH - 1.4, z, B);
      for (let i = 1; i < 8; i++) { const x = lerp(towers[0], towers[1], i / 8); mesh(new THREE.BoxGeometry(0.08, TH - deckY - 2.2, 0.08), red, x, (TH + deckY) / 2 - 1.1, z, B, false); }
    }
    // lampu jembatan menyala
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.3, 1.3) });
    const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), lampMat, 64); const dm = new THREE.Object3D(); let n = 0;
    for (let x = x0 + 2; x < x1 && n < 60; x += 4.2) for (const z of [-2.7, 2.7]) { dm.position.set(x, deckY + 1.3, z); dm.updateMatrix(); lamps.setMatrixAt(n++, dm.matrix); }
    lamps.count = n; B.add(lamps);
    towers.forEach((x) => { const s = glowSprite("#ff4a3a", 2.2, 0.9); s.position.set(x, TH + 0.2, 0); B.add(s); mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.6, 0.4) }), x, TH + 0.2, 0, B, false); });
    // pantulan cahaya lampu di air
    for (let x = -72; x < -6; x += 6) { const s = glowSprite("#ffb35c", 3.5, 0.2); s.position.set(x, -0.3, 6); s.scale.set(1.4, 9, 1); B.add(s); }
  }

  makeKetek(colorIdx) {
    const b = new THREE.Group();
    const hull = new THREE.Shape(); hull.moveTo(-0.6, 0); hull.lineTo(0.6, 0); hull.lineTo(0.75, 0.45); hull.lineTo(-0.75, 0.45); hull.closePath();
    const hm = this.woodMat([0.5, 2], ["#5d7f3a", "#2f5d8a", "#9a3a2a"][colorIdx]);
    const h = mesh(new THREE.ExtrudeGeometry(hull, { depth: 4.2, bevelEnabled: false }), hm, 0, 0, -2.1, b);
    void h;
    for (const s of [-1, 1]) { const c = mesh(new THREE.ConeGeometry(0.68, 1.1, 4), hm, 0, 0.22, s * 2.6, b); c.rotation.set(s * Math.PI / 2, Math.PI / 4, 0); c.scale.set(1.05, 1, 0.6); }
    mesh(new THREE.BoxGeometry(1.1, 0.06, 1.8), this.woodMat([0.4, 0.5], "#7a5638"), 0, 1.3, -0.3, b);
    for (const [x, z] of [[-0.5, -1.1], [0.5, -1.1], [-0.5, 0.5], [0.5, 0.5]]) mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), this.std("#3b2a1c"), x, 0.85, z, b);
    const lamp = mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 1) }), 0, 1.2, 1.4, b, false); void lamp;
    return b;
  }

  makePalm(g, x, z, h, R) {
    const p = new THREE.Group(); p.position.set(x, 0, z); g.add(p);
    const bend = (R() - 0.5) * 1.2, segs = 8;
    const tg = new THREE.CylinderGeometry(0.13, 0.22, h, 10, segs);
    { const a = tg.attributes.position; for (let i = 0; i < a.count; i++) { const k = a.getY(i) / h + 0.5; a.setX(i, a.getX(i) + bend * k * k); } tg.computeVertexNormals(); }
    if (!this._palmBark) { const t = this.tex("wood_col.jpg", { repeat: [1, 6] }); this._palmBark = new THREE.MeshStandardMaterial({ map: t, color: "#9c8a72", roughness: 1 }); }
    mesh(tg, this._palmBark, 0, h / 2, 0, p);
    const crown = new THREE.Group(); crown.position.set(bend, h, 0); p.add(crown);
    for (let i = 0; i < 11; i++) {
      const fg = new THREE.PlaneGeometry(0.9, 3.3, 1, 6); fg.translate(0, 1.65, 0);
      const a = fg.attributes.position; for (let k = 0; k < a.count; k++) { const y = a.getY(k); a.setZ(k, -Math.pow(y / 3.3, 2) * 1.4); }
      fg.computeVertexNormals();
      const f = mesh(fg, this.frondMat, 0, 0, 0, crown); f.rotation.set(-0.5 - R() * 0.4, (i / 11) * Math.PI * 2 + R() * 0.3, 0, "YXZ");
      f.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.frondMat.map, alphaTest: 0.4 });
    }
    for (let i = 0; i < 4; i++) mesh(new THREE.SphereGeometry(0.15, 10, 8), this.std("#5d6a2a"), Math.cos(i * 1.6) * 0.22, -0.15, Math.sin(i * 1.6) * 0.22, crown);
    p.userData.sway = R() * 6; this.trees.push(p);
  }

  buildLimas(g) {
    const H = (this.house = new THREE.Group()); g.add(H);
    const FY = 1.92; // tinggi lantai panggung
    const darkWood = this.woodMat([1, 1], "#6e4529"), postM = this.woodMat([0.3, 1.5], "#4e3220");
    const wallV = this.woodMat([5, 1], "#8a5a36", { roughness: 0.75 });
    this._trim = this.setMat(paintedWoodSet("#d8ad4f", 41), [1, 1], { metalness: 0.5, roughness: 0.35 });
    this._shutter = darkWood;
    this._glass = new THREE.MeshPhysicalMaterial({ color: "#ffd59a", emissive: "#ffa64d", emissiveIntensity: 1.2, roughness: 0.1 });
    const red = this.std("#8b1a1a", { roughness: 0.6 }), gold = this.std("#c9a14a", { metalness: 0.9, roughness: 0.3 });
    const songket = new THREE.MeshStandardMaterial({ map: songketTex(256, { rows: 2 }), roughness: 0.55, metalness: 0.15 });
    songket.map.repeat.set(16, 1);

    // tiang panggung
    for (const x of [-3.6, -1.2, 1.2, 3.6]) for (const z of [-3.2, -1.1, 1.0, 2.6]) mesh(new THREE.CylinderGeometry(0.15, 0.17, FY, 10), postM, x, FY / 2, z, H);
    for (const x of [-3.6, -1.2, 1.2, 3.6]) for (const z of [-3.2, -1.1, 1.0, 2.6]) mesh(new THREE.BoxGeometry(0.5, 0.25, 0.5), this.setMat(stoneSet(11), [0.5, 0.2]), x, 0.12, z, H);
    // lantai panggung + list songket
    mesh(new THREE.BoxGeometry(8.4, 0.25, 6.7), darkWood, 0, FY - 0.12, -0.3, H);
    mesh(new THREE.BoxGeometry(8.5, 0.22, 0.05), songket, 0, FY - 0.12, 3.06, H, false);
    // badan rumah (dinding papan)
    mesh(new THREE.BoxGeometry(7.6, 3.0, 6.1), [wallV, wallV, wallV, wallV, wallV, wallV], 0, FY + 1.5, -0.3, H);
    // pilar & list emas di sudut, pita songket di atas dinding
    for (const x of [-3.8, 3.8]) for (const z of [-3.35, 2.75]) mesh(new THREE.BoxGeometry(0.22, 3.0, 0.22), darkWood, x, FY + 1.5, z, H);
    mesh(new THREE.BoxGeometry(7.7, 0.45, 0.04), songket, 0, FY + 2.75, 2.78, H, false);
    for (const x of [-3.83, 3.83]) { const s = mesh(new THREE.BoxGeometry(0.04, 0.45, 6.2), songket, x, FY + 2.75, -0.3, H, false); void s; }
    mesh(new THREE.BoxGeometry(7.8, 0.08, 0.08), gold, 0, FY + 2.5, 2.8, H, false);

    // atap limas bertingkat (genteng)
    const tiles = tileSet({ cols: 8, rows: 10, palette: ["#8f3b26", "#9e4630", "#7f3220", "#a85238"], seed: 77 });
    const roofM = this.setMat(tiles, [6, 3], { roughness: 0.75, side: THREE.DoubleSide });
    const skirt = new THREE.CylinderGeometry(4.9, 6.4, 0.9, 4, 1, true); skirt.rotateY(Math.PI / 4);
    const sk = mesh(skirt, roofM, 0, FY + 3.25, -0.3, H); sk.scale.set(1.0, 1, 0.86);
    const pyr = new THREE.ConeGeometry(5.0, 3.9, 4, 1, true); pyr.rotateY(Math.PI / 4);
    const py = mesh(pyr, roofM, 0, FY + 3.7 + 1.95, -0.3, H); py.scale.set(1.0, 1, 0.84);
    mesh(new THREE.BoxGeometry(7.0, 0.3, 6.0), darkWood, 0, FY + 3.15, -0.3, H); // plafon
    // simbar & mahkota emas di puncak
    mesh(new THREE.ConeGeometry(0.12, 1.0, 8), gold, 0, FY + 8.0, -0.3, H);
    for (const s of [-1, 1]) { const horn = mesh(new THREE.TorusGeometry(0.35, 0.05, 6, 16, Math.PI * 0.8), gold, s * 0.35, FY + 7.55, -0.3, H); horn.rotation.z = s > 0 ? -0.2 : Math.PI + 0.2; }
    for (const [x, z] of [[-3.55, 2.7], [3.55, 2.7], [-3.55, -3.3], [3.55, -3.3]]) { const t = mesh(new THREE.ConeGeometry(0.07, 0.6, 6), gold, x * 1.2, FY + 3.85, z * 1.2 - 0.05, H); t.rotation.z = x > 0 ? -0.6 : 0.6; }

    // jendela kayu (bisa terang dari dalam)
    [[-2.4, 2.78, 0], [2.4, 2.78, 0], [-3.82, 0.6, -Math.PI / 2], [-3.82, -1.8, -Math.PI / 2], [3.82, -1.0, Math.PI / 2]].forEach(([x, z, ry]) => {
      const w = new THREE.Group(); w.position.set(x, FY + 1.55, z); w.rotation.y = ry; H.add(w);
      mesh(new THREE.BoxGeometry(1.1, 1.5, 0.1), darkWood, 0, 0, 0, w);
      mesh(new THREE.PlaneGeometry(0.9, 1.3), this._glass, 0, 0, 0.055, w, false);
      for (const xx of [-0.3, 0, 0.3]) mesh(new THREE.BoxGeometry(0.05, 1.3, 0.04), darkWood, xx, 0, 0.08, w, false);
      for (const s of [-1, 1]) { const sh = mesh(new THREE.BoxGeometry(0.5, 1.45, 0.05), darkWood, s * 0.82, 0, 0.12, w); sh.rotation.y = s * 0.5; }
      mesh(new THREE.BoxGeometry(1.25, 0.25, 0.06), songket, 0, 0.9, 0.06, w, false);
    });

    // serambi (garang) + pagar + tangga
    mesh(new THREE.BoxGeometry(4.4, 0.2, 1.7), darkWood, 0, FY - 0.1, 3.65, H);
    for (const x of [-2.1, 2.1]) {
      mesh(new THREE.BoxGeometry(0.1, 0.9, 1.7), darkWood, x, FY + 0.45, 3.65, H);
      mesh(new THREE.BoxGeometry(0.16, 0.08, 1.75), gold, x, FY + 0.92, 3.65, H, false);
      mesh(new THREE.CylinderGeometry(0.1, 0.11, 2.9, 10), darkWood, x, FY + 1.45, 4.4, H);
    }
    mesh(new THREE.BoxGeometry(4.8, 0.2, 2.2), roofM, 0, FY + 2.95, 3.8, H).rotation.x = 0.25; // kanopi serambi
    for (let i = 0; i < 8; i++) { const y = FY - 0.24 - i * 0.24, z = 4.6 + i * 0.3; mesh(new THREE.BoxGeometry(1.8, 0.08, 0.32), darkWood, 0, y, z, H); }
    for (const x of [-0.95, 0.95]) { const rail = mesh(new THREE.BoxGeometry(0.08, 0.08, 3.1), gold, x, FY + 0.15, 5.6, H, false); rail.rotation.x = 0.66; mesh(new THREE.BoxGeometry(0.1, 2.1, 0.1), darkWood, x, 1.05, 6.85, H); }

    // pintu kayu ukir (berengsel kiri)
    const D = 1.3, DH = 2.25, r = D / 2;
    mesh(new THREE.BoxGeometry(D + 0.5, DH + 0.3, 0.16), gold, 0, FY + DH / 2 + 0.05, 2.76, H);
    this.doorwayMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#1c120a") });
    this.doorway = mesh(new THREE.PlaneGeometry(D, DH), this.doorwayMat, 0, FY + DH / 2, 2.85, H, false);
    this.doorPivot = new THREE.Group(); this.doorPivot.position.set(-r, FY, 2.9); H.add(this.doorPivot);
    const doorM = this.woodMat([0.6, 1], "#7a4b2c", { emissive: new THREE.Color(0, 0, 0) });
    const door = mesh(new THREE.BoxGeometry(D - 0.04, DH, 0.08), doorM, r, DH / 2, 0, this.doorPivot);
    this.doorMesh = door;
    const carve = new THREE.MeshStandardMaterial({ map: songketTex(256, { bg: "#5a2e14", gold: "#c9a14a", rows: 2 }), roughness: 0.5 });
    mesh(new THREE.PlaneGeometry(0.9, 0.9), carve, r, DH * 0.7, 0.045, this.doorPivot, false);
    mesh(new THREE.PlaneGeometry(0.9, 0.6), carve, r, DH * 0.25, 0.045, this.doorPivot, false);
    mesh(new THREE.SphereGeometry(0.05, 14, 10), gold, r + 0.48, DH * 0.48, 0.08, this.doorPivot);
    // lampu gantung serambi
    for (const x of [-1.4, 1.4]) { mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.5, 4), gold, x, FY + 2.55, 3.9, H, false); mesh(new THREE.SphereGeometry(0.13, 14, 10), this.lanternGlass || this.std("#ffe2a8", { emissive: "#ffb460", emissiveIntensity: 3 }), x, FY + 2.25, 3.9, H, false); }
    this.doorLight = new THREE.PointLight("#ffcf85", 2.5, 8, 2); this.doorLight.position.set(0, FY + 2.2, 3.8); H.add(this.doorLight);
    this.doorGlow = glowSprite("#ffd890", 2.4, 0.18); this.doorGlow.position.set(0, FY + 1.1, 3.0); H.add(this.doorGlow);
    this.doorTargets = [door, this.doorway, ...this.doorPivot.children];
  }

  interiorStyle() {
    const wallMat = this.woodMat([4, 1.4], "#8a5a36", { roughness: 0.7 });
    const wainTex = songketTex(512, { rows: 2 }); wainTex.repeat.set(8, 1);
    const wain = new THREE.MeshStandardMaterial({ map: wainTex, roughness: 0.5, metalness: 0.2 });
    const railM = this.std("#c9a14a", { metalness: 0.9, roughness: 0.3 });
    const rugTex = songketTex(1024, { bg: "#6a1220", gold: "#d8ad4f", rows: 6 });
    return { wallMat, wain, railM, rugTex };
  }

  animateExterior(t) {
    super.animateExterior(t);
    if (this.waterMat.normalMap) { this.waterMat.normalMap.offset.x = t * 0.004; this.waterMat.normalMap.offset.y = t * 0.012; }
    this.boats.forEach((b, i) => {
      const u = b.userData;
      if (u.v) { b.position.z += u.v * 0.016; if (b.position.z > 60) b.position.z = -170; if (b.position.z < -170) b.position.z = 60; b.rotation.y = u.v > 0 ? 0 : Math.PI; }
      b.position.y = -0.45 + Math.sin(t * 1.4 + u.ph) * 0.05; b.rotation.z = Math.sin(t * 1.1 + u.ph) * 0.03; b.rotation.x = Math.sin(t * 0.9 + i) * 0.02;
    });
  }
}
