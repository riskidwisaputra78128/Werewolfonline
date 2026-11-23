import { isDemo, loadData, saveData, login, logout, onAdmin, imageToDataURL, fileToDataURL, normalize, resetDemo, clone } from "./store.js";
import { openCropper } from "./cropper.js";

const $ = (s) => document.querySelector(s);
const esc = (s = "") => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MAX_FRAMES = 8;
const TYPES = {
  about: { label: "Tentang (profil + fakta)", fields: [["title", "Label"], ["subtitle", "Isi"]] },
  timeline: { label: "Timeline (pengalaman / pendidikan)", fields: [["period", "Periode"], ["title", "Judul / Posisi / Jurusan"], ["subtitle", "Instansi / Kampus"], ["desc", "Deskripsi", "area"], ["points", "Poin pencapaian (1 baris = 1 poin)", "area"], ["maps", "Google Maps (nama tempat, alamat, atau link)", "text", "mis. Universitas Sriwijaya Palembang"], ["image", "Foto / Logo", "img", "wide"], ["link", "Link (opsional)"], ["linkLabel", "Teks tombol link", "text", "mis. Lihat ijazah / Website kantor"]] },
  skills: { label: "Keahlian (bar level)", fields: [["title", "Nama keahlian"], ["subtitle", "Kategori"], ["level", "Level", "range"]] },
  cards: { label: "Grid foto + popup (proyek / sertifikat / prestasi)", fields: [["image", "Foto sampul (tampil di depan)", "img", "tile"], ["title", "Judul"], ["period", "Tahun / Status"], ["subtitle", "Penerbit / Teknologi"], ["tags", "Tag (pisahkan koma, untuk filter)", "text", "mis. Web, Data"], ["desc", "Penjelasan (muncul di popup)", "area"], ["link", "Link (opsional)"], ["linkLabel", "Teks tombol link", "text", "mis. Kunjungi / Lihat sertifikat"]] },
  gallery: { label: "Galeri foto (lightbox + slideshow)", fields: [["image", "Foto", "img", "gallery"], ["title", "Judul foto"], ["desc", "Keterangan"]] },
  contact: { label: "Kontak & dokumen", fields: [["title", "Label info tambahan"], ["subtitle", "Isi"]] },
};

const CROP = {
  avatar: { ratio: "1:1", ratios: ["1:1"], preview: "avatar", size: 600, title: "Atur foto profil", caption: "" },
  tile: { ratio: "4:3", ratios: ["4:3", "1:1", "16:9"], preview: "tile", size: 1000, title: "Atur foto sampul", caption: "Judul proyek" },
  wide: { ratio: "16:9", ratios: ["16:9", "4:3", "1:1", "asli"], preview: "wide", size: 1000, title: "Atur foto / logo" },
  gallery: { ratio: "free", ratios: ["asli", "1:1", "4:3", "16:9", "3:4"], preview: "gallery", size: 1600, title: "Atur foto galeri", caption: "Keterangan foto" },
  house: { ratio: "16:9", ratios: ["16:9", "4:3", "asli"], preview: "house", size: 1600, title: "Atur foto rumah" },
};
const THEMES = [
  ["disney", "🏰", "Disney 3D", "Rumah dongeng kartun di pulau melayang, warna ceria & efek ajaib.", "Sedang"],
  ["real", "🏡", "Semi-realistis 3D", "Pondok bertekstur asli, langit HDRI, rumput & pohon tertiup angin.", "Berat"],
  ["pro", "💼", "Profesional", "Website portofolio modern tanpa 3D. Paling cepat & cocok untuk HRD.", "Ringan"],
  ["photo", "📷", "Realistis foto asli", "Pakai foto rumah asli + foto 360° ruangan asli kamu, bingkai CV menempel di dinding.", "Ringan"],
  ["palembang", "🌉", "Kota Palembang", "Rumah limas di tepi Sungai Musi dengan Jembatan Ampera & perahu ketek.", "Sedang"],
];
let data = null, saved = "", tab = "profile";
const openSecs = new Set([0]);

