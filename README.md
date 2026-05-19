# MD Reader 📖

MD Reader adalah aplikasi pembaca Markdown (.md) desktop yang sangat ringan, cepat, dan modern. Dibangun menggunakan **Neutralino.js**, aplikasi ini menawarkan performa tinggi dengan ukuran file binary yang sangat kecil dibandingkan dengan alternatif berbasis Electron.

Aplikasi ini mendukung berbagai fitur lanjutan seperti manajemen tab, rendering gambar lokal, penyorotan sintaksis kode (syntax highlighting) dengan tombol salin otomatis, serta dukungan pintasan keyboard.

---

## 🚀 Fitur Utama

- **Tab Management**: Buka hingga 10 file Markdown secara bersamaan. Posisi scroll Anda akan tetap dipertahankan saat berpindah tab.
- **Drag and Drop**: Buka file secara instan dengan menyeret file `.md` atau `.markdown` langsung ke dalam jendela aplikasi.
- **Dual View Mode**: Beralih dengan mudah antara mode **Preview** (tampilan terjemahan Markdown) dan mode **Raw** (teks mentah Markdown dengan fitur salin satu klik).
- **Recent Files Sidebar**: Akses cepat ke riwayat file yang baru saja dibuka. Riwayat ini secara dinamis memverifikasi keberadaan file di penyimpanan Anda.
- **Local Image Rendering**: Mendukung tampilan gambar lokal dengan jalur relatif maupun absolut langsung di dalam dokumen Markdown Anda.
- **Advanced Code Blocks**: Dilengkapi dengan *Syntax Highlighting* menggunakan Highlight.js dan tombol *Copy to Clipboard* pada setiap blok kode.
- **Keyboard Shortcuts**: Navigasi cepat dengan shortcut standar (buka file, tutup tab, navigasi tab).
- **Asosiasi File Sistem**: Terintegrasi dengan argumen CLI sistem, memungkinkan Anda menjadikan MD Reader sebagai aplikasi default untuk membuka file `.md` langsung dari File Explorer.

---

## ⌨️ Pintasan Keyboard (Shortcuts)

| Shortcut | Aksi |
| :--- | :--- |
| `Ctrl + O` | Membuka dialog pencarian file untuk memuat dokumen baru |
| `Ctrl + W` | Menutup tab aktif yang sedang dibuka |
| `Ctrl + Tab` | Berpindah ke tab berikutnya (kanan) |
| `Ctrl + Shift + Tab` | Berpindah ke tab sebelumnya (kiri) |

---

## 🛠️ Stack Teknologi

Aplikasi ini dibangun menggunakan teknologi web standar dengan wrapper native ultra-ringan:

1. **Core**: HTML5, Vanilla CSS3 (desain gelap bergaya Glassmorphic modern), dan Vanilla JavaScript (ES6+).
2. **Native Runtime**: [Neutralino.js](https://neutralino.js.org/) — Alternatif Electron yang super ringan.
3. **Libraries**:
   - [Marked.js](https://marked.js.org/) — Parser Markdown yang cepat dan patuh standar.
   - [Highlight.js](https://highlightjs.org/) — Pewarnaan sintaksis kode yang indah (Tema: GitHub Dark).

---

## 💻 Cara Menjalankan & Mengembangkan

### Persyaratan Sistem
Pastikan Anda sudah menginstal Node.js dan [Neutralinojs CLI](https://neutralino.js.org/docs/cli/neu-cli) (`neu`) secara global:

```bash
npm install -g @neutralinojs/neu
```

### Langkah-langkah Memulai

1. **Clone Repositori**:
   ```bash
   git clone https://github.com/Rianrev/md_reader.git
   cd md_reader
   ```

2. **Download Binary Engine**:
   Unduh binary engine Neutralinojs yang sesuai untuk sistem operasi Anda:
   ```bash
   neu update
   ```

3. **Jalankan Aplikasi dalam Mode Pengembangan**:
   ```bash
   neu run
   ```

---

## 📦 Cara Membuat Build Produksi

Untuk mengemas aplikasi menjadi aplikasi desktop standalone (.exe untuk Windows, app bundle untuk macOS, atau binary untuk Linux), jalankan perintah berikut:

```bash
neu build
```

Hasil build akan tersimpan di dalam folder `dist/` dalam bentuk siap didistribusikan.

---

## 📝 Lisensi

Proyek ini dilisensikan di bawah lisensi MIT. Silakan gunakan, modifikasi, dan distribusikan kembali sesuai kebutuhan Anda.
