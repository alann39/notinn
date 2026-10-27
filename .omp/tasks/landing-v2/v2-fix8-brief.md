# Fix Batch 8 — 5 poin dari voice note user

Semua sudah diverifikasi terukur di live (clientWidth 1440) dan dibandingkan ke `.pen`.

---

## P1 — Grid background Hero & CTA tidak penuh (cuma 1 arah)

**Keluhan:** "kotak-kotaknya gak sempurna, kayak cuma satu garis doang. Yang di hero
cuma ada horizontal, yang di CTA cuma ada vertical. Tolong dibenerin biar kotak-kotaknya full."

**Fakta dari `.pen`:**

| Section | VRule | HRule |
|---|---|---|
| `Hero > Grid` | **12** (x: 52,176,300,424,548,672,796,920,1044,1168,1292,1416) | **4** (y: 88, 300, 620, 860) |
| `Closing CTA > Grid` | **12** (x: 0,124,248,372,496,620,744,868,992,1116,1240,1364 relatif ke x=52) | **0** |

Catatan penting: **CTA di desain memang TIDAK punya HRule.** Jadi "cuma vertical"
di CTA itu **sesuai desain**. Tapi user minta kotaknya "full". Karena user adalah
sumber kebenaran terakhir, tambahkan HRule di CTA juga supaya jadi kotak penuh —
tapi **lakukan konsisten**: kalau CTA dapat HRule, hero juga harus punya HRule
yang rapat membentuk kotak (sekarang cuma 4 garis horizontal jarang).

**Kondisi live sekarang:**
```
.v2-hero__grid  : repeating-linear-gradient(to right, ...124px)  ← vertikal OK
                + 4 lapis linear-gradient horizontal (statis, jarak 88/300/620/860)
.v2-cta__grid   : repeating-linear-gradient(to right, ...8.33333%) ← vertikal saja
```

**Fix:**
1. **Hero**: ganti 4 lapis `linear-gradient` horizontal statis jadi satu
   `repeating-linear-gradient(to bottom, ...)` dengan pitch sama seperti vertikal
   (124px), supaya membentuk grid kotak seragam.
2. **CTA**: tambah `repeating-linear-gradient(to bottom, ...)` dengan pitch
   `100% / 12` = 8.33333% (sama dengan vertikal), supaya kotaknya penuh.
3. Warna garis tetap `rgba(10, 10, 10, 0.04)` — jangan diubah.
4. Jangan pakai SVG atau border per sel; tetap CSS gradient (sudah pola yang dipakai).

**Verifikasi:** `getComputedStyle(el).backgroundImage` mengandung **dua**
`repeating-linear-gradient` — satu `to right`, satu `to bottom` — untuk kedua
`.v2-hero__grid` dan `.v2-cta__grid`.

---

## P2 — FAQ accordion: gap antar item harus nempel, baru turun saat dibuka

**Keluhan:** "itu kan ada gap ya antara satu question lainnya. Gapnya ditempel aja,
ketika dibuka baru turun dia. Jadi gak dari awal udah ada gapnya."

**Kondisi live sekarang:**
```
.v2-faq        : display flex, gap 0
.v2-faq details: h 132px (semua), padding 20px 0, border 1px solid rgba(255,99,8,.2)
                 margin 0 / -0.5px
```

**Masalah:** semua `details` **sudah tertutup** tapi tingginya **132px** — itu
terlalu tinggi untuk item tertutup yang cuma berisi `<summary>` 21px + padding 40px
= 61px. Berarti jawaban masih menyumbang tinggi (mungkin `min-height` dari batch
sebelumnya, atau `<div class="v2-faq__a">` tidak di-hide).

**Fix:**
1. Saat `details` **tertutup**, tinggi item = `summary height + padding` saja.
   Pastikan `.v2-faq__a` benar-benar tidak mengambil ruang saat tertutup.
   Native `details` sudah otomatis hide non-summary children — **kecuali** kalau
   ada CSS yang memaksa `display: block` di `.v2-faq__a`. Cek dan hapus.
2. **Hapus `min-height`** yang bikin item tertutup tetap 132px.
3. Item harus **nempel**: `gap: 0` (sudah), dan tidak ada `margin` antar item
   selain border pemisah.
4. Saat dibuka, jawaban **turun** mendorong item di bawahnya. Animasi halus:

```css
.v2-faq__a {
  overflow: hidden;
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 220ms ease;
}
details[open] .v2-faq__a { grid-template-rows: 1fr; }
.v2-faq__a > div { min-height: 0; overflow: hidden; }
@media (prefers-reduced-motion: reduce) {
  .v2-faq__a { transition: none; }
}
```

**Catatan:** `grid-template-rows: 0fr → 1fr` itu teknik animasi height tanpa JS
dan tanpa `max-height` hardcoded. Kalau browser target nggak support (Safari < 16),
fallback ke `max-height` transisi — tapi cek dulu `browserslist` repo.

