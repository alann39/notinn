# Landing v2 Rebuild — Brief untuk omp

Dokumen ini menggantikan landing page Notinn yang lama. Sumber kebenaran desain: frame `Notinn — Redesign v2` dari `notinn-design.pen`.

**File pendamping (wajib dibaca sebelum ngoding):**
- `.omp/tasks/landing-v2/v2-outline.md` — pohon layer lengkap per section, sudah dianotasi token warna + ukuran + ikon lucide.
- `.omp/tasks/landing-v2/v2-copy.md` — semua 216 teks dari desain, urut per section. **Nggak boleh ngarang copy.**

---

## 1. Target

> **Penting soal working dir:** omp dijalankan dengan `--cwd` = root repo (`notinn/`), sumber ada di `dashboard/src/...`. Semua perintah npm harus dijalankan di dalam `dashboard/` — pakai `npm --prefix dashboard run build:client` atau `cd dashboard && npm run ...`. Jangan jalanin npm di root repo (itu package.json punya bot Telegram, bukan web).

- Repo: `dashboard/` (Vite 6 + React 19 + TypeScript + Tailwind v4 + react-router-dom 7)
- Yang diganti: `src/app/landing-page.tsx`, komponen di `src/components/landing/`, `src/styles/landing.css`, `src/styles/prisma-hero.css`
- Bahasa desain lama (paper/ink, `--highlight-400: #f4c84a`) **dibuang**. Bahasa desain baru = palette Notinn v2 (di bawah).

## 2. Urutan Section (persis dari desain, 1440 lebar)

| # | Section | Tinggi | Node | Isi |
|---|---|---|---|---|
| 0 | Hero | 920 | 95 | Nav `Notinn.` + badge live `1,284 notes today`, H1, sub, 2 CTA, mock Specimen Sheet `note_2026-10-21.md`, Index list `(01)(02)(03)` |
| 1 | Input Marquee — Editorial | 96 | 25 | 12 pasang `text + ellipse` (dot pemisah), loop horizontal |
| 2 | How It Works | — | 47 | 24 frame, 15 teks, 8 ikon |
| 3 | Bento | — | 114 | grid bento, 37 rectangle, 36 teks, 10 ikon |
| 4 | Before After | — | 79 | 40 frame, 12 ikon, 8 rectangle |
| 5 | Section Transition (Pricing → Closing CTA) | 120 | 1 | frame transisi, muncul 2x |
| 6 | Pricing L2 — Receipt | 980 | 134 | gaya struk/receipt |
| 7 | Section Transition | 120 | 1 | sama seperti #5 |
| 8 | Closing CTA | 520 | 38 | 12 rectangle, 8 teks, 6 ikon |
| 9 | Footer | — | 89 | 45 teks, 25 frame |
| 10 | Viewport Overlay — fixed dock | 6241 | 23 | **fixed/sticky**, bukan section biasa |

## 3. Token Mapping (WAJIB — jangan hardcode hex)

Tailwind v4: token didefinisikan di `src/index.css`. Pakai semantic token, bukan hex literal di JSX.

