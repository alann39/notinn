# v2 PIXEL-PERFECT — Brief FIX untuk omp

Audit lengkap: `v2-pixel-audit.md`. Kontrak mentah per layer: `v2-pixel-contract.md` (1.288 baris, dari pen HTML export).
**Semua angka di brief ini berasal dari `notinn-design.pen` + `Notinn - Redesign v2-export.html` (export resmi pen).** Kalau ada beda antara brief dan file itu, file itu yang benar.

---

## KEPUTUSAN USER (jangan diubah)

1. **Font mono = paper mono, NET (BUKAN Geist Mono).** Paper Mono itu OFL-1.1 (verified dari metadata font: `SIL Open Font License, Version 1.1`, designer Guido Ferreyra dkk, vendor paper.design). Sudah di-upload ke repo. Pakai font desain apa adanya.
2. **Layout konten = FLUID** (max-width 1232, bukan kaku 1232). Lihat §3.

## ASET & FONT YANG SUDAH DI-upload (jangan download/fetch ulang)

```
dashboard/public/landing/v2/
  notinn-logo.png    128x128      (display 30x30, contain)
  dashboard.png      1920x1080    (display 812x457, cover)  <- asli, jangan resize
  step-01.png        480x392      (display 341x196, contain)
  step-02.png        682x298      (display 341x196, contain)
  step-03.png        376x392      (display 341x196, contain)
  peep-idea.png      256x256      (display 150x150, contain)
  peep-meeting.png   256x256      (display 150x150, contain)
  peep-search.png    256x256      (display 150x150, contain)
  peep-later.png     256x256      (display 150x150, contain)

dashboard/public/fonts/
  paper-mono/paper-mono-400.woff2   (PaperMono-Regular)
  paper-mono/paper-mono-600.woff2   (PaperMono-SemiBold)
  geist/Geist-Variable.woff2        (variable wght, dari file yang sama dgn desain)
```

---

## TAHAP 1 — ASET GAMBAR (9 slot)

Semua pakai `<img>` (bukan `background-image` di div), dengan `width`/`height` eksplisit untuk cegah CLS. `alt=""` + `aria-hidden="true"` karena dekoratif, **kecuali** logo (alt="Notinn").

| # | Komponen | Elemen | File | Display | Fit |
|---|---|---|---|---|---|
| 1 | `hero.tsx` | `Brand > Logo` | `v2/notinn-logo.png` | 30×30 | contain |
| 2 | `how-it-works.tsx` | Card 01 illustration | `v2/step-01.png` | 341×196 | contain |
| 3 | `how-it-works.tsx` | Card 02 illustration | `v2/step-02.png` | 341×196 | contain |
| 4 | `how-it-works.tsx` | Card 03 illustration | `v2/step-03.png` | 341×196 | contain |
| 5 | `bento.tsx` | Dashboard Tile > Dash shot | `v2/dashboard.png` | 812×457 | **cover** |
| 6 | `before-after.tsx` | Card "You just had an idea" > Art | `v2/peep-idea.png` | 150×150 | contain |
| 7 | `before-after.tsx` | Card "A meeting ends" > Art | `v2/peep-meeting.png` | 150×150 | contain |
| 8 | `before-after.tsx` | Card "You need the source" > Art | `v2/peep-search.png` | 150×150 | contain |
| 9 | `before-after.tsx` | Card "A quarter later" > Art | `v2/peep-later.png` | 150×150 | contain |

**Yang harus DIHAPUS:**
- `how-it-works.tsx`: semua markup `.v2-illus__bubble`, `.v2-illus__note`, `.v2-illus__line`, `.v2-illus__tag`, `.v2-illus__wave`, `.v2-illus__send` → ganti `<img>`.
- `bento.tsx`: skeleton + fade placeholder di Dashboard Tile → ganti `<img>` + pertahankan `Dash fade` gradient di atasnya (lihat §3, item G8).
- `before-after.tsx`: kotak abu placeholder → ganti `<img>`.
- `hero.tsx`: monogram "N" buatan → ganti `<img src="/landing/v2/notinn-logo.png">`.
- CSS mati untuk kelas-kelas itu boleh dibersihkan setelah dipastikan tidak dipakai.

