// =====================================================================
//  Isi CV (dipakai semua tema): render tiap jenis bingkai + fitur khususnya
// =====================================================================
import { openDocument } from "./store.js";

export const esc = (s = "") => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const safeUrl = (u = "") => { u = String(u || "").trim(); return /^(https?:|mailto:|tel:|data:image\/|data:application\/)/i.test(u) ? u : (u && !u.includes(":") && u.includes(".") ? "https://" + u : ""); };
export const shade = (hex = "#5b8def", amt) => {
  const n = parseInt(String(hex).replace("#", ""), 16) || 0; const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + (amt > 0 ? (255 - v) * amt : v * amt))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
};
// link Google Maps: boleh URL langsung atau teks (nama tempat / alamat)
export const mapsUrl = (m = "") => { m = String(m || "").trim(); if (!m) return ""; return /^https?:/i.test(m) ? m : "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(m); };
const lines = (t = "") => String(t || "").split(/\n+/).map((s) => s.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
const tagsOf = (t = "") => String(t || "").split(",").map((s) => s.trim()).filter(Boolean);
const empty = `<p class="empty">Belum ada isi. Tambahkan lewat halaman Admin ✨</p>`;
const subtitleFor = { about: "", contact: "Mari terhubung!", skills: "Hal-hal yang saya kuasai", timeline: "Jejak perjalanan", cards: "Klik untuk melihat detail", gallery: "Potongan cerita" };

export function sectionColors(el, sec) { const c1 = sec.color || "#5b8def"; el.style.setProperty("--c1", c1); el.style.setProperty("--c2", shade(c1, -0.28)); }

export function headerHTML(sec, data) {
  const sub = sec.type === "about" ? data.profile.title : subtitleFor[sec.type] || "";
  return `<header class="p-head">
    <span class="orb" style="width:160px;height:160px;right:-40px;top:-50px"></span>
    <span class="orb" style="width:70px;height:70px;right:90px;bottom:-20px"></span>
    <span class="p-icon">${esc(sec.icon)}</span>
    <h2>${esc(sec.title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ""}
  </header>`;
}

// ------------------------------------------------------------------
export function renderSection(sec, data, si) {
  const p = data.profile, items = sec.items || [];
  switch (sec.type) {
    case "about": {
      const cv = (data.documents || []).findIndex((d) => d.url);
      return `<div class="stagger">
        <div class="about-top"><div class="avatar">${p.photo ? `<img src="${esc(safeUrl(p.photo))}" alt="${esc(p.name)}" data-zoom="${esc(safeUrl(p.photo))}" data-cap="${esc(p.name)}">` : "🙂"}</div>
          <div><h3>${esc(p.name)}</h3><p class="role">${esc(p.title)}</p>${p.tagline ? `<p class="tag" data-type="${esc(p.tagline)}">“<span></span>”</p>` : ""}</div></div>
        <p class="prose">${esc(p.about)}</p>
        ${items.length ? `<div class="facts">${items.map((f) => `<div class="fact"><b>${esc(f.title)}</b><span>${esc(f.subtitle)}</span></div>`).join("")}</div>` : ""}
        <div class="actions">
          ${cv >= 0 ? `<button class="btn-pill solid" data-doc="${cv}">📄 Unduh CV</button>` : ""}
          ${data.sections.some((s) => s.type === "contact") ? `<button class="btn-pill" data-goto="contact">💌 Hubungi saya</button>` : ""}
          ${p.location ? `<a class="btn-pill" href="${esc(mapsUrl(p.location))}" target="_blank" rel="noopener">📍 ${esc(p.location)}</a>` : ""}
        </div>
      </div>`;
    }
    case "timeline":
      if (!items.length) return empty;
      return `<div class="timeline stagger">${items.map((it, j) => {
        const pts = lines(it.points);
        return `<div class="t-item${j === 0 ? " open" : ""}">
        <button class="t-head" data-toggle>
          ${it.period ? `<span class="period">${esc(it.period)}</span>` : ""}
          <h4>${esc(it.title)}</h4>${it.subtitle ? `<p class="org">${esc(it.subtitle)}</p>` : ""}
          <span class="chev">⌄</span>
        </button>
        <div class="t-body">
          ${it.desc ? `<p class="d">${esc(it.desc)}</p>` : ""}
          ${pts.length ? `<ul class="points">${pts.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
          ${it.image ? `<img class="thumb" src="${esc(safeUrl(it.image))}" alt="${esc(it.title)}" loading="lazy" data-zoom="${esc(safeUrl(it.image))}" data-cap="${esc(it.title)}">` : ""}
          <div class="actions">
            ${it.maps ? `<a class="btn-pill" href="${esc(mapsUrl(it.maps))}" target="_blank" rel="noopener">📍 Lihat di Google Maps</a>` : ""}
            ${safeUrl(it.link) ? `<a class="btn-pill" href="${esc(safeUrl(it.link))}" target="_blank" rel="noopener">🔗 ${esc(it.linkLabel || "Kunjungi")}</a>` : ""}
          </div>
        </div></div>`;
      }).join("")}</div>`;
    case "skills": {
      if (!items.length) return empty;
      const cats = [...new Set(items.map((i) => i.subtitle).filter(Boolean))];
      return `${cats.length > 1 ? `<div class="filters"><button class="on" data-filter="">Semua</button>${cats.map((c) => `<button data-filter="${esc(c)}">${esc(c)}</button>`).join("")}</div>` : ""}
        <div class="stagger skills">${items.map((it) => `<div class="skill" data-cat="${esc(it.subtitle || "")}"><div class="skill-top"><span>${esc(it.title)}</span><small>${esc(it.subtitle || "")} ${it.level !== "" && it.level != null ? `· ${+it.level}%` : ""}</small></div>
        <div class="bar"><i data-w="${Math.max(0, Math.min(100, +it.level || 0))}"></i></div></div>`).join("")}</div>`;
    }
    case "cards": {
      if (!items.length) return empty;
      const tags = [...new Set(items.flatMap((i) => tagsOf(i.tags)))];
      return `${tags.length > 1 ? `<div class="filters"><button class="on" data-filter="">Semua</button>${tags.map((c) => `<button data-filter="${esc(c)}">${esc(c)}</button>`).join("")}</div>` : ""}
      <div class="tiles stagger">${items.map((it, j) => `<button class="tile" data-detail="${si}:${j}" data-tags="${esc(tagsOf(it.tags).join("|"))}">
        ${it.image ? `<img src="${esc(safeUrl(it.image))}" alt="${esc(it.title)}" loading="lazy">` : `<span class="tile-ph">${esc(sec.icon)}</span>`}
        <span class="tile-cap">${esc(it.title)}</span><span class="tile-hint">Lihat detail</span>
      </button>`).join("")}</div>`;
    }
    case "gallery":
      if (!items.length) return empty;
      return `<div class="actions" style="margin-bottom:12px">${items.some((i) => i.image) ? `<button class="btn-pill" data-slideshow="${si}">▶ Putar slideshow</button>` : ""}</div>
      <div class="gallery stagger">${items.map((it, j) => `<figure class="g-item" ${it.image ? `data-gal="${si}:${j}"` : ""}>
        ${it.image ? `<img src="${esc(safeUrl(it.image))}" alt="${esc(it.title)}" loading="lazy">` : "🖼️"}<figcaption>${esc(it.title)}</figcaption></figure>`).join("")}</div>`;
    case "contact": {
      const wa = (p.phone || "").replace(/\D/g, "").replace(/^0/, "62");
      const rows = [
        p.email && `<div class="c-row"><span class="ic">✉️</span><div><small>Email</small><b>${esc(p.email)}</b></div><span class="c-act"><button data-copy="${esc(p.email)}" title="Salin">📋</button><a href="mailto:${esc(p.email)}" title="Kirim email">↗</a></span></div>`,
        p.phone && `<div class="c-row"><span class="ic">📱</span><div><small>WhatsApp / Telepon</small><b>${esc(p.phone)}</b></div><span class="c-act"><button data-copy="${esc(p.phone)}" title="Salin">📋</button><a href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener" title="Chat WhatsApp">↗</a></span></div>`,
        p.location && `<div class="c-row"><span class="ic">📍</span><div><small>Lokasi</small><b>${esc(p.location)}</b></div><span class="c-act"><a href="${esc(mapsUrl(p.location))}" target="_blank" rel="noopener" title="Google Maps">↗</a></span></div>`,
      ].filter(Boolean).join("");
      const links = (data.links || []).filter((l) => safeUrl(l.url));
      const docs = (data.documents || []).map((d, i) => ({ ...d, i })).filter((d) => d.url);
      return `<div class="stagger">
        <div class="c-list">${rows || empty}</div>
        ${links.length ? `<h5 class="sub-h">Temukan saya di</h5><div class="chips">${links.map((l) => `<a class="chip" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.icon || "🔗")} ${esc(l.label)}</a>`).join("")}</div>` : ""}
        ${docs.length ? `<h5 class="sub-h">Dokumen</h5>${docs.map((d) => `<button class="doc-btn" data-doc="${d.i}">📄 ${esc(d.label)}</button>`).join("")}` : ""}
        ${(p.email || wa) ? `<h5 class="sub-h">Kirim pesan</h5>
        <form class="msg-form" onsubmit="return false">
          <input name="nama" placeholder="Nama kamu" maxlength="80">
          <textarea name="pesan" rows="3" placeholder="Tulis pesan…" maxlength="1000"></textarea>
          <div class="actions">${wa ? `<button class="btn-pill solid" data-send="wa" data-to="${esc(wa)}">💬 Kirim via WhatsApp</button>` : ""}${p.email ? `<button class="btn-pill" data-send="mail" data-to="${esc(p.email)}">✉️ Kirim via Email</button>` : ""}</div>
        </form>` : ""}
        ${items.map((it) => `<div class="c-row" style="margin-top:10px"><span class="ic">⭐</span><div><small>${esc(it.title)}</small><b>${esc(it.subtitle)}</b></div></div>`).join("")}
      </div>`;
    }
    default: return empty;
  }
}

