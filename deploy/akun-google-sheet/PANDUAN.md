# Pasang Server Akun di Google Sheet (±5 menit)

Data akun & skor disimpan di Google Sheet milikmu. Kamu bisa memantau dan mengubahnya langsung dari sheet.

## 1. Buat Sheet + Apps Script
1. Buka https://sheets.new, lalu beri nama, misalnya **Werewolf Akun**.
2. Pilih menu **Ekstensi → Apps Script**.
3. Hapus semua isi `Code.gs`, lalu tempel seluruh isi file **Code.gs** dari folder ini. Tekan 💾 Simpan.
4. Di dropdown fungsi (atas), pilih **setup**, lalu tekan **▶ Jalankan**. Izinkan akses saat diminta (Lanjutan → Buka proyek → Izinkan).
   Sheet **Akun** dan **Riwayat** akan dibuat otomatis.

## 2. Deploy sebagai Web App
1. Tekan **Terapkan → Deployment baru**, lalu pilih ⚙ → **Aplikasi web**.
2. Isi pengaturannya:
   - Jalankan sebagai: **Saya**
   - Yang memiliki akses: **Siapa saja**
3. Tekan **Terapkan**, lalu salin **URL aplikasi web** (berakhiran `/exec`).

## 3. Sambungkan ke game
Buka `client/index.html`, cari baris berikut:
```js
window.WW_AUTH_URL = "";
```
Isi dengan URL tadi:
```js
window.WW_AUTH_URL = "https://script.google.com/macros/s/XXXX/exec";
```
Setelah itu build ulang (`npm run build:static`) dan deploy ke Vercel seperti biasa (atau push ke GitHub).

> Kalau nanti kamu mengubah Code.gs, buka **Terapkan → Kelola deployment → ✏ Edit → Versi: Versi baru → Terapkan**. Dengan cara ini URL-nya tetap sama.

## Yang bisa kamu lakukan di Sheet
| Mau apa | Caranya |
|---|---|
| Blokir pemain | Kolom **status** diisi `blokir` (isi `aktif` untuk membuka lagi) |
| Lihat / ganti password | Kolom **password** tampil apa adanya. Untuk mengganti, cukup edit selnya lalu beri tahu pemainnya |
| Ganti nama tampilan | Edit kolom **nama** |
| Hapus skor curang | Hapus baris yang bersangkutan di sheet **Riwayat** (peringkat ikut berubah) |
| Catatan admin | Kolom **catatan** bebas kamu isi |

**Soal password:** password tersimpan sebagai teks biasa supaya kamu bisa melihat dan mengubahnya. Karena itu **jangan bagikan akses Sheet** ke siapa pun. Di form Daftar, pemain juga sudah diberi tahu supaya tidak memakai password yang sama dengan akun penting mereka.

## Catatan
- Pemain tetap bisa **main sebagai tamu** tanpa akun. Bedanya hanya skor mereka tidak tercatat.
- Skor dicatat oleh browser host di akhir game, khusus untuk pemain yang login. Mode latihan offline tidak dicatat.
- Peringkat mingguan dihitung mulai **Senin 00:00 WIB**.
- Jangan bagikan akses edit Sheet ke orang lain.
