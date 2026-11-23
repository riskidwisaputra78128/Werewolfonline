import { loadData } from "./store.js";
import { esc, headerHTML, renderSection, wire, sectionColors, isOverlayOpen, closeOverlays } from "./content.js";

const $ = (s) => document.querySelector(s);
const SCENES = { disney: "./scene-disney.js", real: "./scene.js", photo: "./scene-photo.js", palembang: "./scene-palembang.js" };
export const THEME_KEYS = ["disney", "real", "pro", "photo", "palembang"];

let data, world, theme;

async function boot() {
  const [d] = await Promise.all([
    loadData(),
    Promise.race([Promise.all([document.fonts.load("700 40px Fredoka"), document.fonts.load("600 40px Fredoka")]), new Promise((r) => setTimeout(r, 2500))]),
  ]);
  data = d;
  const q = new URLSearchParams(location.search).get("theme");
  theme = THEME_KEYS.includes(q) ? q : (THEME_KEYS.includes(data.settings?.theme) ? data.settings.theme : "real");
  document.body.dataset.theme = theme;
  const name = data.profile.name || "Saya";

  // tema profesional: website biasa tanpa 3D
  if (theme === "pro") {
    document.title = `${name} · ${data.profile.title || "CV"}`;
    const { mountPro } = await import("./pro.js");
    mountPro(data);
    $("#loader").classList.add("done");
    return;
  }

  const test = document.createElement("canvas");
  if (!(test.getContext("webgl2") || test.getContext("webgl"))) {
    // tanpa WebGL: jatuh ke tema profesional
    const { mountPro } = await import("./pro.js"); mountPro(data); $("#loader").classList.add("done"); return;
  }

  const mod = await import(SCENES[theme]);
  const brand = mod.brand ? mod.brand(name) : `Rumah ${name}`;
  document.title = `${brand} · CV Interaktif`;
  $("#brandName").textContent = brand;
  $("#introName").textContent = brand;
  $("#introTitle").textContent = data.profile.tagline || data.profile.title || "";
  if (mod.eyebrow) $("#intro .eyebrow").textContent = mod.eyebrow;

  world = new mod.HouseWorld($("#world"), data, {
    onReady: showIntro,
    onEnterStart: () => { hideIntro(); burstAt(innerWidth / 2, innerHeight * 0.55, 18); },
    onEntered: () => { showDock(); $("#btnExit").classList.remove("hidden"); },
    onExitStart: () => { $("#dock").classList.add("hidden"); $("#insideHint").classList.add("hidden"); $("#btnExit").classList.add("hidden"); },
    onExited: showIntro,
    onOpen: (sec) => openPanel(sec),
    onHover: (h) => setTooltip(h),
    onBackground: () => { closePanel(); world.unfocus(); },
    fade: (to, ms) => fade(to, ms),
    onProgress: (p) => { $("#loader p").textContent = `Membangun rumah… ${Math.round(p * 100)}%`; },
  });
  window.__world = world;
  await world.ready;
  setTimeout(() => { $("#loader").classList.add("done"); world.start(); }, 250);
}

// ---------------- UI dasar ----------------
function fade(to, ms) { const f = $("#fade"); f.style.transition = `opacity ${ms}ms ease`; requestAnimationFrame(() => (f.style.opacity = to)); }
function showIntro() { const i = $("#intro"); i.classList.remove("hidden", "leave"); i.classList.add("reveal"); }
function hideIntro() { const i = $("#intro"); i.classList.add("leave"); setTimeout(() => i.classList.add("hidden"), 500); }
$("#btnEnter").addEventListener("click", () => world && world.enter());
$("#btnExit").addEventListener("click", () => { closePanel(); world && world.exit(); });

function goSection(i) {
  if (world.mode === "focus") { closePanel(); world.unfocus(() => world.focusFrame(i)); } else world.focusFrame(i);
}
function showDock() {
  const dock = $("#dock"); dock.innerHTML = "";
  data.sections.forEach((s, i) => {
    const b = document.createElement("button");
    b.innerHTML = `<span class="ic">${esc(s.icon)}</span>${esc(s.title)}`;
    b.style.animationDelay = `${0.08 * i}s`;
    b.onclick = () => goSection(i);
    dock.appendChild(b);
  });
  dock.classList.remove("hidden"); $("#insideHint").classList.remove("hidden");
}

addEventListener("pointermove", (e) => { const t = $("#tooltip"); t.style.left = e.clientX + "px"; t.style.top = e.clientY + "px"; });
function setTooltip(h) {
  const t = $("#tooltip");
  if (!h || matchMedia("(pointer: coarse)").matches) return t.classList.add("hidden");
  t.textContent = h === "door" ? "✨ Klik untuk masuk" : `${h.icon} ${h.title}`;
  t.classList.remove("hidden");
}
function burstAt(x, y, n = 12) {
  if (theme === "photo" || theme === "real") n = Math.round(n / 2);
  for (let i = 0; i < n; i++) {
    const s = document.createElement("span"); s.className = "burst"; s.textContent = ["✦", "✧", "★", "✨"][i % 4];
    const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 110;
    s.style.left = x + "px"; s.style.top = y + "px"; s.style.setProperty("--dx", Math.cos(a) * d + "px"); s.style.setProperty("--dy", Math.sin(a) * d + "px");
    s.style.fontSize = 10 + Math.random() * 14 + "px";
    document.body.appendChild(s); setTimeout(() => s.remove(), 950);
  }
}

// ---------------- Panel ----------------
function openPanel(sec) {
  const wrap = $("#panelWrap"), panel = $("#panel");
  const si = data.sections.indexOf(sec);
  sectionColors(panel, sec);
  panel.classList.remove("out");
  $("#panelBody").innerHTML = headerHTML(sec, data) + `<div class="p-body">${renderSection(sec, data, si)}</div>`;
  wire($("#panelBody"), data, { onGoto: (type) => { const k = data.sections.findIndex((s) => s.type === type); if (k >= 0) goSection(k); } });
  wrap.classList.remove("hidden"); document.body.classList.add("panel-open");
  panel.style.animation = "none"; panel.offsetHeight; panel.style.animation = "";
  $("#panelBody").scrollTop = 0;
  setTooltip(null);
  burstAt(innerWidth > 900 ? innerWidth - 300 : innerWidth / 2, innerWidth > 900 ? 120 : innerHeight * 0.3, 14);
}
function closePanel() {
  const wrap = $("#panelWrap"), panel = $("#panel");
  if (wrap.classList.contains("hidden")) return;
  panel.classList.add("out"); document.body.classList.remove("panel-open");
  setTimeout(() => wrap.classList.add("hidden"), 330);
}
$("#panelClose").addEventListener("click", () => { closePanel(); world.unfocus(); });
addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (isOverlayOpen()) return closeOverlays();
  if (world && !$("#panelWrap").classList.contains("hidden")) { closePanel(); world.unfocus(); }
});

boot().catch((e) => { console.error(e); $("#loader p").textContent = "Ups, gagal memuat: " + e.message; });
