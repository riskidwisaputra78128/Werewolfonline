// =====================================================================
//  TEMA 3 · Profesional — website portofolio modern tanpa 3D (paling ringan)
// =====================================================================
import { esc, safeUrl, mapsUrl, renderSection, wire, sectionColors } from "./content.js";

export function mountPro(data) {
  if (!document.querySelector('link[href="css/pro.css"]')) {
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "css/pro.css"; document.head.appendChild(l);
  }
  document.body.classList.add("pro-mode");
  const root = document.getElementById("proRoot"); root.classList.remove("hidden");
  const p = data.profile, secs = data.sections;
  const about = secs.find((s) => s.type === "about");
  const cv = (data.documents || []).findIndex((d) => d.url);
  const contactIdx = secs.findIndex((s) => s.type === "contact");
  const initials = (p.name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  root.innerHTML = `
  <nav class="pro-nav"><div class="pro-wrap">
    <a href="#top" class="pro-logo"><span>${esc(initials)}</span>${esc(p.name)}</a>
    <div class="pro-links">${secs.filter((s) => s.type !== "about").map((s) => `<a href="#sec-${secs.indexOf(s)}">${esc(s.title)}</a>`).join("")}</div>
    ${cv >= 0 ? `<button class="pro-btn sm" data-doc="${cv}">Unduh CV</button>` : ""}
    <button class="pro-burger" aria-label="Menu">☰</button>
  </div></nav>

  <header class="pro-hero" id="top"><div class="pro-wrap pro-hero-grid">
    <div class="pro-hero-text reveal-up">
      <p class="pro-eyebrow">Halo, saya</p>
      <h1>${esc(p.name)}</h1>
      <p class="pro-role">${esc(p.title)}</p>
      ${p.tagline ? `<p class="pro-tag">${esc(p.tagline)}</p>` : ""}
      <div class="pro-cta">
        ${contactIdx >= 0 ? `<a class="pro-btn" href="#sec-${contactIdx}">Hubungi saya</a>` : ""}
        ${cv >= 0 ? `<button class="pro-btn ghost" data-doc="${cv}">📄 Unduh CV</button>` : ""}
      </div>
      <div class="pro-meta">${p.location ? `<a href="${esc(mapsUrl(p.location))}" target="_blank" rel="noopener">📍 ${esc(p.location)}</a>` : ""}${p.email ? `<a href="mailto:${esc(p.email)}">✉️ ${esc(p.email)}</a>` : ""}</div>
    </div>
    <div class="pro-photo reveal-up">${p.photo ? `<img src="${esc(safeUrl(p.photo))}" alt="${esc(p.name)}">` : `<span>${esc(initials)}</span>`}</div>
  </div></header>

  ${about ? `<section class="pro-sec" id="sec-${secs.indexOf(about)}"><div class="pro-wrap pro-about reveal-up">
    <h2><span>${esc(about.icon)}</span>${esc(about.title)}</h2>
    <p class="prose">${esc(p.about)}</p>
    ${(about.items || []).length ? `<div class="facts">${about.items.map((f) => `<div class="fact"><b>${esc(f.title)}</b><span>${esc(f.subtitle)}</span></div>`).join("")}</div>` : ""}
  </div></section>` : ""}

  ${secs.map((s, i) => s.type === "about" ? "" : `<section class="pro-sec${i % 2 ? " alt" : ""}" id="sec-${i}" data-si="${i}"><div class="pro-wrap reveal-up">
    <h2><span>${esc(s.icon)}</span>${esc(s.title)}</h2>
    <div class="pro-body">${renderSection(s, data, i)}</div>
  </div></section>`).join("")}

  <footer class="pro-foot"><div class="pro-wrap">© ${new Date().getFullYear()} ${esc(p.name)} · Dibuat dengan ❤️
    <div class="chips">${(data.links || []).filter((l) => safeUrl(l.url)).map((l) => `<a class="chip" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.icon || "🔗")} ${esc(l.label)}</a>`).join("")}</div>
  </div></footer>`;

  root.querySelectorAll(".pro-sec[data-si]").forEach((el) => sectionColors(el, secs[+el.dataset.si]));
  root.querySelectorAll(".pro-sec").forEach((el) => { if (!el.dataset.si) sectionColors(el, about || { color: "#4f46e5" }); });
  wire(root, data, { onGoto: (type) => { const k = secs.findIndex((s) => s.type === type); document.getElementById("sec-" + k)?.scrollIntoView({ behavior: "smooth" }); } });

  // animasi muncul saat di-scroll + nav aktif
  const io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.12 });
  root.querySelectorAll(".reveal-up").forEach((el) => io.observe(el));
  const nav = root.querySelector(".pro-nav");
  addEventListener("scroll", () => nav.classList.toggle("scrolled", scrollY > 20), { passive: true });
  root.querySelector(".pro-burger").onclick = () => nav.classList.toggle("open");
  root.querySelectorAll(".pro-links a").forEach((a) => (a.onclick = () => nav.classList.remove("open")));
}
