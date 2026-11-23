# 🏡 Rumah CV — CV Interaktif 3D

Pengunjung disambut sebuah **rumah pondok bergaya semi-realistis di padang rumput saat matahari terbit**: langit & cahaya dari foto HDRI asli, material PBR (plester, batu alam, genteng, kayu, bata), bayangan lembut, rumput & pohon yang bergoyang tertiup angin, dan asap cerobong.
Klik pintu → pintu terbuka, cahaya membanjir, kamera terbang masuk → di dalam ada **ruang galeri** dengan bingkai-bingkai di dinding.
Klik bingkai → kamera mendekat & panel CV muncul (Tentang, Pengalaman, Keahlian, Pendidikan, Sertifikasi, Proyek, Galeri, Kontak).

- **Pembaca CV** → cukup buka website, tanpa login.
- **Admin** → buka `/admin` (ikon 🔒 kecil di pojok kanan bawah), login, lalu edit profil, foto, isi tiap bingkai, link, dan dokumen.

Tanpa build step: HTML + JavaScript biasa, Three.js sudah ada di folder `vendor/`. Hosting gratis di **Vercel**, data di **Firebase** (paket Spark, tanpa kartu kredit).

---

## Tema tampilan (pilih di Admin → 🎨 Tampilan)

| Tema | Isi | Beban |
|---|---|---|
| 🏰 Disney 3D | rumah dongeng kartun di pulau melayang | sedang |
| 🏡 Semi-realistis 3D | pondok PBR, langit HDRI, rumput & pohon bergoyang | berat |
| 💼 Profesional | website portofolio modern tanpa 3D | ringan |
| 📷 Realistis foto asli | foto rumah asli + foto 360° ruangan asli (upload di Admin) | ringan |
| 🌉 Kota Palembang | rumah limas di tepi Musi, Jembatan Ampera, perahu ketek | sedang |

Coba tema tanpa menyimpan: tambahkan `?theme=disney` / `real` / `pro` / `photo` / `palembang` di URL.
Semua tema 3D otomatis menurunkan resolusi bila FPS turun, dan perangkat tanpa WebGL otomatis memakai tema Profesional.

**Tema foto asli:** di Admin → Tampilan, upload foto depan rumah, lalu klik tepat di pintunya. Untuk ruangan, upload foto 360° (rasio 2:1) dari mode *Panorama/Photo Sphere* HP atau kamera 360. Foto contoh bawaan adalah render 3D.

## Fitur tiap bingkai

- **Timeline (Pengalaman/Pendidikan):** item bisa dibuka-tutup, poin pencapaian, tombol 📍 Google Maps (isi nama tempat/alamat atau link), link + teks tombolnya.
- **Grid foto (Proyek/Sertifikat):** yang tampil hanya foto sampul; klik → popup penjelasan, tag, dan link. Filter berdasarkan tag.
- **Keahlian:** filter per kategori + bar animasi.
- **Galeri:** lightbox dengan tombol ‹ › / geser, keyboard, dan slideshow.
- **Kontak:** salin email/nomor, chat WhatsApp, buka Maps, form "Kirim pesan" via WhatsApp/Email, unduh dokumen.
- **Upload foto di Admin:** editor potong, zoom, putar, pilih ukuran hasil (Kecil/Sedang/Besar), lengkap dengan pratinjau tampilannya.

## 1. Coba dulu di komputer (Mode Demo)

`js/config.js` masih `FIREBASE_CONFIG = null` → **Mode Demo**: data tersimpan di browser saja.

```bash
cd rumah-cv
npx serve .          # atau: python -m http.server 8000
```
Buka `http://localhost:3000` (atau `:8000`). Halaman admin: `/admin.html`, password demo: **admin123** (ubah di `js/config.js`).