5. **Verifikasi kunci:** tinggi item tertutup harus **~61px** (summary 21 + padding
   40), bukan 132px. Setelah diklik, tinggi naik dan item di bawahnya bergeser turun.

---

## P3 — Dock navigasi: tambah tooltip nama section

**Keluhan:** "didock navigasi, tambahin tooltip untuk nama-nama section-nya biar
muncul tooltip-nya, biar tau ini kemana."

**Kondisi live sekarang:**
```
7 item, semuanya: aria-label=null, title=null, hasTooltip=false
href: #capture, #how-it-works, #dashboard, #tags, #faq, t.me/NotinnBot, /notes
text: "Capture", "Structure", "Retrieve", "Tags", "FAQ", "Open Notinn in Teleg...", "Open the web dashboa..."
```

**Fix:** tooltip yang **muncul saat hover & focus**, pakai CSS (tanpa JS library):

```tsx
<a className="v2-dock__item" href="#capture" aria-label="Capture — bagian atas halaman">
  <Icon aria-hidden="true" />
  <span className="v2-dock__tip" role="tooltip">Capture</span>
</a>
```

```css
.v2-dock__item { position: relative; }
.v2-dock__tip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%) translateY(4px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 140ms ease, transform 140ms ease;
  white-space: nowrap;
  background: var(--surface-dark);
  color: var(--on-dark);
  border: 1px solid var(--border-dark);
  border-radius: 8px;
  padding: 6px 10px;
  font-family: var(--font-v2-mono);
  font-size: 12px;
}
.v2-dock__item:hover .v2-dock__tip,
.v2-dock__item:focus-visible .v2-dock__tip {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
@media (prefers-reduced-motion: reduce) {
  .v2-dock__tip { transition: none; }
}
```

Ketentuan:
- Tooltip harus **muncul di hover DAN focus** (keyboard user juga perlu).
- `role="tooltip"` + `aria-label` di link (aria-label lebih ringkas dari tooltip text).
- `pointer-events: none` supaya tooltip nggak menghalangi klik.
- Jangan pakai `title` attribute saja — lambat muncul, nggak bisa di-style.
- Posisi: di atas dock (dock ada di bawah viewport).
- Label per item: `Capture`, `How it works`, `Dashboard`, `FAQ`, `Open in Telegram`,
  `Web dashboard` — **tanpa** item Tags (lihat P4).

---

## P4 — Hapus item "Tags" dari dock

**Keluhan:** "untuk tags itu hilangin aja deh kayaknya, gak perlu ada tags."

**Fix:** hapus item `href="#tags"` dari `.v2-dock` — **seluruh elemen `<a>`**,
bukan cuma labelnya.

**Perhatian:** `#tags` masih dipakai sebagai anchor di specimen sheet
(`.v2-sheet__tags` punya `id="tags"`). Jangan hapus id-nya, cukup hapus link dock-nya.
Kalau ada link lain yang mengarah ke `#tags` (footer, dsb), laporkan — jangan
dihapus tanpa konfirmasi.

**Verifikasi:** jumlah item dock = **6** (dari 7), dan `#tags` tidak ada di
`document.querySelectorAll('.v2-dock a')`.

---

## URUTAN KERJA

1. **P4** (hapus Tags) — paling kecil.
2. **P3** (tooltip) — setelah P4 supaya label final.
3. **P1** (grid background) — CSS murni.
4. **P2** (FAQ nempel) — perlu cek kenapa item tertutup 132px.

## VERIFIKASI

```
npx tsc --noEmit                                             -> exit 0
npm run build:client                                         -> PASS
npx eslint src/components/landing/v2 src/app/landing-page.tsx -> exit 0
```

Ukur di dev server `clientWidth = 1440` (print dulu):

- `.v2-hero__grid` `backgroundImage` mengandung **2** `repeating-linear-gradient`
  (satu `to right`, satu `to bottom`)
- `.v2-cta__grid` idem, **2** `repeating-linear-gradient`
- `.v2-faq details` (tertutup) tinggi **≈61px**, bukan 132px; semua 5 item sama
- klik summary pertama → tinggi item itu naik, item di bawahnya bergeser turun
- `.v2-dock a` count = **6**, tidak ada `href="#tags"`
- setiap `.v2-dock a` punya `.v2-dock__tip` dan `aria-label` tidak null
- hover/focus satu item → `.v2-dock__tip` `opacity` jadi `1`
- `.v2-sheet__tags` masih punya `id="tags"` (jangan sampai kehapus)

## LARANGAN

- Jangan ubah warna garis grid (`rgba(10,10,10,0.04)`).
- Jangan hapus `id="tags"` dari specimen sheet.
- Jangan sentuh font, radius, aset, barcode, ticker, Pricing mirror, Receipt rotate,
  F2 CTA, live counter.
- Jangan sentuh Cornell / `tsconfig.json`.
- Jangan pakai GSAP. Tooltip & accordion pakai CSS transition — itu boleh.