| Hex di desain | Token |
|---|---|
| `#0A0A0A` | `--text-primary` |
| `#0A0A0A0A` | `--ink-hover` (base #0A0A0A + alpha) |
| `#FF6308` | `--accent` |
| `#FF630833` | `--accent-line-soft` |
| `#FFFFFF` | `--bg` / `--on-dark` |
| `#FFFFFF1F` | `--border-dark` |
| `#FFFFFF99` | `--on-dark-label` |
| `#5B5B5B` | `--body` |
| `#3D3D3D` | **→ `--text-primary`** (digabung, jangan bikin token baru) |
| `#A7A7A7` | `--text-muted` |
| `#E6E5E2` | `--border` |
| `#F2F1EF` | `--bg-muted` |
| `#F9F8F6` | `--bg-subtle` |
| `#B45309` | `--accent-ink` |
| `#28C840` | `--success` |
| `#0B0B0A` | `--surface-dark` |
| `#767270` | `--label` |
| `#7D8187` | `--text-tertiary` |
| `#FEBC2E` | `--warning` |
| `#C7C4BE` | `--border-strong` (token baru) |
| `#FFF4EC` | `--accent-surface-soft` (token baru) |

Ketentuan:
- Tambahkan token baru hanya kalau memang belum ada di `src/index.css`. Sebelum bikin, cek dulu.
- **Tidak boleh ada hex baru yang nggak ada di tabel ini.** Kalau ketemu warna lain di outline, tulis di laporan sebagai `NGGAK KETEMU` dan pakai token terdekat.

## 4. Aturan Keras

1. **Motion: Framer Motion saja.** `gsap` ada di `package.json` tapi DILARANG di landing baru. Jangan campur dua engine. Pakai `framer-motion` (`motion` package jangan — pilih satu).
2. **Ikon: `lucide-react`.** Desainnya pakai ikon lucide (lihat `icon=<nama>(lucide)` di outline). Jangan gambar SVG manual.
3. **Font:** desain pakai **Manrope**. `@fontsource-variable/manrope` sudah terinstall. Geist & Newsreader tetap ada buat halaman lain — jangan diubah.
4. **Jangan sentuh** halaman dashboard/notes/admin/settings/legal, `src/app/router.tsx` (kecuali kalau perlu — lapor dulu), Supabase client, RLS, atau skema DB.
5. **Jangan hapus** `src/components/landing/*` yang lama dan `landing.css`/`prisma-hero.css` sampai halaman baru lolos build. Hapus di akhir, setelah verifikasi.
6. **A11y yang sudah ada wajib dipertahankan:** `skip-link`, `id="main-content"` + `tabIndex={-1}`, `applyPageMetadata({lang, robots})`, focus hash target.
7. **Layer spacer** yang di desain dinamai satu huruf (`w`, `t`, `x`, `l`, `c`, `n`, `k`, `v`, `sp`, `sp2`, `sp3`) itu hasil geser manual. Konversi jadi `gap`/`padding` flex. **Jangan bikin `<div>` kosong per layer.**
8. **Pola berulang wajib jadi komponen**, jangan duplikasi:
   - `fname` + `ext` + `arw` (3x) → `FileRow`
   - `text` + `ellipse` di marquee (12x) → `MarqueeItem`
   - `Big Num` + `Label` + `Body` + `Foot` (3x) → `StatBlock`
   - `Head Row` + `Top` + `Meta` (3x) → `SectionHeader`
   - `Section Transition` (2x identik) → `SectionTransition`
   - `Dock Shell — progressive blur` → `FloatingDock` (fixed, nav bawah)
9. **Responsive:** desain 1440 desktop. Bikin turunan mobile/tablet yang waras (bukan sekadar di-shrink). Breakpoint Tailwind default.
10. **No `any`.** TypeScript strict lolos `tsc --noEmit`.

## 5. Struktur File yang Diminta

```
src/app/landing-page.tsx                  ← compose section
src/components/landing/v2/
    hero.tsx
    input-marquee.tsx
    how-it-works.tsx
    bento.tsx
    before-after.tsx
    section-transition.tsx
    pricing-receipt.tsx
    closing-cta.tsx
    footer.tsx
    floating-dock.tsx
    primitives/
      file-row.tsx
      marquee-item.tsx
      stat-block.tsx
      section-header.tsx
src/styles/landing-v2.css                 ← token + style khusus landing
```

Boleh nambah file kalau memang perlu (misal `specimen-sheet.tsx` buat mock hero) — tapi tetap di dalam `v2/`.

## 6. Verifikasi (wajib, jangan klaim tanpa jalan)

```
npm run lint          → harus bersih
npm run build:client  → tsc --noEmit + vite build harus lolos
```

Build harus lolos **sebelum** lapor selesai. Kalau ada error, perbaiki dulu, jangan lapor "hampir selesai".

## 7. Tahapan (jangan kerjain semua sekaligus)

**Tahap 1 — fondasi + Hero.** Token di `index.css`, `landing-v2.css`, primitives, `landing-page.tsx` baru yang cuma render Hero + FloatingDock (placeholder sisanya). Lolos `npm run build:client`. Lapor + berhenti.
**Tahap 2 — Input Marquee + How It Works + Bento.** Lolos build. Lapor + berhenti.
**Tahap 3 — Before After + Section Transition + Pricing.** Lolos build. Lapor + berhenti.
**Tahap 4 — Closing CTA + Footer + FloatingDock final + hapus file lama.** Lolos build + lint. Lapor.

## 8. Laporan yang Diminta

Setiap tahap selesai, tulis `.omp/tasks/landing-v2/progress.md` (append, jangan overwrite):

```
## Tahap N — <selesai/tidak>
- File dibuat/diubah: <path>
- Token baru ditambahkan: <nama → hex>
- Warna NGGAK KETEMU: <hex> → dipetakan ke <token>
- Asumsi yang diambil: <...>
- Build: PASS/FAIL (<command>)
- Sisa/blocker: <...>
```