> Jangan buka `index.html` dengan klik dua kali (file://) — browser memblokir modul JS. Pakai server lokal seperti di atas.

---

## 2. Hubungkan Firebase (agar admin bisa edit dari mana saja)

Kamu bisa memakai **project Firebase yang sama dengan game Werewolf** (Realtime Database sudah aktif) atau buat project baru.

**a. Aktifkan login admin**
1. Firebase Console → **Authentication** → *Get started* → tab *Sign-in method* → aktifkan **Email/Password**.
2. Tab *Users* → **Add user** → isi email & password admin kamu.
3. Authentication → *Settings* → **Authorized domains** → tambahkan domain Vercel kamu nanti (mis. `rumah-risky.vercel.app`).

**b. Aturan database (Rules)**
Realtime Database → tab **Rules**. ⚠️ Kalau project ini juga dipakai game Werewolf, **jangan timpa** rules yang ada —
cukup **tambahkan** blok `"rumahcv"` di dalam `"rules"`, di samping rules werewolf yang sudah ada:

```json
"rumahcv": {
  "data": {
    ".read": true,
    ".write": "auth != null && auth.token.email == 'emailadmin@gmail.com'"
  }
}
```
Ganti `emailadmin@gmail.com` dengan email admin dari langkah a. (Contoh lengkap ada di `database.rules.json`.)
Klik **Publish**.

**c. Tempel config**
Project settings (⚙️) → *General* → *Your apps* → pilih/daftarkan **Web app** → salin objek `firebaseConfig`,
lalu tempel ke `js/config.js`:

```js
export const FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "....firebaseapp.com",
  databaseURL: "https://....firebasedatabase.app",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```
`databaseURL` wajib ada (lihat di halaman Realtime Database kalau tidak muncul di config).

> Kalau sudah sempat mengisi CV di Mode Demo: di admin demo buka tab **Cadangan → Export**, lalu setelah Firebase aktif login lagi dan **Import** file tersebut → **Simpan**.

---

## 3. Deploy ke Vercel

1. Upload folder `rumah-cv` ke repo GitHub baru (mis. `riskidwisaputra78128/rumah-cv`).
2. Vercel → **Add New Project** → import repo → Framework preset: **Other** → Build command kosong → **Deploy**.
3. Tambahkan domain Vercel-nya ke *Authorized domains* Firebase (langkah 2a).

Setiap kali kamu `git push`, Vercel otomatis update.

---

## Tentang foto & dokumen

- Foto yang di-upload di admin otomatis **dikecilkan** (maks. 1200px JPEG) lalu disimpan di Realtime Database — tidak butuh Firebase Storage (yang sekarang wajib kartu kredit).
- Untuk dokumen besar (CV PDF, sertifikat), paling hemat **tempel link Google Drive** (set akses "Siapa saja yang memiliki link"). Upload langsung dibatasi 3 MB.
- Seluruh data CV diunduh setiap kali ada pengunjung, jadi usahakan total di bawah ±3 MB (lihat ukuran di tab **Cadangan**). Kalau fotonya banyak, pakai link gambar (mis. dari GitHub/ImgBB) supaya website tetap cepat dan kuota gratis aman.

## Struktur file

```
index.html          halaman utama (rumah 3D)
admin.html          halaman admin
css/style.css       tampilan website
css/admin.css       tampilan admin
js/config.js        ⚙️ config Firebase & password demo
js/defaults.js      isi CV contoh (dipakai kalau database masih kosong)
js/scene-disney.js  tema 1 (Disney)
js/scene.js         tema 2 (semi-realistis) + dasar tema 4 & 5
js/pro.js           tema 3 (profesional) + css/pro.css
js/scene-photo.js   tema 4 (foto asli) + assets/photo/
js/scene-palembang.js tema 5 (Palembang)
js/content.js       isi & fitur tiap bingkai (dipakai semua tema)
js/cropper.js       editor foto di Admin
js/main.js          pemuat tema, intro, menu, panel CV
js/store.js         simpan/muat data (Firebase atau localStorage)
js/admin.js         editor admin
vendor/three/       Three.js r170 (lokal, tanpa CDN)
database.rules.json contoh Rules Firebase
vercel.json         cache & noindex untuk admin
```

## Performa

- Kualitas otomatis lebih ringan di HP (rumput lebih sedikit, bayangan lebih kecil).
- Tambahkan `?q=low` di URL (mis. `rumah-risky.vercel.app/?q=low`) untuk mode super ringan di perangkat lemah.
- Aset: `assets/hdr/spruit_sunrise_1k.hdr` (Poly Haven, CC0) dan tekstur kayu/bata/rumput dari contoh resmi three.js. Total ±3 MB.

## Kustomisasi cepat

| Mau ubah | Di mana |
|---|---|
| Langit / suasana | ganti file `.hdr` di `assets/hdr/` (mis. dari polyhaven.com, 1k) dan namanya di `init()` `js/scene.js` |
| Warna plester / genteng | `js/scene.js` → `buildHouse()` (`plasterSet(...)`, `tileSet(...)`) |
| Kecerahan | `toneMappingExposure` di `showWorld()` |
| Posisi bingkai di dinding | `js/scene.js` → `frameSlots()` |
| Kekuatan efek glow | `js/scene.js` → `UnrealBloomPass(..., 0.35, 0.4, 1.25)` |
| Font | `index.html` (Google Fonts Fredoka + Nunito) |
