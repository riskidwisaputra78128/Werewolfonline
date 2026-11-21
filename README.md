---
title: Werewolf Online
emoji: 🐺
colorFrom: red
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

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
- Versi P2P (tanpa Firebase) tidak punya daftar room publik — gabung lewat **kode room** atau **link undangan**.
- Versi **Firebase** menampilkan **daftar room aktif** di halaman awal: pemain tinggal sentuh *Gabung*, tanpa kode. Room otomatis hilang dari daftar saat host keluar/menutup tab, dan sisa room yatim dibersihkan sendiri. Host bisa mematikan *Tampilkan di daftar* untuk room privat.

### Rules Firebase Realtime Database
Daftar room dibaca dari `meta` tiap room di `ww/rooms`, jadi cukup rules yang mengizinkan baca/tulis `ww/rooms` (tidak perlu rules tambahan).
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
- Peran: Werewolf, Seer, Doctor, Hunter (sniper tiap malam), Hakim (suara ×2), Guardian, Witcher, Villager. Peran khusus dan jumlah werewolf bisa diatur.
- Chat umum, chat rahasia serigala, chat arwah, plus gelembung chat di atas avatar.
- Desa 3D: siang/malam mengikuti fase, klik avatar untuk memilih target, nisan untuk pemain mati, werewolf berubah wujud di akhir.
- Bot pengisi dan latihan offline vs 7 bot.
- **16 tipe warga berbeda** (Ksatria, Penyihir, Penjaga Hutan, Pendeta, Warlock, Pemburu, Paladin, Penyair, Viking, Penyihir Elf, Pembunuh Bayaran, Tabib, Samurai, Ahli Nujum, Gladiator, Bangsawan): kostum, warna baju & kulit, aksesori kepala, jubah, senjata, dan proporsi badan berbeda — tidak ada yang kembar selama ≤16 pemain.
- **Karakter manusia realistis** (3 model GLB ber-rig: pria berzirah, pria biasa berjanggut, dan wanita) dengan animasi idle, tarian kemenangan di podium, plus aura & kristal warna pemain. File ada di `deploy/web/models/` — ikut ter-upload saat deploy Vercel/Netlify. Versi Apps Script tidak bisa memuat file model, jadi otomatis memakai karakter bawaan.
- Karakter bawaan (cadangan) bergaya fantasi: jubah berbordir yang berkibar, cape, pauldron, rambut & telinga elf acak, orb sihir, tongkat, kristal melayang, aura warna pemain. Moderator bersayap dengan halo.
- Tema visual dark fantasy: rune merah menyala, panel bergaya grimoire, kartu peran tome 3D (miring mengikuti kursor) dengan sigil berbeda tiap peran.
- Efek 3D: lingkaran rune di lapangan desa, bulan darah, kabut tanah, bara api, debu sihir, color grading + vignette, guncangan kamera.
- Animasi kematian per penyebab: dimangsa serigala (bayangan werewolf menerkam + cakar), eksekusi voting (lingkaran penghakiman + pilar cahaya), racun Witcher (asap hijau), sniper Hunter (laser merah dari kegelapan + peluru pelacak), Guardian berkorban (perisai emas pecah). Kamera otomatis menyorot korban.
- Akhir game: tim pemenang naik **podium 3D** (peringkat 1–3) dengan konfeti, plus panel **kontribusi** tiap pemain (memangsa, menerawang, menyelamatkan, voting tepat, bertahan hidup, dll.).

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
