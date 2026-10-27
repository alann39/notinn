# Fix Batch 7 — 7 poin dari voice note user

Semua sudah diverifikasi terukur di live (clientWidth 1440). Bukan tafsiran.

---

## P1 — Live counter: data real, bukan placeholder

**Sekarang:** teks hardcoded `"1,284 notes today"`. Terukur: `.v2-live` text = `1,284 notes today`,
tidak ada fetch/state apa pun.

**Diminta:** angka real, jumlah notes yang benar-benar ada, update real-time saat ada note baru.

**Cara:**
1. Buat hook `useNoteCount()` di `dashboard/src/lib/` atau `src/hooks/`:
   - Query Supabase `notes` table: `select count` (pakai `head: true, count: 'exact'`).
   - Kalau RLS memblokir anon, pakai RPC count yang sudah ada, atau fallback ke
     nilai statis dengan komentar `// TODO: anon count RLS`.
2. Subscribe realtime: `supabase.channel('notes-count').on('postgres_changes',
   {event: 'INSERT', schema: 'public', table: 'notes'}, refetch)`.
3. Kalau user belum login / anon, tampilkan angka publik kalau ada; kalau tidak,
   **sembunyikan badge** (jangan tampilkan angka palsu).
4. Format `Intl.NumberFormat('en-US')` → `1,284`.
5. Teks: `{count} notes today` — kata `today` hanya kalau memang filter harian.
   Kalau total, ganti jadi `notes captured`.

**Jangan:** hardcode angka. Jangan bikin endpoint baru kalau RPC/query existing cukup.

**Verifikasi:** di console, ubah nilai (mock) → angka berubah tanpa reload. Kalau
tidak ada data, badge hidden (bukan `0 notes`).

---

## P2 — Specimen Sheet: "saved" kepotong

**Terukur sekarang:**
```
.v2-sheet__head       w 708  (content-box, 668 + 2×20 padding)
.v2-sheet__head-left  L 20   R 487  w 201
.v2-sheet__saved      L 646  R 20   w 42
```
Jadi `.v2-sheet__saved` **sudah** punya `right: 20` dan tidak terpotong menurut ukuran.
Tapi user melihatnya terpotong → kemungkinan `overflow: hidden` di `.v2-sheet` (radius 6)
memotong bagian atas, atau teks `saved` terlalu mepet tepi.

**Cek & fix:**
1. `.v2-sheet` `overflow: hidden` (perlu untuk radius) → pastikan `padding-top` tidak
   memotong. Kalau `Sheet head` menempel tepat di `top: 0` dan ada border radius 6,
   sudut atas akan memotong teks yang dekat tepi.
2. Tambah `border-radius: 6px 6px 0 0` di `.v2-sheet__head` supaya ikut radius induk,
   dan beri `padding-top` cukup.
3. Kalau masalahnya horizontal: `.v2-sheet__saved` sudah `right: 20`. Pastikan tidak ada
   `white-space: nowrap` + `text-overflow` yang memotong.

**Verifikasi:** `.v2-sheet__saved` fully visible, `getBoundingClientRect().right`
≤ `sheet.right - 20`, dan tidak ada `scrollWidth > clientWidth` di `.v2-sheet__head`.

---

## P3 — Bento: spacing/alignment masih berantakan

**Terukur sekarang (semua tile `justify-content: space-between`, `gap: 0`):**

| Tile | Anak | Tinggi anak | Masalah |
|---|---|---|---|
| Search | label 16 / field 36 / title 18 / body 42 / citations 20 / hint 21 | `hint` punya `margin-top: 51px` | jarak anak tidak konsisten, `hint` di-push manual |
| Ask | label 16 / bubble 40 / answer 21 / title 21 | `title` punya `margin-top: 106px` | **gap 106px** — jelas berantakan |
| Formats | label 16 / chips 61 / title 18 / body 42 | | chips terlalu tinggi (61) |
| Voice | label 16 / wave 56 / time 16 / title 25 / body 42 | | title 25 tinggi (19px font) |

**Akar:** `justify-content: space-between` + `margin-top` manual bikin jarak antar-anak
tidak terprediksi. Desain `.pen`: tiap tile `justifyContent: space_between` dengan
`padding: 24px 22px`, jadi jarak **dihitung otomatis merata**, bukan `margin-top` hardcoded.

**Fix:**
1. **Hapus semua `margin-top` hardcoded** di anak tile (51px di `.v2-tile__hint`,
   106px di `.v2-tile__title--foot`, dan sejenisnya).
2. Ganti pola jadi **dua grup**: `.v2-tile__top` (label + konten atas) dan
   `.v2-tile__bottom` (title + body), dengan `justify-content: space-between` di tile
   dan `gap` internal per grup.
3. Gap dalam grup: `6px` antar label→konten, `8px` antar title→body. Konsisten di
   keempat tile.
4. Kalau belum ada wrapper grup, tambahkan di markup (`<div class="v2-tile__top">` /
   `<div class="v2-tile__bottom">`).

**Verifikasi:** tidak ada `margin-top` > 0 di anak langsung `.v2-tile*`; jarak
label→konten sama (6px) dan title→body sama (8px) di Search/Ask/Formats/Voice.

---

## P4 — Chips format (Voice/PDF/Image/DOCX): jangan hug content, samakan lebar

**Terukur sekarang:**
```
.v2-chips   w 360  gap 6  (parent 404, padding 24/22 → content 360)
.v2-chip    w: [54, 37, 54, 46]   padding: 12px 6px   flex: 0 1 auto
```
Lebar beda-beda (54/37/54/46) karena `flex: 0 1 auto` → hug content.

