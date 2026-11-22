/**
 * WEREWOLF ONLINE — Server akun di Google Sheet (Google Apps Script)
 *
 * Sheet yang dibuat otomatis:
 *   Akun     : id | username | nama | password | dibuat | login_terakhir | status | karakter | catatan
 *   Riwayat  : waktu | game_id | kode_room | user_id | username | nama | peran | tim | menang | poin | hidup | hari | tema
 *
 * Yang bisa kamu lakukan langsung di sheet:
 *   - status = "blokir"            → akun tidak bisa login / tidak tercatat skornya ("aktif" untuk membuka lagi)
 *   - password  → terlihat apa adanya; ubah langsung di sel untuk mengganti password pemain
 *   - ubah nama, karakter, atau hapus/edit baris Riwayat bila ada kecurangan
 * PERHATIAN: password tersimpan sebagai teks biasa — jangan bagikan akses Sheet ke orang lain.
 *
 * Cara pasang: lihat PANDUAN.md di folder ini.
 */

const SHEET_AKUN = 'Akun', SHEET_RIWAYAT = 'Riwayat';
const KOLOM_AKUN = ['id', 'username', 'nama', 'password', 'dibuat', 'login_terakhir', 'status', 'karakter', 'catatan'];
const KOLOM_RIWAYAT = ['waktu', 'game_id', 'kode_room', 'user_id', 'username', 'nama', 'peran', 'tim', 'menang', 'poin', 'hidup', 'hari', 'tema'];
const TOKEN_HARI = 30;           // sesi login berlaku 30 hari

// ============================================================ entry point
function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (_) { return out({ ok: false, error: 'Format permintaan salah.' }); }
  try {
    const fn = AKSI[body.action];
    if (!fn) return out({ ok: false, error: 'Aksi tidak dikenal.' });
    return out(fn(body));
  } catch (err) {
    console.error(err);
    return out({ ok: false, error: 'Kesalahan server: ' + (err && err.message ? err.message : err) });
  }
}
function doGet() { return out({ ok: true, info: 'Server akun Werewolf aktif.' }); }
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

const AKSI = {
  register: register, login: login, me: me, setLook: setLook, changePassword: changePassword,
  leaderboard: leaderboard, report: report, profile: profileOf,
};

// ============================================================ sheet util
function sheet(name, cols) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(cols); sh.setFrozenRows(1); sh.getRange(1, 1, 1, cols.length).setFontWeight('bold').setBackground('#2a1414').setFontColor('#ffd98a'); }
  // kolom yang belum ada ditambahkan di kanan (aman bila sheet lama)
  const head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  cols.forEach((c) => { if (head.indexOf(c) < 0) { head.push(c); sh.getRange(1, head.length).setValue(c).setFontWeight('bold').setBackground('#2a1414').setFontColor('#ffd98a'); } });
  // password disimpan sebagai TEKS supaya "001234" tidak berubah jadi angka 1234
  const pc = head.indexOf('password'); if (pc >= 0) sh.getRange(1, pc + 1, sh.getMaxRows(), 1).setNumberFormat('@');
  sh._head = head;
  return sh;
}
function appendObj(name, cols, obj) { const sh = sheet(name, cols); sh.appendRow(sh._head.map((h) => (obj[h] !== undefined ? obj[h] : ''))); }
function rows(name, cols) {
  const sh = sheet(name, cols), v = sh.getDataRange().getValues();
  const head = v.shift() || cols;
  return v.map((r, i) => { const o = { _row: i + 2 }; head.forEach((h, k) => (o[h] = r[k])); return o; });
}
function setCell(name, cols, row, col, value) { const sh = sheet(name, cols); sh.getRange(row, sh._head.indexOf(col) + 1).setValue(value); }
function findUser(username) { const u = String(username || '').toLowerCase().trim(); return rows(SHEET_AKUN, KOLOM_AKUN).find((r) => String(r.username).toLowerCase() === u); }
function findUserById(id) { return rows(SHEET_AKUN, KOLOM_AKUN).find((r) => String(r.id) === String(id)); }

// ============================================================ keamanan
function secret() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty('SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('SECRET', s); }
  return s;
}
function b64(bytes) { return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, ''); }
function makeToken(id) {
  const exp = Date.now() + TOKEN_HARI * 864e5, data = id + '.' + exp;
  return data + '.' + b64(Utilities.computeHmacSha256Signature(data, secret()));
}
/** token → user aktif atau null */
function verify(token) {
  const p = String(token || '').split('.');
  if (p.length !== 3) return null;
  const data = p[0] + '.' + p[1];
  if (b64(Utilities.computeHmacSha256Signature(data, secret())) !== p[2]) return null;
  if (Number(p[1]) < Date.now()) return null;
  const u = findUserById(p[0]);
  if (!u || String(u.status).toLowerCase() === 'blokir') return null;
  return u;
}
function limit(key, max, sec) {
  const c = CacheService.getScriptCache(), n = Number(c.get(key) || 0);
  if (n >= max) return false;
  c.put(key, String(n + 1), sec); return true;
}
const cleanName = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);