**Posisi ilustrasi How It Works — ABSOLUT, bukan ikut padding.**
Desain: `left: 28px; top: 88px; width: 341px; height: 196px`. Kartu punya `padding: 28px` (Top) tapi ilustrasinya di-anchor absolut ke kartu.
Struktur desain:
```
Card (bg #FF63081A, radius 20, layout col)
  Top   (padding 28, gap 24) -> Label 19px/23px semibold + Body 14px/22px
  Foot  (padding 14px 28px, bg #0A0A0A08) -> mono chip
  Illustration (absolute left 28 top 88, 341x196)
```
Rencana: biarkan ilustrasi jadi anak flow setelah Top, dengan `margin: 0 28px` + `margin-top` supaya jaraknya sama, **atau** `position: absolute` persis. Pilih yang hasil ukurnya match `top: 88` relatif kartu.

---

## TAHAP 2 — FONT

### 2.1 Deklarasi `@font-face` (taruh di `landing-v2.css`, bukan index.css)

```css
@font-face {
  font-family: "Paper Mono";
  src: url("/fonts/paper-mono/paper-mono-400.woff2") format("woff2");
  font-weight: 400; font-style: normal; font-display: swap;
}
@font-face {
  font-family: "Paper Mono";
  src: url("/fonts/paper-mono/paper-mono-600.woff2") format("woff2");
  font-weight: 600; font-style: normal; font-display: swap;
}
@font-face {
  font-family: "Geist V2";
  src: url("/fonts/geist/Geist-Variable.woff2") format("woff2-variations");
  font-weight: 100 900; font-style: normal; font-display: swap;
}
```

Di `.landing-v2` tambah token:
```css
--font-v2-sans: "Geist V2", "Geist Variable", "Geist", system-ui, sans-serif;
--font-v2-mono: "Paper Mono", "Geist Mono", ui-monospace, monospace;
--font-v2-display: "Manrope Variable", "Manrope", system-ui, sans-serif; /* hanya 26 teks */
```
**Jangan** override `--font-sans` / `--font-heading` global (itu milik dashboard).

### 2.2 Peta font per elemen — WAJIB

