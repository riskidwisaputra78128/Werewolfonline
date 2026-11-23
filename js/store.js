// Lapisan data: Firebase Realtime Database (kalau dikonfigurasi) atau localStorage (mode demo)
import { FIREBASE_CONFIG, DB_PATH, DEMO_ADMIN_PASSWORD } from "./config.js";
import { DEFAULT_DATA } from "./defaults.js";

const LS_KEY = "rumahcv-data-v1";
const LS_ADMIN = "rumahcv-demo-admin";
const FB_VER = "10.12.2";

export const isDemo = !FIREBASE_CONFIG;

let fb = null; // { db, auth, mods }
async function firebase() {
  if (fb) return fb;
  const base = `https://www.gstatic.com/firebasejs/${FB_VER}`;
  const [appM, dbM, authM] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-database.js`),
    import(`${base}/firebase-auth.js`)
  ]);
  const app = appM.initializeApp(FIREBASE_CONFIG);
  fb = { db: dbM.getDatabase(app), auth: authM.getAuth(app), dbM, authM };
  return fb;
}

export const clone = (o) => JSON.parse(JSON.stringify(o));

// Lengkapi data yang mungkin kurang field-nya (agar tidak error)
export function normalize(d) {
  const out = clone(DEFAULT_DATA);
  if (!d || typeof d !== "object") return out;
  out.profile = { ...out.profile, ...(d.profile || {}) };
  out.settings = { ...out.settings, ...(d.settings || {}), photo: { ...out.settings.photo, ...((d.settings || {}).photo || {}) } };
  if (Array.isArray(d.sections)) out.sections = d.sections.map((s, i) => ({
    id: s.id || "bagian-" + i, type: s.type || "cards", title: s.title || "Bagian",
    icon: s.icon || "⭐", color: s.color || "#5b8def",
    items: Array.isArray(s.items) ? s.items : (s.items ? Object.values(s.items) : [])
  }));
  if (d.links) out.links = Array.isArray(d.links) ? d.links : Object.values(d.links);
  if (d.documents) out.documents = Array.isArray(d.documents) ? d.documents : Object.values(d.documents);
  return out;
}

export async function loadData() {
  if (isDemo) {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return normalize(raw ? JSON.parse(raw) : null);
    } catch { return normalize(null); }
  }
  try {
    const { db, dbM } = await firebase();
    const snap = await dbM.get(dbM.ref(db, DB_PATH));
    return normalize(snap.exists() ? snap.val() : null);
  } catch (e) {
    console.warn("Gagal memuat dari Firebase, memakai data bawaan:", e);
    return normalize(null);
  }
}

export async function saveData(data) {
  data.updatedAt = Date.now();
  if (isDemo) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); }
    catch (e) { throw new Error("Penyimpanan browser penuh. Kecilkan/kurangi foto, atau aktifkan Firebase."); }
    return;
  }
  const { db, dbM } = await firebase();
  await dbM.set(dbM.ref(db, DB_PATH), JSON.parse(JSON.stringify(data)));
}

export async function resetDemo() { localStorage.removeItem(LS_KEY); }

// ---------------- Auth admin ----------------
export async function login(email, password) {
  if (isDemo) {
    if (password !== DEMO_ADMIN_PASSWORD) throw new Error("Password salah.");
    sessionStorage.setItem(LS_ADMIN, "1");
    return { email: "demo@lokal" };
  }
  const { auth, authM } = await firebase();
  const cred = await authM.signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logout() {
  if (isDemo) { sessionStorage.removeItem(LS_ADMIN); return; }
  const { auth, authM } = await firebase();
  await authM.signOut(auth);
}

export function onAdmin(cb) {
  if (isDemo) { cb(sessionStorage.getItem(LS_ADMIN) ? { email: "demo@lokal" } : null); return; }
  firebase().then(({ auth, authM }) => authM.onAuthStateChanged(auth, cb));
}

// ---------------- Util file ----------------
// Kecilkan gambar jadi JPEG/WebP dataURL (agar muat di database gratis)
export function imageToDataURL(file, maxSize = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width: w, height: h } = img;
      const s = Math.min(1, maxSize / Math.max(w, h));
      w = Math.round(w * s); h = Math.round(h * s);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("File bukan gambar yang valid.")); };
    img.src = url;
  });
}

export function fileToDataURL(file, maxBytes = 3 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) return reject(new Error(`File terlalu besar (maks ${Math.round(maxBytes / 1048576)} MB). Pakai link Google Drive saja.`));
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// Buka dokumen (link biasa atau dataURL hasil upload)
export function openDocument(url) {
  if (!url) return;
  if (url.startsWith("data:")) {
    const [meta, b64] = url.split(",");
    const mime = (meta.match(/data:([^;]+)/) || [])[1] || "application/octet-stream";
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    window.open(URL.createObjectURL(new Blob([arr], { type: mime })), "_blank");
  } else window.open(url, "_blank", "noopener");
}
