// Data CV bawaan (contoh). Semua bisa diubah lewat halaman Admin.
// Tipe bagian (type):
//   about    -> profil + foto + fakta singkat
//   timeline -> pengalaman / pendidikan (urut waktu)
//   skills   -> keahlian dengan level 0-100
//   cards    -> proyek / sertifikat / prestasi (kartu bergambar)
//   gallery  -> galeri foto
//   contact  -> kontak, link sosial & dokumen
export const DEFAULT_DATA = {
  version: 2,
  // Tema tampilan: disney | real | pro | photo | palembang (bisa diganti di Admin > Tampilan)
  settings: {
    theme: "real",
    photo: { house: "", room: "", doorX: 50, doorY: 72 }
  },
  profile: {
    name: "Risky",
    title: "Transaction Banking Retail Services · Bank Mandiri",
    tagline: "Merangkai data, pembayaran digital, dan kode jadi solusi yang berguna.",
    photo: "",
    location: "Sumatera, Indonesia",
    email: "email@contoh.com",
    phone: "",
    about:
      "Halo! Saya Risky. Sehari-hari saya bekerja di Bank Mandiri, divisi Transaction Banking Retail Services (TBRS) Region II / Sumatera 2, menangani performa Livin' Merchant, pengelolaan data merchant, serta infrastruktur pembayaran seperti EDC dan QRIS.\n\nDi luar pekerjaan, saya suka membangun aplikasi web, mengulik pasar keuangan, dan membuat konten kreatif berbantuan AI. Rumah ini adalah ringkasan perjalanan saya — silakan jelajahi setiap bingkainya."
  },
  sections: [
    {
      id: "tentang", type: "about", title: "Tentang Saya", icon: "👋", color: "#ff9a62",
      items: [
        { title: "Domisili", subtitle: "Sumatera, Indonesia" },
        { title: "Fokus", subtitle: "Merchant, pembayaran digital & data" },
        { title: "Hobi", subtitle: "Ngoding, trading, konten AI" }
      ]
    },
    {
      id: "pengalaman", type: "timeline", title: "Pengalaman Kerja", icon: "💼", color: "#5b8def",
      items: [
        {
          title: "Transaction Banking Retail Services (TBRS)",
          subtitle: "Bank Mandiri · Region II / Sumatera 2",
          period: "20XX – Sekarang",
          desc: "Memantau performa Livin' Merchant, mengelola data merchant, dan mendukung infrastruktur pembayaran (EDC & QRIS).",
          points: "Monitoring performa Livin' Merchant\nPengelolaan & validasi data merchant\nDukungan infrastruktur EDC & QRIS",
          image: "", link: "", maps: ""
        },
        {
          title: "Posisi sebelumnya (isi di Admin)",
          subtitle: "Nama perusahaan",
          period: "20XX – 20XX",
          desc: "Tuliskan tanggung jawab dan pencapaian utama di sini.",
          image: "", link: ""
        }
      ]
    },
    {
      id: "skill", type: "skills", title: "Keahlian", icon: "✨", color: "#b06cf0",
      items: [
        { title: "Analisis Data Merchant", subtitle: "Data", level: 88 },
        { title: "EDC & QRIS / Payment System", subtitle: "Perbankan", level: 85 },
        { title: "Spreadsheet & Apps Script", subtitle: "Tools", level: 85 },
        { title: "Web Development (JS, React, Node)", subtitle: "Teknologi", level: 75 },
        { title: "Analisis Pasar & Trading", subtitle: "Keuangan", level: 70 },
        { title: "Produksi Konten AI", subtitle: "Kreatif", level: 70 }
      ]
    },
    {
      id: "pendidikan", type: "timeline", title: "Pendidikan", icon: "🎓", color: "#2fbf9b",
      items: [
        {
          title: "Nama Kampus / Sekolah (isi di Admin)",
          subtitle: "Jurusan · Gelar",
          period: "20XX – 20XX",
          desc: "Prestasi, organisasi, atau tugas akhir yang ingin ditonjolkan.",
          points: "", image: "", link: "", maps: ""
        }
      ]
    },
    {
      id: "sertifikasi", type: "cards", title: "Sertifikasi & Prestasi", icon: "🏆", color: "#f2b632",
      items: [
        {
          title: "Sertifikasi SPPUR Jenjang 4",
          subtitle: "Mandiri Corporate University",
          period: "Dalam persiapan",
          desc: "Sistem Pembayaran dan Pengelolaan Uang Rupiah — 7 modul (PTP, PTD, PUT, VUKA, STF, STT, SBN).",
          image: "", link: ""
        }
      ]
    },
    {
      id: "proyek", type: "cards", title: "Proyek", icon: "🚀", color: "#ef5d7a",
      items: [
        { title: "Werewolf Online", subtitle: "Game multiplayer 3D", period: "", desc: "Game social-deduction berbasis web dengan desa 3D, lobby, role card & chat. Vercel + Firebase.", tags: "Game, Web", image: "", link: "https://werewolfonline.vercel.app" },
        { title: "Merchant Radar", subtitle: "React + Node.js", period: "", desc: "Aplikasi pencari merchant memakai Google Places, OpenStreetMap/Overpass & Leaflet.", tags: "Web, Data", image: "", link: "" },
        { title: "MarketScope", subtitle: "Market screener", period: "", desc: "Screener multi-aset (kripto, forex, saham) real-time dengan indikator teknikal.", tags: "Trading, Web", image: "", link: "" },
        { title: "PANTAU", subtitle: "Dashboard pasar", period: "", desc: "Dashboard monitoring pasar untuk trader Indonesia dengan widget TradingView.", tags: "Trading, Data", image: "", link: "" }
      ]
    },
    {
      id: "galeri", type: "gallery", title: "Galeri Kehidupan", icon: "📸", color: "#3fb6e8",
      items: [
        { title: "Momen kerja", desc: "Upload foto lewat Admin", image: "" },
        { title: "Kegiatan", desc: "Upload foto lewat Admin", image: "" },
        { title: "Liburan", desc: "Upload foto lewat Admin", image: "" }
      ]
    },
    {
      id: "kontak", type: "contact", title: "Kontak & Dokumen", icon: "💌", color: "#ff7eb6",
      items: []
    }
  ],
  links: [
    { label: "LinkedIn", url: "https://www.linkedin.com/", icon: "💼" },
    { label: "GitHub", url: "https://github.com/riskidwisaputra78128", icon: "🐙" },
    { label: "Instagram", url: "https://www.instagram.com/", icon: "📷" }
  ],
  documents: [
    { label: "CV Lengkap (PDF)", url: "" }
  ]
};