| Elemen | font-family | weight | size | letter-spacing | line-height |
|---|---|---|---|---|---|
| **Hero** | | | | | |
| `Brand > "Notinn."` | Manrope | **700** | 16 | **-0.5px** | normal |
| `Live counter` teks | Paper Mono | 400 | 12 | normal | normal |
| `Index "(01)"` | Paper Mono | 400 | 14 | **1.2px** | normal |
| **H1** | Geist | **500** | 62 | **-2.6px** | **67px** (1.08) |
| `Hero sub` | Geist | 400 | 14 | normal | **23px** (1.65) |
| `Hero CTA label` | Geist | 500 | 14 | normal | normal |
| `Sheet head` file/breadcrumb | Paper Mono | 400 | 14 | normal | normal |
| `Sheet crumb` | Paper Mono | 400 | 14 | **1.2px** | normal |
| `Sheet "SUMMARY" / "ACTION ITEMS"` (`sec1`,`sec2`) | Manrope | **700** | 14 | normal | normal |
| `Note title` | Geist | 500 | 32 | **-1.1px** | **38px** (1.2) |
| `sum` (isi ringkasan) | Geist | 400 | 14 | normal | **24px** |
| task item | Geist | 400 | 14 | normal | normal |
| `@arun` dll | Geist | 400 | 14 | normal | normal |
| `#pricing` dll (chip) | Paper Mono | 400 | 14 | normal | normal |
| `01 CAPTURE / 02 STRUCTURE / 03 RETRIEVE` | Paper Mono | 400 | 14 | **1.2px** | normal |
| `voice · text · files` | Geist | 400 | 14 | normal | normal |
| **Input Marquee** | Manrope | 500 / **300** (selang-seling) | 28 | **-0.7px** | 1 |
| **How It Works** | | | | | |
| pill `"How it works"` | Manrope | 600 | 14 | normal | normal |
| `H2 "Stay in Telegram. Three steps only."` | Geist | 500 | 48 | **-1.6px** | **52px** (1.08) |
| `Label "SEND ANYTHING"` | Geist | **600** | 19 | **-0.6px** | **23px** |
| `Body` | Geist | 400 | 14 | normal | **22px** |
| `Foot` chip (`in-chat`, `~4s`, `forever`) | Paper Mono | 400 | 14 | normal | normal |
| `Footer Note` | Geist | 400 | 14 | normal | **23px** |
| **Bento** | | | | | |
| eyebrow `"02 — THE WEB DASHBOARD"` | Paper Mono | 400 | 14 | **1.4px** | normal |
| `H2 "Capture in the chat. Think on the canvas."` | Geist | 500 | 48 | **-1.6px** | **52px** |
| `Bento intro` | Geist | 400 | 14 | normal | **23px**, `text-align: justify` |
| `Dash cap label` | Paper Mono | 400 | 14 | normal | normal |
| `Dash cap right` | Paper Mono | 400 | 14 | normal | normal |
| `SEARCH` / `ASK` / `INPUTS ACCEPTED` / `VOICE · UP TO 30 MIN` | Paper Mono | 400 | 14 | **1.4px** | normal |
| `Search field "pricing decisions"` | Geist | 400 | 14 | normal | normal |
| `Search title` | Geist | 500 | 14 | **-0.3px** | normal |
| `Search body` / `Search hint` | Geist | 400 | 14 | normal | **21px** |
| `Citations "note 1"` | Paper Mono | 400 | 14 | normal | normal |
| `Ask q` | Geist | 400 | 14 | normal | **20px** |
| `Ask answer` | Geist | 400 | 14 | normal | **21px** |
| `Ask title` | Geist | **500** | 14 | normal | **21px** |
| `Format chip label` (`Voice`,`PDF`,`Image`,`DOCX`) | Paper Mono | 400 | 14 | normal | normal |
| `f title` | Geist | 500 | 14 | **-0.3px** | normal |
| `f body` | Geist | 400 | 14 | normal | **21px** |
| `Voice tile "Speak it. It's written."` | Geist | 500 | 19 | **-0.6px** | normal |
| **Before After** | | | | | |
| eyebrow `"03 — BEFORE AND AFTER"` | Paper Mono | 400 | 14 | **1.4px** | normal |
| `H2 "The same thought, handled two ways."` | Geist | 500 | 48 | **-1.6px** | **52px** |
| `BA intro` | Geist | 400 | 14 | normal | **22.4px** (1.6), `text-align: justify` |
| `Card title` (4x) | Manrope | **600** | 18 | **-0.3px** | normal |
| `card body before` | Geist | 400 | 14 | normal | **20.3px** (1.45) |
| `card body after` | Geist | **500** | 14 | normal | **20.3px** |
| `Trust Bar` | Geist | 400 | 14 | normal | **20.3px** |
| **Pricing** | | | | | |
| `"04 — PRICING"` | Paper Mono | 400 | 14 | **1.2px** | normal |
| `H2 "Pro, the price of two coffees."` | Geist | 500 | 60 | **-2.6px** | **63.6px** (1.06) |
| `intro` | Geist | 400 | 16 | normal | **25.6px** (1.6) |
| FAQ question | Geist | 500 | 16 | normal | normal |
| FAQ answer | Geist | 400 | 14 | normal | normal |
| `Receipt "NOTINN"` | Paper Mono | 600 | 18 | **6px** | normal |
| `Receipt brand meta` | Paper Mono | 400 | 14 | normal | normal |
| `Receipt harga "Rp 10.000/mo"` | Paper Mono | 600 | 24 | **-0.5px** | normal |
| Semua baris receipt lain | Paper Mono | 400/600 | 14 | normal | normal |
| **Closing CTA** | | | | | |
| `pill "GET STARTED TODAY"` | Manrope | 600 | 14 | normal | normal |
| `H2 "Ready to begin?"` | Geist | 500 | **84** | **-3.6px** | **92.4px** (1.1), align center |
| `sub` | Geist | 400 | 14 | normal | **22.4px** (1.6), align center |
| `trust chip "No app install"` dll | Paper Mono | 400 | 14 | normal | normal |
| **Footer** | | | | | |
| `H2 "Questions? Talk to a human."` | Geist | 500 | 48 | **-2px** | **52.8px** (1.1) |
| `Counters "01".."06"` | Paper Mono | 600 | 20 | **-0.5px** | normal |
| Semua label footer (`KNOWLEDGE INBOX`, `Product`, dll) | Paper Mono | 400/600 | 14 | normal | normal |
| `contact@alann.works` | Manrope | 600 | 14 | normal | normal |