// ---------------- path helpers ----------------
const getP = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
function setP(o, p, v) { const ks = p.split("."); const last = ks.pop(); const t = ks.reduce((a, k) => a[k], o); t[last] = v; }

function toast(msg, err) { const t = $("#toast"); t.textContent = msg; t.className = "toast" + (err ? " err" : ""); clearTimeout(t._h); t._h = setTimeout(() => t.classList.add("hidden"), 3200); }
function markDirty() { const dirty = JSON.stringify(data) !== saved; const s = $("#saveState"); s.textContent = dirty ? "● Belum disimpan" : "Tersimpan"; s.classList.toggle("dirty", dirty); }
addEventListener("beforeunload", (e) => { if (data && JSON.stringify(data) !== saved) { e.preventDefault(); e.returnValue = ""; } });

// ---------------- auth ----------------
if (isDemo) { $("#emailRow").classList.add("hidden"); $("#demoNote").classList.remove("hidden"); }
onAdmin(async (user) => {
  if (!user) { $("#loginView").classList.remove("hidden"); $("#appView").classList.add("hidden"); return; }
  $("#whoami").textContent = isDemo ? "Mode demo (lokal)" : user.email;
  data = await loadData(); saved = JSON.stringify(data);
  $("#loginView").classList.add("hidden"); $("#appView").classList.remove("hidden");
  render(); markDirty();
});
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault(); $("#lgErr").textContent = "";
  try {
    await login($("#lgEmail").value.trim(), $("#lgPass").value);
    if (isDemo) location.reload();
  } catch (err) {
    const m = String(err.code || err.message);
    $("#lgErr").textContent = /invalid|wrong|user-not-found|credential/i.test(m) ? "Email atau password salah." : err.message;
  }
});
$("#btnLogout").addEventListener("click", async () => { await logout(); if (isDemo) location.reload(); });

$("#btnSave").addEventListener("click", save);
addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); if (data) save(); } });
async function save() {
  const b = $("#btnSave"); b.disabled = true; b.textContent = "⏳ Menyimpan…";
  try { await saveData(data); saved = JSON.stringify(data); markDirty(); toast("✅ Tersimpan! Muat ulang website untuk melihat perubahan."); }
  catch (e) { console.error(e); toast("Gagal menyimpan: " + (e.code === "PERMISSION_DENIED" || /permission/i.test(e.message) ? "akun ini bukan admin (cek Rules database)." : e.message), true); }
  b.disabled = false; b.textContent = "💾 Simpan";
}

document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
  tab = b.dataset.tab; document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b)); render();
}));

// ---------------- komponen ----------------
const fText = (path, label, ph = "", full = false, type = "text") =>
  `<label class="field${full ? " full" : ""}"><span>${label}</span><input type="${type}" data-path="${path}" value="${esc(getP(data, path))}" placeholder="${esc(ph)}"></label>`;
const fArea = (path, label, ph = "", rows = 3) =>
  `<label class="field full"><span>${label}</span><textarea rows="${rows}" data-path="${path}" placeholder="${esc(ph)}">${esc(getP(data, path))}</textarea></label>`;
function fImg(path, label, round = false, preset = "tile") {
  const v = getP(data, path) || "";
  return `<div class="field full"><span>${label}</span><div class="img-field">
    <div class="img-prev${round ? " round" : ""}" style="${v ? `background-image:url('${esc(v)}')` : ""}">${v ? "" : "🖼️"}</div>
    <div class="img-ctrl"><div class="row">
      <span class="btn small ghost file-btn">⬆️ Upload foto<input type="file" accept="image/*" data-img="${path}" data-crop="${round ? "avatar" : preset}"></span>
      ${v ? `<button class="btn small danger" data-act="clear" data-path="${path}">Hapus</button>` : ""}</div>
      <input type="url" data-path="${path}" value="${v.startsWith("data:") ? "" : esc(v)}" placeholder="${v.startsWith("data:") ? "(foto hasil upload)" : "…atau tempel link gambar (https://)"}">
      <small>Setelah memilih foto, kamu bisa potong, zoom, dan pilih ukurannya sambil melihat pratinjau.</small></div></div></div>`;
}
function fRange(path, label) {
  const v = +getP(data, path) || 0;
  return `<label class="field"><span>${label}</span><div class="range-row"><input type="range" min="0" max="100" step="1" data-path="${path}" data-num="1" value="${v}"><output>${v}%</output></div></label>`;
}