// ============================================================ akun
function register(b) {
  const username = String(b.username || '').toLowerCase().trim(), nama = cleanName(b.name, 16), pw = String(b.password || '');
  if (!/^[a-z0-9_]{3,16}$/.test(username)) return { ok: false, error: 'Username 3–16 karakter: huruf kecil, angka, atau _.' };
  if (nama.length < 2) return { ok: false, error: 'Nama tampilan minimal 2 karakter.' };
  if (pw.length < 6) return { ok: false, error: 'Password minimal 6 karakter.' };
  if (!limit('reg', 30, 600)) return { ok: false, error: 'Terlalu banyak pendaftaran. Coba lagi beberapa menit lagi.' };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    if (findUser(username)) return { ok: false, error: 'Username sudah dipakai.' };
    const id = 'u' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const look = b.look != null && Number(b.look) >= 0 ? Number(b.look) : '';
    appendObj(SHEET_AKUN, KOLOM_AKUN, { id: id, username: username, nama: nama, password: pw, dibuat: new Date(), login_terakhir: new Date(), status: 'aktif', karakter: look, catatan: '' });
    return { ok: true, token: makeToken(id), user: publicUser(findUserById(id)) };
  } finally { lock.releaseLock(); }
}
function login(b) {
  const u = findUser(b.username), pw = String(b.password || '');
  if (!limit('login_' + String(b.username || '').toLowerCase(), 10, 600)) return { ok: false, error: 'Terlalu banyak percobaan. Tunggu 10 menit.' };
  if (!u) return { ok: false, error: 'Username atau password salah.' };
  if (String(u.status).toLowerCase() === 'blokir') return { ok: false, error: 'Akun ini diblokir. Hubungi admin.' };
  const ok = String(u.password) === pw;
  if (!ok) return { ok: false, error: 'Username atau password salah.' };
  setCell(SHEET_AKUN, KOLOM_AKUN, u._row, 'login_terakhir', new Date());
  return { ok: true, token: makeToken(u.id), user: publicUser(findUserById(u.id)) };
}
function me(b) {
  const u = verify(b.token); if (!u) return { ok: false, error: 'Sesi berakhir. Silakan masuk lagi.', expired: true };
  return { ok: true, user: publicUser(u), stats: statsFor(u.id) };
}
function setLook(b) {
  const u = verify(b.token); if (!u) return { ok: false, error: 'Sesi berakhir.', expired: true };
  const look = b.look === null || b.look === '' ? '' : Math.max(0, Math.min(15, Number(b.look) | 0));
  setCell(SHEET_AKUN, KOLOM_AKUN, u._row, 'karakter', look);
  return { ok: true };
}
function changePassword(b) {
  const u = verify(b.token); if (!u) return { ok: false, error: 'Sesi berakhir.', expired: true };
  if (String(u.password) !== String(b.old || '')) return { ok: false, error: 'Password lama salah.' };
  if (String(b.password || '').length < 6) return { ok: false, error: 'Password baru minimal 6 karakter.' };
  setCell(SHEET_AKUN, KOLOM_AKUN, u._row, 'password', String(b.password));
  return { ok: true };
}
function publicUser(u) { return { id: u.id, username: u.username, name: u.nama, look: u.karakter === '' ? null : Number(u.karakter), since: u.dibuat }; }