**Aturan:** jangan biarkan `letter-spacing` default font menang. Set eksplisit di setiap kelas yang disebut di tabel. `letter-spacing: normal` = set `normal`, jangan diwarisi.

### 2.3 Yang rusak sekarang

Semua elemen terukur `letter-spacing: -0.176px` dan font-family `Manrope Variable`. Itu default Manrope Variable, bukan nilai desain.

---

## TAHAP 3 — GEOMETRI

### 3.1 Kontainer (FLUID — keputusan user)

`--v2-container: 1232px` (dari variable desain `content-w = 1232`), gutter:
```css
--v2-gutter: clamp(1.25rem, 7.25vw, 6.5rem);  /* 104px @1440 (7.22vw), turun ke 20px di mobile */
```
Hitung: 104/1440 = 7.22vw. Di 390px → 28px (clamp bawah 20px aman).
`.v2-container { max-width: 1232px; margin-inline: auto; padding-inline: var(--v2-gutter); }`

**Cek:** di viewport 1440, konten harus jadi **1232** dengan tepi kiri **104**. Sekarang 1309 / 65.5.

### 3.2 Radius global

| Elemen | Sekarang | Harus |
|---|---|---|
| Kartu & tile (`.v2-stat-block`, `.v2-tile`, `.v2-ba-card`, search/ask/format/voice/export tile) | 18px | **20px** |
| Specimen Sheet (`.v2-sheet`) | 18px | **6px** |
| Dock bar | 999px (pill) | **20px** |
| Dock item | — | **13px** |
| Receipt (`.v2-receipt`) | 0 | **4px** |
| `.v2-illus` (kalau masih ada) | 12px | dihapus, diganti `<img>` |

Tambahkan token: `--v2-radius-card: 20px; --v2-radius-sheet: 6px; --v2-radius-dock: 20px; --v2-radius-dock-item: 13px;`

### 3.3 Perbaikan per item

