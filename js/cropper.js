// =====================================================================
//  Editor foto sebelum upload: potong, zoom, putar, pilih ukuran + pratinjau
// =====================================================================
const RATIOS = { "1:1": 1, "4:3": 4 / 3, "16:9": 16 / 9, "3:4": 3 / 4, "2:1": 2 };
const SIZES = [["Kecil", 600], ["Sedang", 1000], ["Besar", 1600]];

function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => res({ img, url }); img.onerror = () => rej(new Error("File bukan gambar yang valid."));
    img.src = url;
  });
}

/**
 * openCropper(file, { ratio: "4:3"|"1:1"|"16:9"|"free", preview: "avatar"|"tile"|"wide"|"gallery"|"house", size: 1000, title })
 * -> Promise<string|null>  (dataURL JPEG, atau null jika dibatalkan)
 */
export async function openCropper(file, opt = {}) {
  const { img, url } = await loadImage(file);
  const st = { ratioKey: opt.ratio || "free", zoom: 1, ox: 0, oy: 0, rot: 0, size: opt.size || 1000, quality: 0.85 };
  const ratioOf = () => st.ratioKey === "free" || st.ratioKey === "asli" ? (st.rot % 180 ? img.height / img.width : img.width / img.height) : RATIOS[st.ratioKey];

  const wrap = document.createElement("div");
  wrap.className = "crop-ovl";
  wrap.innerHTML = `<div class="crop-box">
    <div class="crop-head"><b>✂️ ${opt.title || "Atur foto"}</b><span class="muted">Geser foto untuk memposisikan · scroll / slider untuk zoom</span></div>
    <div class="crop-main">
      <div class="crop-stage"><canvas></canvas></div>
      <aside class="crop-side">
        <div class="crop-prev-label">Pratinjau tampilan</div>
        <div class="crop-prev crop-prev-${opt.preview || "tile"}"><canvas></canvas><span class="cap">Contoh judul</span></div>
        <div class="crop-ctrl">
          <label>Bentuk potongan<div class="seg" data-g="ratio">
            ${(opt.ratios || ["asli", "1:1", "4:3", "16:9"]).map((k) => `<button data-v="${k}">${k === "asli" ? "Asli" : k}</button>`).join("")}
          </div></label>
          <label>Zoom <input type="range" min="1" max="4" step="0.01" value="1" data-zoom></label>
          <div class="row"><button class="btn small ghost" data-rot>⟳ Putar 90°</button><button class="btn small ghost" data-reset>↺ Reset</button></div>
          <label>Ukuran hasil<div class="seg" data-g="size">${SIZES.map(([n, v]) => `<button data-v="${v}">${n}<small>${v}px</small></button>`).join("")}</div></label>
          <div class="crop-info"></div>
        </div>
      </aside>
    </div>
    <div class="crop-foot"><button class="btn ghost" data-cancel>Batal</button><button class="btn primary" data-ok>✔ Pakai foto ini</button></div>
  </div>`;
  document.body.appendChild(wrap);
  const stage = wrap.querySelector(".crop-stage canvas"), sg = stage.getContext("2d");
  const prev = wrap.querySelector(".crop-prev canvas"), pg = prev.getContext("2d");
  if (opt.caption) wrap.querySelector(".crop-prev .cap").textContent = opt.caption;
  let W = 0, H = 0, fw = 0, fh = 0;

  const layout = () => {
    const box = wrap.querySelector(".crop-stage").getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio, 2);
    W = box.width; H = Math.max(260, Math.min(box.width * 0.75, innerHeight * 0.55));
    stage.width = W * dpr; stage.height = H * dpr; stage.style.height = H + "px"; sg.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = ratioOf(); fw = Math.min(W * 0.86, H * 0.86 * r); fh = fw / r;
    clampPos(); draw();
  };
  const dims = () => (st.rot % 180 ? [img.height, img.width] : [img.width, img.height]);
  const scale = () => { const [iw, ih] = dims(); return Math.max(fw / iw, fh / ih) * st.zoom; };
  function clampPos() {
    const [iw, ih] = dims(), s = scale();
    const mx = Math.max(0, (iw * s - fw) / 2), my = Math.max(0, (ih * s - fh) / 2);
    st.ox = Math.max(-mx, Math.min(mx, st.ox)); st.oy = Math.max(-my, Math.min(my, st.oy));
  }
  function paint(g, cx, cy, k) { // gambar foto pada konteks g, pusat bingkai di (cx,cy), faktor k
    g.save(); g.translate(cx + st.ox * k, cy + st.oy * k); g.rotate((st.rot * Math.PI) / 180);
    const s = scale() * k; g.drawImage(img, (-img.width * s) / 2, (-img.height * s) / 2, img.width * s, img.height * s); g.restore();
  }
  let raf = 0;
  function draw() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      sg.clearRect(0, 0, W, H); sg.fillStyle = "#1d1630"; sg.fillRect(0, 0, W, H);
      paint(sg, W / 2, H / 2, 1);
      const x = (W - fw) / 2, y = (H - fh) / 2;
      sg.fillStyle = "rgba(10,6,25,.62)"; sg.beginPath(); sg.rect(0, 0, W, H);
      if (opt.preview === "avatar") sg.ellipse(W / 2, H / 2, fw / 2, fh / 2, 0, 0, Math.PI * 2); else sg.rect(x, y, fw, fh);
      sg.fill("evenodd");
      sg.strokeStyle = "#fff"; sg.lineWidth = 2; sg.strokeRect(x, y, fw, fh);
      sg.strokeStyle = "rgba(255,255,255,.35)"; sg.lineWidth = 1;
      for (let i = 1; i < 3; i++) { sg.beginPath(); sg.moveTo(x + (fw * i) / 3, y); sg.lineTo(x + (fw * i) / 3, y + fh); sg.moveTo(x, y + (fh * i) / 3); sg.lineTo(x + fw, y + (fh * i) / 3); sg.stroke(); }
      // pratinjau kecil
      const pw = 360, ph = Math.round(pw / ratioOf()); prev.width = pw; prev.height = ph;
      paint(pg, pw / 2, ph / 2, pw / fw);
      prev.parentElement.style.aspectRatio = `${pw} / ${ph}`;
      const outW = Math.min(st.size, Math.round(fw / scale())), outH = Math.round(outW / ratioOf());
      const kb = Math.round((outW * outH * 0.22 * st.quality) / 1024 + 8);
      wrap.querySelector(".crop-info").innerHTML = `Hasil: <b>${outW} × ${outH}px</b> · perkiraan <b>±${kb} KB</b>${outW < st.size ? `<br><small>Resolusi foto asli membatasi ukuran.</small>` : ""}`;
    });
  }
  const setSeg = (g, v) => wrap.querySelectorAll(`[data-g="${g}"] button`).forEach((b) => b.classList.toggle("on", b.dataset.v == v));
  setSeg("ratio", st.ratioKey === "free" ? "asli" : st.ratioKey); setSeg("size", st.size);
  if (st.ratioKey === "free") st.ratioKey = "asli";

  // interaksi
  let drag = null;
  stage.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, ox: st.ox, oy: st.oy }; stage.setPointerCapture(e.pointerId); });
  stage.addEventListener("pointermove", (e) => { if (!drag) return; st.ox = drag.ox + e.clientX - drag.x; st.oy = drag.oy + e.clientY - drag.y; clampPos(); draw(); });
  stage.addEventListener("pointerup", () => (drag = null));
  stage.addEventListener("wheel", (e) => { e.preventDefault(); st.zoom = Math.max(1, Math.min(4, st.zoom * (e.deltaY < 0 ? 1.08 : 0.93))); wrap.querySelector("[data-zoom]").value = st.zoom; clampPos(); draw(); }, { passive: false });
  wrap.querySelector("[data-zoom]").addEventListener("input", (e) => { st.zoom = +e.target.value; clampPos(); draw(); });
  wrap.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const g = b.parentElement.dataset.g;
    if (g === "ratio") { st.ratioKey = b.dataset.v; setSeg("ratio", st.ratioKey); st.ox = st.oy = 0; layout(); }
    if (g === "size") { st.size = +b.dataset.v; setSeg("size", st.size); draw(); }
    if (b.hasAttribute("data-rot")) { st.rot = (st.rot + 90) % 360; st.ox = st.oy = 0; layout(); }
    if (b.hasAttribute("data-reset")) { st.rot = 0; st.zoom = 1; st.ox = st.oy = 0; wrap.querySelector("[data-zoom]").value = 1; layout(); }
  });
  addEventListener("resize", layout);
  requestAnimationFrame(layout);

  return new Promise((resolve) => {
    const done = (v) => { removeEventListener("resize", layout); URL.revokeObjectURL(url); wrap.remove(); resolve(v); };
    wrap.querySelector("[data-cancel]").onclick = () => done(null);
    wrap.querySelector("[data-ok]").onclick = () => {
      const outW = Math.min(st.size, Math.round(fw / scale())), outH = Math.round(outW / ratioOf());
      const c = document.createElement("canvas"); c.width = outW; c.height = outH;
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, outW, outH);
      g.imageSmoothingQuality = "high"; paint(g, outW / 2, outH / 2, outW / fw);
      done(c.toDataURL("image/jpeg", st.quality));
    };
  });
}
