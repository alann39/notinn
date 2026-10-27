# Audit Pixel — Landing v2 vs `notinn-design.pen`

**Ground truth:** `Notinn - Redesign v2-export.html` (HTML export resmi dari pen, geometri absolut per layer) + `notinn-design.pen` (variable & aset).
**Live:** dev server di laptop, diukur di `clientWidth = 1440` (lebar desain).

---

## Ringkasan: 3 kelas masalah

| # | Masalah | Jumlah | Dampak |
|---|---|---|---|
| **A** | **Aset gambar desain tidak dipakai** | **9 slot** | Semua ilustrasi diganti gambar CSS buatan agent |
| **B** | **Font salah total** | 6 dari 6 peran | Semua teks pakai Manrope; desain pakai Geist + Paper Mono + Manrope |
| **C** | **Geometri menyimpang** | 10+ titik | Lebar konten, tinggi hero, grid, radius, tombol, dock |

---

## A. Aset gambar — semua hilang

Desain punya **9 image fill**. Live punya **`<img>` = 0, `<video>` = 0**. Semua diganti div bergaya CSS.

| # | Lokasi di desain | Aset | Ukuran | Live sekarang |
|---|---|---|---|---|
| 1 | `Hero > Brand > Logo` | `Notinn Logo - Background.png` | 30×30 contain | monogram "N" buatan |
| 2 | `How It Works > Card 01 > Illustration — Capture` | `notinn/step-01.png` | 341×196 contain | **div CSS** (`v2-illus__bubble` + waveform) |
| 3 | `How It Works > Card 02 > Illustration — Structure` | `notinn/step-02.png` | 341×196 contain | **div CSS** (`v2-illus__note` + garis) |
| 4 | `How It Works > Card 03 > Illustration — Utility` | `notinn/step-03.png` | 341×196 contain | **div CSS** |
| 5 | `Bento > Bento Row A > Dashboard Tile > Dash shot` | `notinn/dashboard.png` | 812×457 **cover** | skeleton + fade (kosong, tanpa gambar) |
| 6 | `Before After > Illustrated Bento > Card "You just had an idea" > Art` | `notinn/peep-idea.png` | 150×150 contain | kotak abu-abu kosong |
| 7 | `... Card "A meeting ends" > Art` | `notinn/peep-meeting.png` | 150×150 contain | kotak abu-abu kosong |
| 8 | `... Card "You need the source" > Art` | `notinn/peep-search.png` | 150×150 contain | kotak abu-abu kosong |
| 9 | `... Card "A quarter later" > Art` | `notinn/peep-later.png` | 150×150 contain | kotak abu-abu kosong |

**Status:** 9 file sudah disiapkan & di-upload ke `dashboard/public/landing/v2/` (617 KB total, sudah dioptimasi: `dashboard.png` tetap 1920×1080 untuk cover, step-* di-scale ke 2× display, peep-* native 256×256, logo 128×128).

> Catatan: `notinn/hero-bg-light.mp4` + `hero-bg-dark.mp4` ada di `public/landing/` tapi **tidak dipakai frame v2** — frame v2 tidak punya video fill. Jangan dipasang.

---

## B. Font — salah di semua peran

Desain pakai **3 font**: `Geist` (**77** teks), `Paper Mono` (**113** teks), `Manrope` (**26** teks) — total 216.
Live pakai **1 font**: `Manrope Variable` (semua 216).

| Peran | Desain | Live | Bukti |
|---|---|---|---|
| Semua judul besar (H1 62, H2 48, CTA 84) | **Geist medium (500)** | Manrope 500 | H1 "Notes that write themselves." |
| Semua isi paragraf | **Geist normal (400/500)** | Manrope | Hero sub, card body, FAQ |
| Semua label/eyebrow/mono (`(01)`, `02 — THE WEB DASHBOARD`, `NOTINN`, semua footer, harga) | **Paper Mono 400/600** | Manrope | 113 teks |
| Nav "Notinn.", pill "How it works", judul kartu BA, label CTA | **Manrope 600/700** | Manrope | hanya ini yang benar |