| # | Item | Sekarang | Harus |
|---|---|---|---|
| G1 | Kontainer | max-w 1440, pad 65.475 | max-w **1232**, pad **104** (fluid per §3.1) |
| G2 | Hero CTA (`.v2-btn`) | radius 12px, pad `0 20px` | radius **9999px**, primary pad **`0 24px`**, secondary pad **`0 22px`**, gap 10 |
| G3 | Hero CTA bg | `#0A0A0A` ✓ | ✓ ; secondary bg `#F2F1EF` + `outline: 1px solid #E6E5E2` (outline-offset -0.5px) |
| G4 | Specimen Sheet | 668×524.5, radius 18, no shadow | 668×**660**, radius **6**, `box-shadow: 0 24px 30px #0F172A1A`, `outline: 1px solid #E6E5E2` |
| G5 | Sheet head | tinggi? | **43.5px**, `bg #FCFBFA`, `border-bottom 1px #E6E5E2`, `padding: 0 20px`, layout row justify-between |
| G6 | Sheet body | — | `w 604`, `left 32`, `top 64`, layout col |
| G7 | How card (`.v2-stat-block`) | bg putih, radius 18, pad 24 | bg **`#FF63081A`**, radius **20**, Top `padding: 28px`, `gap: 24px`, Foot `padding: 14px 28px` + `bg #0A0A0A08` |
| G8 | Bento section | bg transparan | bg **`#F5F4F1`** (`$surface-sunken`) |
| G9 | Bento grid gap | 10px | **16px** |
| G10 | Bento Row A height | 560 | tile: Dashboard **812×520**, Search **h 252**, Ask **h 252** |
| G11 | Bento Row B | 284 tile | Formats **404×284**, Voice **404×284**, Export **h 284** ; padding semua tile **`24px 22px`** |
| G12 | Dashboard Tile | radius 18, outline? | radius **20**, `outline: 1px solid #E6E5E2`, bg **`#0B0B0A`** |
| G13 | Dash shot | skeleton | `<img>` 812×**457** `object-fit: cover` |
| G14 | Dash fade | ada ✓ | `top: 330px`, `w 812`, `h 127`, gradient `#0B0B0A00 → #0B0B0A` (rotasi 180) |
| G15 | Dash caption | — | `top: 468px`, `h 52`, `padding: 0 22px`, row, justify-between |
| G16 | Search Tile | h 275, pad `20px 24px 24px`, radius 18 | h **252**, pad **`24px 22px`**, radius **20**, bg **`#FF6308`** |
| G17 | Search field | — | `gap 8`, `padding: 9px 12px`, `bg #FFFFFF1F`, radius **10**, `outline: 1px solid #FFFFFF4D` |
| G18 | Ask Tile | h 275, radius 18 | h **252**, pad **`24px 22px`**, radius **20**, bg **`#0B0B0A`** |
| G19 | Ask bubble | — | `gap 8`, `padding: 10px 12px`, `bg #FFFFFF14`, radius **10** |
| G20 | Citation chip | — | `padding: 2px 7px`, `bg #FFFFFF1F`, radius 9999 |
| G21 | Format chip | — | `gap 6`, `padding: 12px 6px`, `bg #FFFFFF14`, radius **10**, `outline: 1px solid #FFFFFF1F` |
| G22 | Formats Tile | radius 18 | radius **20**, `outline: 1px solid #FFFFFF1F` |
| G23 | Voice Tile | — | **404×284**, pad `24px 22px`, radius 20, bg `#FF6308` |
| G24 | Waveform bar | — | **28 bar**, `w 5px`, `gap 3px`, bg `#FFFFFF99`, radius **3px**, tinggi dari desain (10,22,38,52,30,44,20,34,48,26,14,36,50,28,18,40,24,12,32,44,20,28,38,16,26,34,10,20,30) |
| G25 | Before/After card | h 226, pad 24, gap 24, radius 18 | h **224**, pad **24**, gap **24**, radius **20**, bg `#FFFFFF` |
| G26 | BA art | 176×176, bg `#F9F8F6`, radius 12 | `<img>` **150×150** `contain`, tanpa bg |
| G27 | Section Transition | `background: #F9F8F6` (gradient hilang) | **linear-gradient ke bawah (180deg)** dari pen export; transisi-1 `#FFF4EC → #FFFFFF`, transisi-2 `#FFF4EC → #F9F8F6`; `height: 120px` |
| G28 | Pricing section | — | 1440×**980**, bg `#FFF4EC` |
| G29 | Receipt | pad `32px 32px 28px`, radius 0, bg putih, no shadow | `w 440`, pad **28px**, radius **4**, bg **`#FFFDF9`**, `box-shadow: 0px 16px 32px #B4530933` |
| G30 | Closing CTA | h 543.5 | h **520**, bg `#F9F8F6` |
| G31 | CTA trust | — | `w 1336`, `gap 24`, row |
| G32 | Footer marquee | h 88 ✓ | h **88**, pad **`0 24px`**, bg `#0B0B0A` |
| G33 | Footer bottom | — | `h 52.5`, pad **`18px 70px`** |
| G34 | Dock bar | w 317, h 54, radius 999, pad 6, gap 2 | w **353**, h **52**, radius **20**, pad **`6px 8px`**, gap **8**, bg **`#0B0B0AE6`**, `outline: 1px solid #FFFFFF1F`, `box-shadow: 0 8px 24px #00000033` |
| G35 | Dock item | 40×40 | 40×40, radius **13** |
| G36 | Dock item aktif | — | bg **`#FF6308`**, `box-shadow: 0 4px 10px #FF630840` |
| G37 | Dock CTA (Telegram/Dashboard) | — | 40×40, radius **13**, bg `#FF6308` |
| G38 | Dock shell | — | wrapper w 1440, h **170** |
| G39 | Bottom Dock | — | h **70**, `top: 100px` di dalam shell |
| G40 | Marquee | pad 0 | section pad **`0 24px`**, `gap 26`, item 28px ✓ |