// ---------------- tab ----------------
function render() {
  const ed = $("#editor");
  if (tab === "profile") ed.innerHTML = renderProfile();
  else if (tab === "sections") ed.innerHTML = renderSections();
  else if (tab === "links") ed.innerHTML = renderLinks();
  else if (tab === "theme") ed.innerHTML = renderTheme();
  else ed.innerHTML = renderBackup();
}

function renderProfile() {
  return `<section class="panel"><h2>👤 Profil</h2><p class="muted">Muncul di papan nama rumah, bingkai "Tentang", dan kontak.</p>
    <div class="grid">
      ${fImg("profile.photo", "Foto profil", true)}
      ${fText("profile.name", "Nama panggilan", "Risky")}
      ${fText("profile.title", "Jabatan / peran", "Transaction Banking · Bank Mandiri")}
      ${fText("profile.tagline", "Tagline singkat", "Satu kalimat tentang kamu", true)}
      ${fArea("profile.about", "Cerita tentang saya", "Ceritakan perjalanan hidupmu…", 7)}
      ${fText("profile.location", "Lokasi", "Kota, Provinsi")}
      ${fText("profile.email", "Email", "nama@email.com", false, "email")}
      ${fText("profile.phone", "No. WhatsApp / telepon", "08xx…")}
    </div></section>`;
}

function renderSections() {
  const secs = data.sections;
  return `<section class="panel"><h2>🖼️ Bingkai CV</h2>
    <p class="muted">Setiap bagian = satu bingkai di dinding dalam rumah (maks. ${MAX_FRAMES} bingkai; urutan dari kiri dinding belakang). Klik judul untuk membuka.</p>
    ${secs.map((s, i) => `<div class="sec${openSecs.has(i) ? " open" : ""}" style="--c:${esc(s.color)}">
      <div class="sec-head" data-act="toggle" data-i="${i}"><span class="ic">${esc(s.icon)}</span><b>${esc(s.title)}</b>
        <span class="badge">${i < MAX_FRAMES ? "Bingkai " + (i + 1) : "Hanya di menu"} · ${(s.items || []).length} isi</span>
        <span class="tools">
          <button class="btn small ghost" data-act="sec-up" data-i="${i}" title="Naik" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="btn small ghost" data-act="sec-down" data-i="${i}" title="Turun" ${i === secs.length - 1 ? "disabled" : ""}>↓</button>
          <button class="btn small danger" data-act="sec-del" data-i="${i}" title="Hapus bagian">🗑</button>
        </span></div>
      <div class="sec-body">
        <div class="grid">
          ${fText(`sections.${i}.title`, "Judul bingkai")}
          <label class="field"><span>Ikon (emoji)</span><input data-path="sections.${i}.icon" value="${esc(s.icon)}" maxlength="4"></label>
          <label class="field"><span>Warna</span><input type="color" data-path="sections.${i}.color" value="${esc(s.color)}"></label>
          <label class="field"><span>Jenis tampilan</span><select data-path="sections.${i}.type" data-rerender="1">
            ${Object.entries(TYPES).map(([k, t]) => `<option value="${k}" ${s.type === k ? "selected" : ""}>${t.label}</option>`).join("")}</select></label>
        </div>
        ${s.type === "about" ? `<div class="callout">Foto & cerita diambil dari tab <b>Profil</b>. Di bawah ini fakta singkat (mis. Domisili, Hobi).</div>` : ""}
        ${s.type === "contact" ? `<div class="callout">Email, telepon & lokasi diambil dari tab <b>Profil</b>; link & dokumen dari tab <b>Link &amp; Dokumen</b>. Di bawah ini info tambahan (opsional).</div>` : ""}
        ${(s.items || []).map((it, j) => renderItem(s, i, j)).join("")}
        <div><button class="btn add" data-act="item-add" data-i="${i}">＋ Tambah isi</button></div>
      </div></div>`).join("")}
    <button class="btn primary" data-act="sec-add">＋ Tambah bagian baru</button>
  </section>`;
}
function renderItem(s, i, j) {
  const T = TYPES[s.type] || TYPES.cards, base = `sections.${i}.items.${j}`;
  const n = s.items.length;
  return `<div class="item"><div class="item-head"><b>#${j + 1} ${esc(s.items[j].title || "")}</b><span class="tools">
      <button class="btn small ghost" data-act="item-up" data-i="${i}" data-j="${j}" ${j === 0 ? "disabled" : ""}>↑</button>
      <button class="btn small ghost" data-act="item-down" data-i="${i}" data-j="${j}" ${j === n - 1 ? "disabled" : ""}>↓</button>
      <button class="btn small danger" data-act="item-del" data-i="${i}" data-j="${j}">🗑</button></span></div>
    <div class="grid">${T.fields.map(([k, label, kind, extra]) => {
      const p = `${base}.${k}`;
      if (kind === "area") return fArea(p, label);
      if (kind === "img") return fImg(p, label, false, extra);
      if (kind === "range") return fRange(p, label);
      return fText(p, label, extra || "");
    }).join("")}</div></div>`;
}