// ------------------------------------------------------------------
//  Interaksi (dipasang setelah HTML dirender)
// ------------------------------------------------------------------
export function wire(root, data, { onGoto } = {}) {
  root.querySelectorAll(".stagger").forEach((el) => [...el.children].forEach((ch, i) => (ch.style.animationDelay = `${0.12 + i * 0.06}s`)));
  setTimeout(() => root.querySelectorAll(".bar i").forEach((b) => (b.style.width = b.dataset.w + "%")), 300);
  // efek ketik tagline
  root.querySelectorAll("[data-type]").forEach((el) => {
    const txt = el.dataset.type, span = el.querySelector("span"); let i = 0;
    const tick = () => { span.textContent = txt.slice(0, ++i); if (i < txt.length) setTimeout(tick, 28); };
    setTimeout(tick, 500);
  });
  root.onclick = (e) => {
    const t = e.target.closest("[data-zoom],[data-doc],[data-goto],[data-toggle],[data-filter],[data-detail],[data-gal],[data-slideshow],[data-copy],[data-send]");
    if (!t || !root.contains(t)) return;
    if (t.dataset.zoom) return lightbox([{ src: t.dataset.zoom, cap: t.dataset.cap }], 0);
    if (t.dataset.doc != null) return openDocument(data.documents[+t.dataset.doc].url);
    if (t.dataset.goto) return onGoto && onGoto(t.dataset.goto);
    if (t.hasAttribute("data-toggle")) return t.parentElement.classList.toggle("open");
    if (t.dataset.filter != null) {
      const f = t.dataset.filter, box = t.parentElement;
      box.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === t));
      const list = box.nextElementSibling;
      list.querySelectorAll("[data-cat],[data-tags]").forEach((el) => {
        const ok = !f || el.dataset.cat === f || (el.dataset.tags || "").split("|").includes(f);
        el.classList.toggle("hide", !ok);
      });
      return;
    }
    if (t.dataset.detail) { const [si, j] = t.dataset.detail.split(":").map(Number); return openDetail(data.sections[si], data.sections[si].items[j]); }
    if (t.dataset.gal || t.dataset.slideshow != null) {
      const si = +(t.dataset.gal ? t.dataset.gal.split(":")[0] : t.dataset.slideshow);
      const list = data.sections[si].items.filter((i) => i.image).map((i) => ({ src: safeUrl(i.image), cap: [i.title, i.desc].filter(Boolean).join(" — ") }));
      const j = t.dataset.gal ? data.sections[si].items.filter((i) => i.image).indexOf(data.sections[si].items[+t.dataset.gal.split(":")[1]]) : 0;
      return lightbox(list, Math.max(0, j), t.dataset.slideshow != null);
    }
    if (t.dataset.copy) { navigator.clipboard?.writeText(t.dataset.copy).then(() => toast("Tersalin ✓")); return; }
    if (t.dataset.send) {
      const f = t.closest("form"), nama = f.nama.value.trim(), pesan = f.pesan.value.trim();
      if (!pesan) { f.pesan.focus(); return toast("Tulis pesannya dulu ya"); }
      const body = `Halo ${data.profile.name || ""}, saya ${nama || "pengunjung"}.\n\n${pesan}`;
      if (t.dataset.send === "wa") window.open(`https://wa.me/${t.dataset.to}?text=${encodeURIComponent(body)}`, "_blank", "noopener");
      else location.href = `mailto:${t.dataset.to}?subject=${encodeURIComponent("Pesan dari website CV")}&body=${encodeURIComponent(body)}`;
    }
  };
}

