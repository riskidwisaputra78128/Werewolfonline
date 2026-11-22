// Akun pemain (server: Google Apps Script + Google Sheet). Tamu tetap bisa main tanpa akun.
const URL_ = () => (window.WW_AUTH_URL || '').trim();
const KEY = 'ww_auth', LOOK = 'ww_look';

export const auth = {
  get enabled() { return !!URL_(); },
  token: null, user: null, stats: null,
  load() {
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s?.token) { this.token = s.token; this.user = s.user; } } catch {}
    return this;
  },
  save() { try { this.token ? localStorage.setItem(KEY, JSON.stringify({ token: this.token, user: this.user })) : localStorage.removeItem(KEY); } catch {} },
  async api(action, body = {}) {
    if (!this.enabled) return { ok: false, error: 'Server akun belum dipasang (WW_AUTH_URL kosong).' };
    try {
      // text/plain → tidak memicu CORS preflight di Apps Script
      const r = await fetch(URL_(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, ...body }), redirect: 'follow' });
      return await r.json();
    } catch (e) { return { ok: false, error: 'Tidak bisa terhubung ke server akun.' }; }
  },
  async register(username, name, password) {
    const r = await this.api('register', { username, name, password, look: this.look() });
    if (r.ok) { this.token = r.token; this.user = r.user; this.save(); }
    return r;
  },
  async login(username, password) {
    const r = await this.api('login', { username, password });
    if (r.ok) { this.token = r.token; this.user = r.user; if (r.user.look != null) this.setLocalLook(r.user.look); this.save(); }
    return r;
  },
  async refresh() {
    if (!this.token) return { ok: false };
    const r = await this.api('me', { token: this.token });
    if (r.ok) { this.user = r.user; this.stats = r.stats; if (r.user.look != null) this.setLocalLook(r.user.look); this.save(); }
    else if (r.expired) this.logout();
    return r;
  },
  logout() { this.token = null; this.user = null; this.stats = null; this.save(); },
  look() { const v = localStorage.getItem(LOOK); return v === null || v === '' ? null : Number(v); },
  setLocalLook(v) { try { v === null ? localStorage.removeItem(LOOK) : localStorage.setItem(LOOK, String(v)); } catch {} },
  async setLook(v) { this.setLocalLook(v); if (this.token) { if (this.user) this.user.look = v; this.save(); return this.api('setLook', { token: this.token, look: v }); } return { ok: true }; },
  changePassword(old, password) { return this.api('changePassword', { token: this.token, old, password }); },
  leaderboard() { return this.api('leaderboard'); },
  report(data) { return this.api('report', data); },
  /** data yang dikirim ke host saat bergabung */
  profile() { return { look: this.look() ?? -1, token: this.token || '' }; }, // -1 = acak (Firebase membuang nilai null)
};