function renderLinks() {
  return `<section class="panel"><h2>🔗 Link sosial</h2><p class="muted">Tampil di bingkai Kontak.</p>
    <div class="row-list">${data.links.map((l, k) => `<div class="row-item">
      <input data-path="links.${k}.icon" value="${esc(l.icon)}" placeholder="🔗" maxlength="4">
      <input data-path="links.${k}.label" value="${esc(l.label)}" placeholder="LinkedIn">
      <input type="url" data-path="links.${k}.url" value="${esc(l.url)}" placeholder="https://…">
      <button class="btn small danger" data-act="link-del" data-k="${k}">🗑</button></div>`).join("")}</div>
    <p><button class="btn add" data-act="link-add">＋ Tambah link</button></p>
    <h2 style="margin-top:26px">📄 Dokumen</h2>
    <p class="muted">CV PDF, sertifikat, portofolio. Paling hemat: tempel link Google Drive (set "Siapa saja yang memiliki link"). Upload langsung maks. 3 MB.</p>
    <div class="row-list">${data.documents.map((d, k) => `<div class="doc-item">
      <input data-path="documents.${k}.label" value="${esc(d.label)}" placeholder="CV Lengkap (PDF)">
      <input type="url" data-path="documents.${k}.url" value="${(d.url || "").startsWith("data:") ? "" : esc(d.url)}" placeholder="${(d.url || "").startsWith("data:") ? "✅ file sudah diupload" : "https://drive.google.com/…"}">
      <span class="btn small ghost file-btn">⬆️ Upload<input type="file" accept=".pdf,.doc,.docx,image/*" data-file="documents.${k}.url"></span>
      <button class="btn small danger" data-act="doc-del" data-k="${k}">🗑</button></div>`).join("")}</div>
    <p><button class="btn add" data-act="doc-add">＋ Tambah dokumen</button></p></section>`;
}

