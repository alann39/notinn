# Fix Batch 5 — 6 selisih struktural + 3 keluhan user

Acuan: `v2-audit3.md` (6 struktural) + bagian USER di bawah. Kontrak mentah:
`v2-pixel-contract.md`, `v2-export.html`.

Semua angka di bawah **hasil ukur di `clientWidth = 1440`**, bukan perkiraan.

---

# BAGIAN A — 6 SELISIH STRUKTURAL (dari v2-audit3.md)

## A1. Hero gutter 72px, BUKAN 104px

`.pen` — anak-anak Hero punya `x` absolut sendiri, tidak ikut kontainer:

| Elemen | `.pen` x | Live x | Delta |
|---|---|---|---|
| Brand | 72 | 104 | +32 |
| Hero Headline | 72 | 104 | +32 |
| Index list | 72 | 104 | +32 |
| Specimen Sheet | **700** | 668 | −32 |
| Live counter | **1160** | 1167.4 | +7.4 |

Aritmetika: `72 + 560 = 632`, `700 + 668 = 1368`, `1440 − 1368 = 72`. Gutter simetris **72**.

Fix:
- `.v2-hero` pakai `padding-inline: 72px` sendiri — **jangan** pakai `--v2-gutter`.
- Kolom: Headline 560 di kiri, Specimen Sheet 668 di kanan (`x=700`).
- `Live counter` `left: 1160` (bukan rata kanan sheet; 1160+166.6=1326.6).
- Brand `left: 72`, `top: 34`.

## A2. Gap vertikal section hilang

| Section | `.pen` gap | Live | Akibat tinggi |
|---|---|---|---|
| How It Works | **64px** | `normal` (0) | 971 → 931.8 (−39.2) |
| Bento | **40px** | `normal` (0) | 1380 → 1188 (−192) |
| Before After | **48px** | `normal` (0) | 867 → 870 (+3) |

Fix: pasang `display: flex; flex-direction: column` + `gap` sesuai angka di
wrapper dalam tiap section.

## A3. Bento: padding kanan hilang → lebar 1544 (lebih dari viewport)

`.pen`: `Bento` `padding: [96, 104]`, `Bento Grid` `fill_container` = **1440**,
`Dashboard Tile` mulai `x=104`.

Live: `.v2-bento` `padding: 96px 0px`, `.v2-bento__inner` `width: 1544` ← **melebihi 1440**.

Fix: `Bento` `padding: 96px 104px`; Grid `width: 1440` dengan breakout **satu sisi**:
`margin-right: -104px` (kiri tetap di 104, kanan menembus ke 1440).

## A4. How Header kurang tinggi

`.pen` How Header = **159**, live 137.8 (−21.2). `.pen` `How Header` `gap: 16`,
isi = Eyebrow Row (pill) + H2 `width: 760`.

## A5. CTA: dua node bertumpuk, padding ganda

Live punya `.v2-cta__inner` (1440, `pad: 46px 52px`) **dan** `.v2-cta__content`
(1336 @ L52, h271) di dalamnya. `.pen` hanya satu: `CTA Content` = 1336 @ L52, h271, **pad 0**.

Angka `.pen`:
- `CTA Content` L52 w1336 h271 pad 0
- `CTA trust` L52 w1336 **Trel 422** (live 458 → **+36**)

Fix: satu kontainer 1336 @ L52, trust di 422 dari atas section.

## A6. Footer bottom terlalu pendek

`.pen` h **89.5**, pad `18px 70px`, 2 anak @ h16.
Live h **52.5**. Selisih −37 → ada jarak antar-anak yang hilang.

---

# BAGIAN B — 3 KELUHAN USER (sudah diverifikasi)

## B1. Marquee footer tidak jalan

Terukur di live:
- `.v2-footer__ticker-set` → `animation: none`, `transform: none`
- 3 set ada di DOM (benar), tapi tidak ada keyframes untuk footer
- Keyframes yang ada hanya: `v2-live-pulse`, `v2-marquee-scroll`, `spin`, `ping`, `pulse`, `skeleton`, `toast-*`
- **Tidak ada `@keyframes` untuk footer ticker**

`.pen`: `Footer Marquee — Counters` `clip: true`, `h: 88`, `padding: [0,24]`,
`alignItems: center`, 18 anak (6 item × 3 set), tiap item `gap: 10`, `padding: [0,20]`.

Fix: tambah `@keyframes v2-footer-ticker` (translateX 0 → −100% dari satu set),
pasang di `.v2-footer__ticker-set` dengan `animation: v2-footer-ticker 40s linear infinite`.
Wajib: `prefers-reduced-motion: reduce` → `animation: none`. Set duplikat
`aria-hidden="true"` supaya screen reader tidak baca 3×.

## B2. Barcode kurang tebal / spacing terlalu jauh

**Ini bukan salah spacing — barcodenya kurang bar.**