// ------------------------------------------------------------------
//  Overlay: popup detail, lightbox, toast
// ------------------------------------------------------------------
function overlay(id, html) {
  let el = document.getElementById(id);
  if (!el) { el = document.createElement("div"); el.id = id; document.body.appendChild(el); }
  el.className = "ovl"; el.innerHTML = html; el.classList.remove("hidden");
  return el;
}
export function openDetail(sec, it) {
  const tags = tagsOf(it.tags);
  const el = overlay("detail", `<div class="detail-card">
    <button class="close dark" data-x aria-label="Tutup">✕</button>
    <div class="detail-media">${it.image ? `<img src="${esc(safeUrl(it.image))}" alt="${esc(it.title)}">` : `<span>${esc(sec.icon)}</span>`}</div>
    <div class="detail-body">
      ${it.period ? `<span class="period">${esc(it.period)}</span>` : ""}
      <h3>${esc(it.title)}</h3>${it.subtitle ? `<p class="org">${esc(it.subtitle)}</p>` : ""}
      ${tags.length ? `<div class="chips small">${tags.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>` : ""}
      ${it.desc ? `<p class="d">${esc(it.desc)}</p>` : ""}
      ${lines(it.points).length ? `<ul class="points">${lines(it.points).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      <div class="actions">
        ${safeUrl(it.link) ? `<a class="btn-pill solid" href="${esc(safeUrl(it.link))}" target="_blank" rel="noopener">🔗 ${esc(it.linkLabel || "Kunjungi")}</a>` : ""}
        ${it.maps ? `<a class="btn-pill" href="${esc(mapsUrl(it.maps))}" target="_blank" rel="noopener">📍 Google Maps</a>` : ""}
      </div>
    </div></div>`);
  sectionColors(el, sec);
  const img = el.querySelector(".detail-media img"); if (img) img.onclick = () => lightbox([{ src: img.src, cap: it.title }], 0);
  el.onclick = (e) => { if (e.target === el || e.target.closest("[data-x]")) el.classList.add("hidden"); };
}

let lbTimer = null;
export function lightbox(list, idx = 0, auto = false) {
  if (!list.length) return;
  const el = overlay("lightbox2", `<button class="close" data-x aria-label="Tutup">✕</button>
    ${list.length > 1 ? `<button class="lb-nav prev" data-prev aria-label="Sebelumnya">‹</button><button class="lb-nav next" data-next aria-label="Berikutnya">›</button>` : ""}
    <figure><img alt=""><figcaption></figcaption></figure>
    ${list.length > 1 ? `<div class="lb-bar"><span class="lb-count"></span><button data-play>${auto ? "⏸ Jeda" : "▶ Slideshow"}</button></div>` : ""}`);
  el.classList.add("lb");
  const show = (k) => {
    idx = (k + list.length) % list.length; const im = el.querySelector("img");
    im.classList.remove("in"); im.src = list[idx].src; requestAnimationFrame(() => im.classList.add("in"));
    el.querySelector("figcaption").textContent = list[idx].cap || "";
    const c = el.querySelector(".lb-count"); if (c) c.textContent = `${idx + 1} / ${list.length}`;
  };
  const play = (on) => { clearInterval(lbTimer); lbTimer = on ? setInterval(() => show(idx + 1), 3200) : null; const b = el.querySelector("[data-play]"); if (b) b.textContent = on ? "⏸ Jeda" : "▶ Slideshow"; };
  const close = () => { play(false); el.classList.add("hidden"); removeEventListener("keydown", key); };
  const key = (e) => { if (e.key === "ArrowRight") show(idx + 1); else if (e.key === "ArrowLeft") show(idx - 1); else if (e.key === "Escape") close(); };
  addEventListener("keydown", key);
  el.onclick = (e) => {
    if (e.target.closest("[data-prev]")) return show(idx - 1);
    if (e.target.closest("[data-next]")) return show(idx + 1);
    if (e.target.closest("[data-play]")) return play(!lbTimer);
    if (e.target === el || e.target.closest("[data-x]")) close();
  };
  let sx = null; el.ontouchstart = (e) => (sx = e.touches[0].clientX);
  el.ontouchend = (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1)); sx = null; };
  show(idx); play(auto && list.length > 1);
}

export function toast(msg) {
  let t = document.getElementById("toastMini");
  if (!t) { t = document.createElement("div"); t.id = "toastMini"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 1800);
}
export const isOverlayOpen = () => [...document.querySelectorAll(".ovl")].some((o) => !o.classList.contains("hidden"));
export function closeOverlays() { document.querySelectorAll(".ovl").forEach((o) => o.classList.add("hidden")); clearInterval(lbTimer); }