function renderTheme() {
  const cur = data.settings.theme, ph = data.settings.photo;
  return `<section class="panel"><h2>🎨 Tampilan website</h2>
    <p class="muted">Pilih satu tema untuk semua pengunjung. Isi CV tetap sama di semua tema. Klik <b>Pratinjau</b> untuk mencoba sebelum menyimpan.</p>
    <div class="themes">${THEMES.map(([k, ic, name, desc, perf]) => `<div class="theme-card${cur === k ? " on" : ""}">
      <div class="theme-top"><span class="theme-ic">${ic}</span><span class="perf perf-${perf.toLowerCase()}">${perf}</span></div>
      <b>${name}</b><p>${desc}</p>
      <div class="row"><button class="btn small ${cur === k ? "primary" : "ghost"}" data-act="theme" data-k="${k}">${cur === k ? "✔ Dipakai" : "Pakai tema ini"}</button>
      <a class="btn small ghost" href="index.html?theme=${k}" target="_blank">👁️ Pratinjau</a></div></div>`).join("")}</div>
    ${cur === "photo" ? `<h2 style="margin-top:26px">📷 Foto untuk tema Realistis</h2>
    <p class="muted">Kosongkan untuk memakai foto contoh. Foto rumah: foto depan rumah (landscape). Foto ruangan: foto 360° (rasio 2:1) dari mode Panorama/Photo Sphere di HP atau kamera 360.</p>
    <div class="grid">
      ${fImg("settings.photo.house", "Foto depan rumah", false, "house")}
      ${ph.house ? `<div class="field full"><span>Posisi pintu — klik tepat di pintu pada foto</span>
        <div class="door-pick" data-act="door"><img src="${esc(ph.house)}" alt=""><i style="left:${ph.doorX}%;top:${ph.doorY}%"></i></div>
        <small>Titik ini jadi tempat pengunjung mengklik untuk masuk (${(+ph.doorX).toFixed(0)}%, ${(+ph.doorY).toFixed(0)}%).</small></div>` : ""}
      <div class="field full"><span>Foto 360° ruangan</span><div class="img-field">
        <div class="img-prev" style="width:168px;${ph.room ? `background-image:url('${esc(ph.room)}')` : ""}">${ph.room ? "" : "🌐"}</div>
        <div class="img-ctrl"><div class="row"><span class="btn small ghost file-btn">⬆️ Upload foto 360°<input type="file" accept="image/*" data-pano="settings.photo.room"></span>
        ${ph.room ? `<button class="btn small danger" data-act="clear" data-path="settings.photo.room">Hapus</button>` : ""}</div>
        <small>Bingkai CV akan otomatis melayang mengelilingi ruangan.</small></div></div></div>
      ${ph.room ? `<label class="field full"><span>Arah awal pandangan di dalam ruangan</span><div class="range-row"><input type="range" min="-180" max="180" step="5" data-path="settings.photo.roomYaw" data-num="1" data-unit="°" value="${+ph.roomYaw || 0}"><output>${+ph.roomYaw || 0}°</output></div><small>Geser kalau saat masuk yang terlihat bukan sisi ruangan yang kamu mau.</small></label>` : ""}
    </div>` : ""}
  </section>`;
}

function renderBackup() {
  const size = new Blob([JSON.stringify(data)]).size;
  return `<section class="panel"><h2>🗄️ Cadangan</h2><p class="muted">Ukuran data saat ini: <b>${(size / 1024).toFixed(0)} KB</b>${size > 4e6 ? " — cukup besar; pertimbangkan memakai link gambar agar website cepat dimuat." : ""}</p>
    <div class="grid">
      <div class="field"><span>Unduh semua data (JSON)</span><button class="btn ghost" data-act="export">⬇️ Export</button></div>
      <div class="field"><span>Pulihkan dari file JSON</span><span class="btn ghost file-btn">⬆️ Import<input type="file" accept="application/json,.json" data-import="1"></span></div>
      <div class="field"><span>Kembalikan ke isi contoh</span><button class="btn danger" data-act="reset">↺ Reset ke contoh</button></div>
    </div>
    ${isDemo ? `<div class="callout" style="margin-top:16px">🧪 Mode demo: data hanya ada di browser ini. Untuk online, isi <code>FIREBASE_CONFIG</code> di <code>js/config.js</code> (lihat README), lalu Import file JSON hasil Export ini.</div>` : ""}
  </section>`;
}