| | `.pen` | Live |
|---|---|---|
| Jumlah bar | **40** | 35 |
| Lebar per bar | `[2,1,3,1,2,2,1,3,1,1,2,3,1,2,1,1,3,2,1,2,3,1,1,2,1,3,2,1,1,3,2,1,2,1,3,1,2,2,1,3]` | `[2,1,3,1,1,2,3,1,…]` |
| Total lebar bar | 71px | 62px |
| Gap | **2px** | 2px |
| Total terpakai | 149px | **130px** |
| Kontainer | 385px | 385px |
| **Fill ratio** | **39%** | **34%** |
| Tinggi | **40px** | 52px |

Jadi: kurang 5 bar (−9px), tinggi kelebihan 12px, dan total hanya 34% dari lebar
kontainer → keliatan renggang.

Fix:
1. Pakai **array lebar desain apa adanya, 40 bar**: `[2,1,3,1,2,2,1,3,1,1,2,3,1,2,1,1,3,2,1,2,3,1,1,2,1,3,2,1,1,3,2,1,2,1,3,1,2,2,1,3]`
2. `height: 40px` (bukan 52).
3. `gap: 2px` tetap.
4. Supaya tidak renggang di kontainer 385: **jangan** `justify-content: center`
   dengan gap tetap lalu sisanya kosong. Pakai `justify-content: space-between`
   **atau** biarkan `center` tapi scale bar-nya. Rekomendasi: pertahankan lebar
   bar desain (2/1/3 px) + `gap: 2px`, lalu `width: fit-content; margin-inline: auto`
   — hasilnya 149px terpusat, sama seperti `.pen` (39% fill). **Jangan** melebarkan
   bar jadi proporsional penuh, itu menyimpang dari desain.
   Kalau user mau lebih penuh, opsi kedua: `justify-content: space-between` di
   kontainer 385 sehingga bar tersebar. Pilih yang **39% fill terpusat** dulu
   karena itu yang `.pen` lakukan.

## B3. Footer ketutupan dock

Terukur saat scroll mentok bawah (viewport 1200):

```
dock (fixed)     top 1030  bottom 1200  h 170
dock bar         top 1142  bottom 1194  h 52
footer bottom    top 1148  bottom 1200  h 52.5
teks terakhir    top 1167  bottom 1183
```

Teks terakhir (`© 2026 NOTINN …`) `bottom = 1183` sedangkan dock bar `top = 1142`
→ **teks ketutupan 41px**.

Fix: tambah `padding-bottom` di `.v2-footer` sebesar tinggi dock + jarak aman.
Angka: dock bar h 52, dock total h 170, dock `padding-bottom: 6px`.
Rekomendasi `padding-bottom: 120px` di `.v2-footer` (atau `scroll-padding-bottom`
+ spacer). Setelah fix, verifikasi: teks terakhir `bottom` **<** dock bar `top`
saat scroll mentok.

---

## URUTAN KERJA

1. A1 Hero gutter 72 (paling besar dampaknya)
2. A2 gap section (How 64, Bento 40, BA 48)
3. A3 Bento padding + breakout satu sisi
4. A4 How Header 159
5. A5 CTA satu kontainer + trust 422
6. A6 Footer bottom 89.5
7. B1 keyframes footer ticker
8. B2 barcode 40 bar / h40
9. B3 footer padding-bottom

## VERIFIKASI (tulis angka aktual, bukan "OK")

```
npx tsc --noEmit                                    -> exit 0
npm run build:client                                -> PASS
npx eslint src/components/landing/v2 src/app/landing-page.tsx -> exit 0
```

Ukur di dev server, `clientWidth` **harus 1440** (print dulu, kalau bukan 1440 stop):

- `.v2-brand` left = **72**
- `.v2-hero__headline` left = **72**, w = 560
- `.v2-sheet` left = **700**, w = 668
- `.v2-live` left = **1160**
- `.v2-index-list` left = **72**
- `.v2-how` tinggi = **971**
- `.v2-bento` tinggi = **1380**
- `.v2-before-after` tinggi = **867**
- `.v2-bento__grid` width = **1440**
- `.v2-cta__content` w = 1336, L = 52, h = 271
- `.v2-cta__trust` jarak dari atas `.v2-cta` = **422**
- `.v2-footer__bottom` h = **89.5**
- `.v2-footer__ticker-set` `animationName` **bukan** `none`
- barcode: jumlah bar = **40**, tinggi = **40px**, total terpakai = **149px**
- saat scroll mentok: teks terakhir footer `bottom` **<** `.v2-dock__bar` `top`

## LARANGAN

- Jangan sentuh: font, Pricing mirror, Receipt rotate, F2 CTA oranye, radius, 9 aset, semua anchor/a11y.
- Jangan implement shader grain (`effect.enabled: false`).
- Jangan ubah nilai `fontSize` berdasarkan diff mentah — `.pen` menulis 16 di node
  frame karena warisan, teks aslinya sering 14. Baca teksnya di `v2-export.html` dulu.
- Jangan sentuh file Cornell / `tsconfig.json` / halaman dashboard/notes/admin/legal.
- Jangan pakai GSAP.