**Konsekuensi konkret:** H1 sekarang `fs=62px ls=-2.17px` — angka itu *kebetulan* sudah pas (lihat C5), tapi fontnya salah. `ls` di live juga konsisten `-0.176px` di mana-mana (itu tracking default Manrope Variable), padahal desain minta `-2.6px` di H1.

**Font file:** `Geist` & `Paper Mono` **tidak ada** di repo. `@fontsource-variable/geist` ada (Geist Variable = keluarga yang sama, weight variable) — cukup. `Paper Mono` tidak ada di mana pun.

**Tracking hilang:** live `ls=-0.176px` seragam — itu nilai default `--tracking` Manrope Variable, bukan nilai desain. Semua `tracking` di desain (dari `-3.6px` sampai `+6px`) tidak diterapkan.

---

## C. Geometri — 12 deviasi terukur

Diukur di `clientWidth = 1440`.

| # | Elemen | Desain | Live | Delta |
|---|---|---|---|---|
| C1 | **Lebar konten** | 1232 (`content-w`), kiri 104 | 1309, kiri 65.5 | **+77px**, padding 104 → 65.5 |
| C2 | **Hero tinggi** | 920 | 920 | OK |
| C3 | **Hero H1 x** | left 72 | 65.5 | −6.5 |
| C4 | **Hero H1 lebar** | 560 | 560 | OK |
| C5 | **Hero H1 size** | 62px / lh **67px** / ls −2.6 | 62px / lh 63.24 / ls −2.17 | lh −3.76, ls +0.43 |
| C6 | **Hero H1 y** | top 170 | 259 | **+89px** |
| C7 | **Hero CTA radius** | `9999px` (pill) | 12px | **salah bentuk** |
| C8 | **Hero CTA padding** | `0px 24px` / `0px 22px` | `0px 20px` | −4 / −2 |
| C9 | **Specimen Sheet** | 668×660, radius 6, shadow `0 24px 30px #0F172A1A` | 668×524.5, radius 18, tanpa shadow | **tinggi −135.5, radius +12** |
| C10 | **How It Works tinggi** | 898 | 898 | OK |
| C11 | **How card** | `#FF63081A` (oranye 10%), radius 20, pad 28, Top gap 24, Foot pad `14px 28px` bg `#0A0A0A08` | putih, radius 18, pad 24 | **warna & radius & pad salah** |
| C12 | **How illustration** | 341×196, absolute left 28 top 88 | 379.7×196 (ikut padding) | lebar +38.7, posisi beda |
| C13 | **Bento section bg** | `#F5F4F1` (`$surface-sunken`) | transparan (kelihatan putih) | **warna hilang** |
| C14 | **Bento grid gap** | 16 | 10 | **−6** |
| C15 | **Dashboard Tile** | 812×520, radius 20, outline `#E6E5E2` | 863.2×560.2, radius 18 | **+51 / +40** |
| C16 | **Search Tile** | h 252, pad `24px 22px`, radius 20, bg `#FF6308` | 275.1, pad `20px 24px 24px`, radius 18 | tinggi +23, radius −2 |
| C17 | **Section Transition** | linear-gradient 1440×120 | `background: #F9F8F6`, **gradient hilang** (`bgImg: none`) | **warna solid, bukan gradient** |
| C18 | **Receiver/Receipt** | 440, pad **28px**, radius 4, bg `#FFFDF9`, shadow `0 16px 32px #B4530933` | 440, pad `32px 32px 28px`, **radius 0**, bg putih, tanpa shadow | **4 properti salah** |
| C19 | **Closing CTA tinggi** | 520 | 543.5 | **+23.5** |
| C20 | **Closing CTA title** | 84px / lh 92.4 (`1.1`) / ls −3.6 | 84px / lh 85.68 / ls −1.68 | lh −6.7, ls +1.92 |
| C21 | **Footer title** | 48px / lh 52.8 / ls **−2** | 48px / lh 51.84 / ls **−0.176** | tracking salah |
| C22 | **Before/After card** | h 224, pad 24, gap 24, radius **20** | h 226, pad 24, gap 24, radius **18** | +2 / −2 |
| C23 | **BA art** | 150×150 contain | 176×176, bg `#F9F8F6`, radius 12 | **+26, kotak abu bukan gambar** |
| C24 | **Dock bar** | w 353, h 52, radius **20**, pad 6px 8px, gap 8, bg `#0B0B0AE6`, outline `#FFFFFF1F`, shadow `0 8px 24px #00000033` | w 317, h 54, radius **999px**, pad 6px, gap 2 | lebar −36, radius salah |
| C25 | **Dock item aktif** | 40×40, radius **13**, bg `#FF6308`, shadow `0 4px 10px #FF630840` | (tidak terukur, item lain) | perlu cek |
| C26 | **Marquee** | pad `0 24px`, gap 26, item 28px | pad 0, item 28px OK | padding hilang |