// ============================================================ statistik & julukan
const NAMA_PERAN = { werewolf: 'Werewolf', seer: 'Seer', doctor: 'Doctor', hunter: 'Hunter', judge: 'Hakim', guardian: 'Guardian', witch: 'Witcher', villager: 'Villager' };
function statsFor(id) {
  const list = rows(SHEET_RIWAYAT, KOLOM_RIWAYAT).filter((r) => String(r.user_id) === String(id));
  const s = { games: list.length, wins: 0, points: 0, alive: 0, roles: {}, recent: [] };
  for (const r of list) {
    const won = isYes(r.menang); if (won) s.wins++;
    s.points += Number(r.poin) || 0; if (isYes(r.hidup)) s.alive++;
    const k = String(r.peran); s.roles[k] = s.roles[k] || { games: 0, wins: 0 }; s.roles[k].games++; if (won) s.roles[k].wins++;
  }
  s.recent = list.slice(-10).reverse().map((r) => ({ at: r.waktu, role: r.peran, won: isYes(r.menang), points: Number(r.poin) || 0, room: r.kode_room, theme: r.tema }));
  s.titles = titles(s);
  return s;
}
const isYes = (v) => v === true || String(v).toLowerCase() === 'ya' || String(v).toLowerCase() === 'true';
function titles(s) {
  const t = [], rate = (r) => (r && r.games ? r.wins / r.games : 0), R = s.roles;
  if (s.games < 3) return ['Warga Baru'];
  if ((R.werewolf?.wins || 0) >= 3) t.push('Serigala Licik');
  if ((R.seer?.games || 0) >= 3 && rate(R.seer) >= 0.6) t.push('Seer Andalan');
  if ((R.doctor?.games || 0) >= 3 && rate(R.doctor) >= 0.6) t.push('Tabib Sakti');
  if ((R.hunter?.games || 0) >= 3 && rate(R.hunter) >= 0.6) t.push('Sniper Jitu');
  if (s.games >= 5 && s.alive / s.games >= 0.5) t.push('Sang Penyintas');
  if (s.wins >= 10) t.push('Pahlawan Desa');
  if (s.games >= 25) t.push('Veteran');
  if (s.games >= 5 && s.wins / s.games >= 0.7) t.push('Si Paling Menang');
  return t.length ? t.slice(0, 3) : ['Warga Setia'];
}
function profileOf(b) {
  const u = findUserById(b.id) || findUser(b.username); if (!u) return { ok: false, error: 'Akun tidak ditemukan.' };
  return { ok: true, user: publicUser(u), stats: statsFor(u.id) };
}

// ============================================================ peringkat mingguan
function weekStart() {
  const now = new Date(), wib = new Date(now.getTime() + 7 * 3600e3); // WIB
  const day = (wib.getUTCDay() + 6) % 7; // Senin = 0
  const start = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate() - day) - 7 * 3600e3;
  return new Date(start);
}
function leaderboard() {
  const cache = CacheService.getScriptCache(), hit = cache.get('lb');
  if (hit) return JSON.parse(hit);
  const since = weekStart().getTime(), agg = {};
  for (const r of rows(SHEET_RIWAYAT, KOLOM_RIWAYAT)) {
    const t = new Date(r.waktu).getTime(); if (!(t >= since)) continue;
    const a = agg[r.user_id] = agg[r.user_id] || { id: r.user_id, name: r.nama, username: r.username, games: 0, wins: 0, points: 0 };
    a.games++; if (isYes(r.menang)) a.wins++; a.points += Number(r.poin) || 0; a.name = r.nama;
  }
  const blocked = new Set(rows(SHEET_AKUN, KOLOM_AKUN).filter((u) => String(u.status).toLowerCase() === 'blokir').map((u) => String(u.id)));
  const list = Object.values(agg).filter((a) => !blocked.has(String(a.id))).sort((x, y) => y.points - x.points || y.wins - x.wins).slice(0, 20);
  const res = { ok: true, since: since, top: list };
  cache.put('lb', JSON.stringify(res), 60);
  return res;
}

// ============================================================ laporan hasil game (dikirim host di akhir game)
function report(b) {
  const gid = String(b.gameId || '').slice(0, 60);
  if (!gid) return { ok: false, error: 'gameId kosong.' };
  const cache = CacheService.getScriptCache();
  if (cache.get('g_' + gid)) return { ok: true, dup: true };
  cache.put('g_' + gid, '1', 21600);
  const sh = sheet(SHEET_RIWAYAT, KOLOM_RIWAYAT), now = new Date(), seen = {};
  let n = 0;
  for (const p of (b.players || []).slice(0, 16)) {
    const u = verify(p.token); if (!u || seen[u.id]) continue; // setiap pemain dibuktikan dengan tokennya sendiri
    seen[u.id] = 1;
    sh.appendRow([now, gid, cleanName(b.code, 8), u.id, u.username, u.nama, NAMA_PERAN[p.role] || cleanName(p.role, 12), p.team === 'wolf' ? 'Serigala' : 'Warga', p.won ? 'ya' : 'tidak', Math.max(0, Math.min(500, Number(p.score) || 0)), p.alive ? 'ya' : 'tidak', Number(b.day) || 0, cleanName(b.theme, 12)]);
    n++;
  }
  cache.remove('lb');
  return { ok: true, saved: n };
}

/** jalankan sekali dari editor (opsional) untuk membuat sheet & memberi izin */
function setup() { sheet(SHEET_AKUN, KOLOM_AKUN); sheet(SHEET_RIWAYAT, KOLOM_RIWAYAT); secret(); return 'Siap!'; }