**Diminta:** semua chip lebar sama, dan totalnya mengisi satu baris penuh.

**Fix:**
```css
.v2-chips { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.v2-chip  { width: 100%; }   /* atau flex: 1 1 0 */
```
Hasil: tiap chip = `(360 − 3×6) / 4 = 85.5px`, keempatnya sama, mengisi penuh.

**Verifikasi:** keempat `.v2-chip` `getBoundingClientRect().width` identik
(toleransi 1px), dan total `4×w + 3×gap == .v2-chips` width.

---

## P5 — File rows (Brief/Roadmap/Sync di Export tile): samakan juga

**Terukur sekarang:** `.v2-file-row` w = `[62, 79, 56]` — hug content.

**Fix:** sama seperti P4 — grid 3 kolom sama lebar, atau `flex: 1 1 0`:
```css
.v2-file-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.v2-file-row  { width: 100%; }
```
Hasil: `(360 − 2×6) / 3 = 116px` masing-masing.

**Verifikasi:** ketiga `.v2-file-row` width identik.

---

## P6 — Ukuran judul tile tidak konsisten

**Terukur sekarang:**

| Tile | Judul | fontSize |
|---|---|---|
| Voice | "Speak it. It's written." | **19px** |
| Formats | "Every format, one result" | **14px** |
| Export | "Notes that keep working" | **14px** |
| Search | "Full-text & semantic search" | **14px** |
| Ask | "300 Ask queries / month" | **14px** |

User: "yang speak it, it's written lebih gede dari notes that keep working" → minta **disamakan**.

**Fix:** samakan semua `.v2-tile__title` jadi **14px / 500 / lh 21px**, termasuk Voice.
Hapus modifier `.v2-tile--voice .v2-tile__title { font-size: 19px }` kalau ada.

**Verifikasi:** `getComputedStyle` semua `.v2-tile__title` → fontSize `14px`, fontWeight `500`,
lineHeight `21px`. Tidak ada satu pun 19px.

---

## P7 — FAQ Pricing: jadi accordion

**Terukur sekarang:** `.v2-faq` punya 5 item, **semua jawaban terbuka**, `details` = 0.

**Diminta:** accordion — jawaban tertutup default, biar ada curiosity.

**Fix:** pakai `<details>` / `<summary>` native (paling aman, a11y gratis, tanpa JS):

```tsx
<details className="v2-faq__item">
  <summary className="v2-faq__q">
    <span>{q}</span>
    <ChevronDown aria-hidden="true" className="v2-faq__chev" />
  </summary>
  <div className="v2-faq__a"><p>{a}</p></div>
</details>
```

CSS:
```css
.v2-faq__q { cursor: pointer; list-style: none; display: flex; justify-content: space-between; align-items: center; }
.v2-faq__q::-webkit-details-marker { display: none; }
.v2-faq__chev { transition: transform 180ms ease; }
details[open] .v2-faq__chev { transform: rotate(180deg); }
.v2-faq__a { padding-top: 8px; }
@media (prefers-reduced-motion: reduce) { .v2-faq__chev { transition: none; } }
```

Ketentuan:
- Default **semua tertutup** (`open` tidak di-set).
- Satu item terbuka tidak menutup yang lain (bukan exclusive) — atau kalau mau exclusive,
  pakai `name="faq"` attribute (native exclusive accordion, Chrome 120+).
  **Rekomendasi: non-exclusive**, lebih jarang bikin frustrasi.
- `<summary>` harus fokusable (native sudah), keyboard Enter/Space jalan.
- `aria-expanded` tidak perlu ditambah — `details` sudah handle.

**Verifikasi:** `document.querySelectorAll('.v2-faq details[open]').length === 0` saat load;
klik summary pertama → `open` jadi 1; jumlah item tetap 5.

---

## URUTAN KERJA

1. **P6** (font size) — paling cepat, satu nilai.
2. **P4 + P5** (chip & file row sama lebar) — grid.
3. **P3** (hapus margin-top, grup top/bottom) — paling berisiko, kerjakan setelah P4/P5.
4. **P7** (accordion).
5. **P2** (saved terpotong).
6. **P1** (data real) — terakhir, karena butuh Supabase.

## VERIFIKASI

```
npx tsc --noEmit                                             -> exit 0
npm run build:client                                         -> PASS
npx eslint src/components/landing/v2 src/app/landing-page.tsx -> exit 0
```

Ukur di dev server `clientWidth = 1440` (print dulu, kalau bukan 1440 stop):

- `.v2-chip` width: **keempat sama** (±1px), total = `.v2-chips` width
- `.v2-file-row` width: **ketiga sama** (±1px)
- semua `.v2-tile__title` fontSize = **14px**, fontWeight 500, lineHeight 21px
- tidak ada anak langsung `.v2-tile*` dengan `margin-top > 0`
- `.v2-faq details` count = **5**, `details[open]` count = **0** saat load
- `.v2-sheet__saved` right ≤ `sheet.right − 20`, tidak terpotong
- `.v2-live` text **bukan** `1,284 notes today` hardcoded (dari state/fetch)

## LARANGAN

- Jangan ubah warna, radius, font family, aset, anchor, barcode, ticker, Pricing mirror,
  Receipt rotate, F2 CTA.
- Jangan sentuh Cornell / `tsconfig.json` / halaman dashboard-notes-admin-legal.
- Jangan pakai GSAP. Motion hanya Framer Motion (accordion pakai CSS transition, itu boleh).
- Jangan pakai angka palsu untuk live counter — kalau data tidak ada, sembunyikan.
