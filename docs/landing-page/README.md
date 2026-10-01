# Notinn landing page

Dokumentasi ini adalah sumber keputusan untuk landing page publik Notinn. Scope saat ini adalah spesifikasi dan handoff. Implementasi UI belum termasuk.

## Tujuan

Landing page harus menjelaskan satu hal dalam beberapa detik:

> Kirim bahan mentah ke Notinn lewat Telegram, lalu terima catatan terstruktur yang bisa disimpan dan ditemukan kembali.

Konversi utama adalah membuka private chat bot Telegram. Landing page bukan pengganti bot, dashboard, halaman billing, atau dokumentasi produk.

## Dokumen

| Dokumen                                          | Isi                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| [PRODUCT_UX_BRIEF.md](PRODUCT_UX_BRIEF.md)       | Sasaran, audiens, positioning, alur, arsitektur informasi, dan batas scope           |
| [REFERENCE_RESEARCH.md](REFERENCE_RESEARCH.md)   | Referensi visual dan pola yang dipilih atau ditolak                                  |
| [CONTENT_SPEC.md](CONTENT_SPEC.md)               | Copy Bahasa Indonesia, urutan section, FAQ, dan batas klaim                          |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)             | Arah visual, token, tipografi, layout, komponen, aset, dan motion                    |
| [IMPLEMENTATION_SPEC.md](IMPLEMENTATION_SPEC.md) | Route, struktur komponen, SEO, performa, analytics, keamanan, dan delivery plan      |
| [QA_ACCEPTANCE.md](QA_ACCEPTANCE.md)             | Kriteria penerimaan, accessibility, responsive, browser, content, dan release checks |

## Keputusan utama

1. **Page type:** single-page product landing dengan alur naratif, bukan homepage korporat atau daftar fitur generik.
2. **Primary CTA:** `Buka Notinn di Telegram` menuju `https://t.me/NotinnBot`.
3. **Primary proof:** demo sebelum dan sesudah dengan data sintetis. Tidak memakai testimonial, logo pelanggan, jumlah pengguna, atau statistik yang belum memiliki sumber.
4. **Visual thesis:** editorial notebook berwarna warm paper dan ink, dipadukan dengan produk digital yang presisi. Brand hitam-putih dipertahankan; kuning highlighter hanya menandai hasil transformasi.
5. **Macrostructure:** narrative workflow dengan feature stack. Hero asimetris, demo transformasi, alur 3 langkah, use-case editorial, privacy, FAQ, dan CTA penutup.
6. **Language:** Bahasa Indonesia sebagai default. Struktur disiapkan untuk English tanpa fixed-width text container.
7. **Availability:** status `Closed Alpha` harus terlihat. Jangan menjanjikan akses publik, trial, harga, uptime, atau kuota yang belum menjadi keputusan publik.
8. **Pricing:** tidak ditampilkan pada versi Closed Alpha. Nilai plan adalah konfigurasi database dan tidak boleh disalin menjadi angka statis pada marketing page.
9. **Privacy:** copy harus konsisten dengan `docs/PRIVACY_NOTICE.md`, termasuk batas Telegram dan AI provider.
10. **Implementation home:** route publik `/` di aplikasi Vite yang sudah ada; dashboard tetap di `/notes`.

## Sumber produk

- `docs/Master_Blueprint.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/PRIVACY_NOTICE.md`
- `docs/TERMS_OF_SERVICE.md`
- `docs/ADR/0019-web-dashboard-auth.md`
- `dashboard/src/index.css`
- `dashboard/src/app/router.tsx`
- `brand/`

## Definisi selesai

Dokumentasi dianggap siap implementasi ketika:

- setiap section memiliki tujuan, copy, pola layout, dan state responsive;
- semua klaim dapat dilacak ke kontrak produk;
- CTA, event analytics, metadata, dan route jelas;
- token warna memiliki hasil contrast terukur;
- acceptance criteria dapat diverifikasi di browser;
- tidak ada placeholder testimonial, metrik, harga, atau produk palsu.