// ---------------- events ----------------
const ed = $("#editor");
ed.addEventListener("input", (e) => {
  const el = e.target, p = el.dataset.path; if (!p) return;
  let v = el.value; if (el.dataset.num) { v = +v; const o = el.parentElement.querySelector("output"); if (o) o.textContent = v + (el.dataset.unit ?? "%"); }
  setP(data, p, v); markDirty();
  if (el.type === "url" && p.match(/image|photo/)) { const prev = el.closest(".img-field")?.querySelector(".img-prev"); if (prev) { prev.style.backgroundImage = v ? `url('${v}')` : ""; prev.textContent = v ? "" : "🖼️"; } }
});
ed.addEventListener("change", async (e) => {
  const el = e.target;
  if (el.dataset.rerender) { render(); return; }
  const f = el.files && el.files[0]; if (!f) return;
  try {
    if (el.dataset.img) {
      el.value = "";
      const out = await openCropper(f, CROP[el.dataset.crop] || CROP.tile);
      if (!out) return;
      setP(data, el.dataset.img, out); toast("🖼️ Foto siap — jangan lupa Simpan");
    }
    else if (el.dataset.pano) {
      el.value = "";
      const im = await new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = URL.createObjectURL(f); });
      const ratio = im.width / im.height;
      if (Math.abs(ratio - 2) > 0.15) toast(`Perhatian: foto 360° idealnya rasio 2:1 (punyamu ${ratio.toFixed(2)}:1). Tetap dipakai, tapi bisa terlihat melar.`, true);
      setP(data, el.dataset.pano, await imageToDataURL(f, 3072, 0.8)); toast("🌐 Foto 360° siap — jangan lupa Simpan");
    }
    else if (el.dataset.file) { setP(data, el.dataset.file, f.type.startsWith("image/") ? await imageToDataURL(f, 1800, 0.85) : await fileToDataURL(f)); toast("📄 Dokumen siap — jangan lupa Simpan"); }
    else if (el.dataset.import) { data = normalize(JSON.parse(await f.text())); toast("Data diimport — periksa lalu Simpan"); }
    markDirty(); render();
  } catch (err) { toast(err.message, true); }
});
ed.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act, i = +b.dataset.i, j = +b.dataset.j, k = +b.dataset.k;
  const S = data.sections, swap = (arr, a, c) => ([arr[a], arr[c]] = [arr[c], arr[a]]);
  if (act !== "toggle") e.stopPropagation();
  switch (act) {
    case "toggle": if (e.target.closest(".tools")) return; openSecs.has(i) ? openSecs.delete(i) : openSecs.add(i); break;
    case "sec-up": swap(S, i, i - 1); break;
    case "sec-down": swap(S, i, i + 1); break;
    case "sec-del": if (!confirm(`Hapus bagian "${S[i].title}" beserta isinya?`)) return; S.splice(i, 1); break;
    case "sec-add": S.push({ id: "bagian-" + Date.now(), type: "cards", title: "Bagian Baru", icon: "⭐", color: "#5b8def", items: [] }); openSecs.add(S.length - 1); if (S.length > MAX_FRAMES) toast(`Bingkai di dinding maks. ${MAX_FRAMES}; bagian ini tetap muncul di menu bawah.`); break;
    case "item-add": (S[i].items ||= []).push(S[i].type === "skills" ? { title: "", subtitle: "", level: 70 } : { title: "", subtitle: "", period: "", desc: "", image: "", link: "" }); openSecs.add(i); break;
    case "item-del": if (!confirm("Hapus isi ini?")) return; S[i].items.splice(j, 1); break;
    case "item-up": swap(S[i].items, j, j - 1); break;
    case "item-down": swap(S[i].items, j, j + 1); break;
    case "clear": setP(data, b.dataset.path, ""); break;
    case "theme": data.settings.theme = b.dataset.k; toast("Tema dipilih — klik Simpan agar berlaku untuk pengunjung"); break;
    case "door": { const r = b.getBoundingClientRect(); data.settings.photo.doorX = +(((e.clientX - r.left) / r.width) * 100).toFixed(1); data.settings.photo.doorY = +(((e.clientY - r.top) / r.height) * 100).toFixed(1); break; }
    case "link-add": data.links.push({ label: "", url: "", icon: "🔗" }); break;
    case "link-del": data.links.splice(k, 1); break;
    case "doc-add": data.documents.push({ label: "", url: "" }); break;
    case "doc-del": data.documents.splice(k, 1); break;
    case "export": {
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      a.download = `rumah-cv-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); return;
    }
    case "reset":
      if (!confirm("Kembalikan semua isi ke data contoh? (Belum tersimpan sampai kamu klik Simpan)")) return;
      import("./defaults.js").then(({ DEFAULT_DATA }) => { data = clone(DEFAULT_DATA); if (isDemo) resetDemo(); markDirty(); render(); }); return;
  }
  markDirty(); render();
});
