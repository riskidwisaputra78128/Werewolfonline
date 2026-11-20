# 🐺 Werewolf Online — Desa 3D Multiplayer

Game social deduction Werewolf yang dimainkan bareng teman di browser: buat room, bagikan kode atau link, lalu main realtime di desa 3D dengan siklus siang–malam.

## Pilih cara deploy

| Cara | Butuh server/kartu? | File yang dipakai |
|---|---|---|
| **Netlify** | Tidak | `deploy/web/index.html` (atau seluruh repo + `netlify.toml`) |
| **Vercel** | Tidak | seluruh repo + `vercel.json` |
| **GitHub Pages** | Tidak | `deploy/web/index.html` |
| **Google Apps Script** | Tidak | `deploy/apps-script/Code.gs` + `index.html` |
| Render / Railway / VPS (versi server) | Ya (Node.js) | seluruh repo + `render.yaml` / `Dockerfile` |

Versi **tanpa server** (Netlify/Vercel/Pages/Apps Script) memakai **P2P (WebRTC via PeerJS)**: browser host menjalankan game, pemain lain tersambung langsung ke host. Hal yang perlu diketahui:
- Host harus membiarkan tab game terbuka selama permainan. Kalau host menutup tab, room berakhir. Sebaiknya host bermain dari laptop.
- Tidak ada daftar room publik. Gabung lewat **kode room** atau **link undangan** (tombol 🔗 Salin undangan).
- Pada jaringan yang sangat ketat (sebagian WiFi kantor), koneksi bisa gagal. Coba jaringan lain atau hotspot HP.

### Netlify (paling mudah)
1. Buka **app.netlify.com/drop**.
2. Seret folder `deploy/web` ke halaman itu. Link langsung jadi.
   *Atau:* Add new site → Import from GitHub → pilih repo. `netlify.toml` sudah mengatur semuanya, jadi tinggal klik Deploy.

### Vercel
1. Buka **vercel.com/new** dan login dengan GitHub.
2. Import repo `Werewolf-online`, lalu klik **Deploy**. Pengaturan sudah ada di `vercel.json`, jangan diubah.

### Google Apps Script
1. Buka **script.google.com** → New project.
2. Ganti isi `Code.gs` dengan isi `deploy/apps-script/Code.gs`.
3. Klik **+ (Add a file) → HTML**, beri nama `index` (persis, tanpa .html), lalu tempel seluruh isi `deploy/apps-script/index.html`.
4. **Deploy → New deployment → Web app**, Execute as: *Me*, Who has access: *Anyone* → Deploy. Salin URL `/exec`-nya.
5. Link undangan di versi ini berbentuk `URL-exec?room=KODE`.

## Fitur
- Room & lobby, kode room, link undangan, maks 16 pemain.
- Host = Moderator (opsional): melihat semua peran & aksi malam, lanjut fase, jeda timer, ulang game, keluarkan pemain.
- Peran: Werewolf, Seer, Doctor, Hunter, Hakim (suara ×2), Guardian, Witcher, Villager. Peran khusus dan jumlah werewolf bisa diatur.
- Chat umum, chat rahasia serigala, chat arwah, plus gelembung chat di atas avatar.
- Desa 3D: siang/malam mengikuti fase, klik avatar untuk memilih target, nisan untuk pemain mati, werewolf berubah wujud di akhir.
- Bot pengisi dan latihan offline vs 7 bot.

## Pengembangan
```bash
npm install
npm run build:static   # build versi tanpa server → deploy/web & deploy/apps-script
npm run build && npm start   # versi server Node.js (Socket.IO) di http://localhost:3000
```
Uji P2P lokal tanpa internet: jalankan server PeerJS sendiri (`npx peerjs --port 9000`), lalu buka `index.html?peer=localhost:9000`.

## Struktur
```
shared/engine.js          Aturan game (dipakai server, host P2P, dan mode offline)
client/src/transport.js   Online (Socket.IO) · P2P (PeerJS) · Offline (bot)
client/src/main.js        UI & logika tampilan
client/src/village.js     Desa 3D & avatar
server/index.js           Server Node.js (opsional, untuk Render/VPS)
deploy/web/               File siap upload untuk Netlify/Vercel/GitHub Pages
deploy/apps-script/       Code.gs + index.html untuk Google Apps Script
```