**Pola menyimpang yang konsisten:**

1. **Radius**: desain pakai **20px** untuk kartu/tile, **18px** dipakai live. Desain pakai **13px** untuk dock item, live pakai lingkaran penuh. Desain Specimen Sheet **6px**, live **18px**.
2. **Padding kontainer**: desain **104px** → live **65.475px** (`clamp(1.25rem, 4.5vw, 4.5rem)` = 72px max, dikurangi). Ini akar dari C1, C3, C15, C18.
3. **Line-height & tracking** tidak pernah dipakai dari desain — live pakai default font.
4. **Gradient** di Section Transition tidak diterapkan.
5. **Bento** kehilangan warna section.

---

## D. Yang sudah benar (jangan diubah)

- Urutan 11 section persis desain
- Tinggi Hero 920, Marquee 96, How It Works 898, Section Transition 120
- Hero H1 lebar 560, font-size 62px
- `#capture` / `#how-it-works` / `#dashboard` / `#pricing` / `#tags` / `#faq` semua fokus benar
- Tidak ada overflow horizontal di 1440
- Token warna benar (`--accent: #ff6308`, `--bg-subtle: #f9f8f6`)
- Isi teks 216 node sudah sesuai copy desain
- Marquee item 28px, warna `#0A0A0A` / dot `#FF6308` 7px

---

## E. Kontrak kerja (urut prioritas)

**Prioritas 1 — aset (dampak visual terbesar)**
9 slot gambar di tabel A. File sudah di `public/landing/v2/`. Pakai `<img>` dengan `object-fit: contain|cover`, `alt` yang benar, `width`/`height` eksplisit biar nggak CLS.

**Prioritas 2 — font**
1. Setup `Geist Variable` (sudah ada di `.landing-v2`) untuk judul + body.
2. `Paper Mono` — **template bukan milik kita**, hutang lisensi. Ganti ke **`Geist Mono`** (sudah ada di repo) sebagai mono teknis; minta lo konfirmasi.
3. Pasang `letter-spacing` per elemen dari tabel desain (`-2.6`, `-1.6`, `1.4`, `1.2`, `6`, dst) — sekarang semuanya `-0.176px`.
4. Pasang `line-height` dari desain (H1 `67px`, CTA `92.4px`, dll).

**Prioritas 3 — geometri**
1. `--v2-container: 1232px` + gutter `104px` (bukan 1440/65.5).
2. Radius kartu 18 → **20**; Specimen Sheet 6; Dock bar 20; Dock item 13.
3. Bento: bg `#F5F4F1`, grid gap 16.
4. Section Transition: gradient asli.
5. Receipt: pad 28, radius 4, bg `#FFFDF9`, shadow `0 16px 32px #B4530933`.
6. Tombol: radius 9999px, pad `0 24px` / `0 22px`.
7. Card BA: tinggi 224.
8. Marquee: padding `0 24px`.

---

## F. Yang gue butuh dari lo (blocker)

1. **Paper Mono** — mau lo beli lisensinya, atau ganti ke `Geist Mono` (gratis, sudah ada di repo)? Ini keputusan lo, bukan gue.
2. **Lebar konten 1232 + gutter 104** — konfirmasi lo setuju dikunci di angka desain, atau mau tetap fluid (max-width 1232, gutter `clamp()`)?

Sesudah dua itu, gue jalanin omp 3 tahap: aset → font → geometri, tiap tahap gue verifikasi ulang pakai pengukuran yang sama kayak audit ini.