### 3.4 Line-height & tracking

Lihat tabel §2.2 — angka `line-height` di sana bagian dari kontrak geometri juga. Live sekarang semua pakai `line-height: normal`/1.5 bawaan, bukan angka desain.

---

## VERIFIKASI (wajib, tiap tahap)

Jalankan di `dashboard/`:
```
npx tsc --noEmit                                              -> exit 0
npm run build:client                                          -> PASS
npx eslint src/components/landing/v2 src/app/landing-page.tsx -> exit 0
npx playwright test tests/browser/landing.spec.ts             -> pass
```
Plus **pengukuran ulang** di dev server, viewport 1440 (via `Emulation.setDeviceMetricsOverride`):
- `document.documentElement.clientWidth === 1440`
- `.v2-container` → `width: 1232`, `padding-inline: 104px`
- `h1` → `font-family: Geist*`, `font-size: 62px`, `letter-spacing: -2.6px`, `line-height: 67px`
- `.v2-marquee-item` → `font-family: Manrope*`, `letter-spacing: -0.7px`
- `img` count di `.landing-v2` → **9**
- `.v2-bento` → `background-color: rgb(245, 244, 241)`
- `.v2-section-transition` → `background-image` **bukan** `none`
- `.v2-receipt` → `border-radius: 4px`, `padding: 28px`
- `.v2-stat-block` → `background-color: rgba(255,99,8,0.10)`, `border-radius: 20px`
- `.v2-dock__bar` → `width: 353px`, `border-radius: 20px`

Tulis hasil ukur ke `.omp/tasks/landing-v2/progress.md` (append), sertakan angka aktual — bukan "OK".

## LARANGAN

- Jangan sentuh file Cornell, jangan ubah `tsconfig.json`.
- Jangan sentuh halaman dashboard/notes/admin/settings/legal, `router.tsx`, Supabase, RLS, skema DB.
- Jangan hapus `landing-footer.tsx` dan `landing.css` (`legal-page.tsx` memakainya).
- **Jangan pakai GSAP.** Motion hanya Framer Motion.
- Jangan fetch/download aset lagi — semua sudah ada di `public/`.
- Jangan pakai hex baru di luar token yang sudah ada; token desain lengkap ada di 61 variable `notinn-design.pen` dan blok `.landing-v2` di `index.css`.
- Jangan mengarang nilai geometri. Kalau ada yang tidak ada di brief, ambil dari `v2-pixel-contract.md`.
