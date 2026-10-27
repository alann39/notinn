# Fix Fluid v2 — per baris CSS (1920 terbukti ngawur)

Screenshot user di **1920×1080** membongkar 4 bug yang lolos dari audit 1440.
Semua diukur di `clientWidth = 1920`.

**Akar tunggal:** nilai px absolut dari artboard 1440 dipakai sebagai `width`/`left`
mati, sehingga tidak fluid.

---

## BUKTI TERUKUR (1920)

| Elemen | Sekarang | Seharusnya |
|---|---|---|
| `.v2-bento__inner` | **w 1440**, L104, R1544 | w 1816 (1920−104) |
| `.v2-bento__grid` | **w 1440**, `width: 1440px` | w 1816 |
| `.v2-cta__content` | **w 1336**, `width: 1336px` | w 1816 |
| `.v2-cta__trust` | **w 1336**, `width: 1336px` | w 1816 |
| `.v2-live` | L **1160** (absolut) | R = 1848 |
| `.v2-how > *` | L **240** (center) | L 104 |
| `.v2-before-after > *` | L **240** (center) | L 104 |
| `.v2-pricing__grid` | L **240** (center) | L 104 |
| sisa kosong kanan Bento | **376px** | 0 |

---

## BARIS CSS YANG HARUS DIUBAH

### 1. `landing-v2.css` L1133 — `.v2-bento__inner`

```css
/* SEKARANG */
.v2-bento__inner {
  width: 1440px;
  max-width: none;
  margin-right: -104px;
}

/* JADI */
.v2-bento__inner {
  width: calc(100% + 104px);   /* isi penuh + breakout kanan */
  max-width: none;
  margin-right: -104px;
}
```

Cek: di 1440 → `(1440−208) + 104 = 1336`? **Salah.** Bento section punya
`padding: 96px 104px`, jadi ruang isi = `100% − 208`. Yang benar:

```css
.v2-bento__inner {
  width: calc(100% + 104px);   /* 100% di sini = lebar content-box section */
  max-width: none;
  margin-right: -104px;
}
```
Di 1440: content-box = 1232, +104 = 1336, margin-right −104 → total tampak 1440,
mulai di 104. **Benar.** Di 1920: 1712 + 104 = 1816, mulai di 104, kanan 1920. **Benar.**

### 2. `landing-v2.css` L1134 — hapus `max-width: none` (sudah ada di atas, aman)

Tidak perlu diubah, tapi pastikan **tidak ada** `width: 1440px` yang tersisa.

### 3. `landing-v2.css` L2074 & L2145 — `.v2-cta__content` dan `.v2-cta__trust`

```css
/* SEKARANG */
width: 1336px;
max-width: calc(100% - 104px);
left: 52px;

/* JADI */
width: calc(100% - 104px);
max-width: none;
left: 52px;
```

Di 1440: `1440 − 104 = 1336` ✓ (sama dengan desain)
Di 1920: `1920 − 104 = 1816` ✓

### 4. `landing-v2.css` L165 — `.v2-live` (sudah `right: 72px`, cek tidak ada `left`)

```css
/* pastikan TIDAK ada left, hanya right */
position: absolute;
right: 72px;      /* JANGAN left: 1160px */
top: 36px;
```
Kalau masih ada `left: 1160px`, hapus.

### 5. `landing-v2.css` L71 — `.v2-container` max-width 1232

`.v2-container` dipakai oleh section mana? Cek. Kalau How/BA/Pricing memakainya,
`max-width: var(--v2-container)` = 1232 membuat mereka **center** di 1920 (L=240).

```css
/* SEKARANG */
.v2-container {
  max-width: var(--v2-container);   /* 1232 */
  margin-inline: auto;
  padding-inline: var(--v2-gutter);
}

/* JADI — untuk section yang harus full-fluid */
.v2-container {
  max-width: none;
  margin-inline: 0;
  padding-inline: var(--v2-gutter);
}
```

**Perhatian:** kalau ada elemen yang memang butuh 1232 (mis. teks panjang biar
nyaman dibaca), biarkan pakai `max-width` di elemen dalam, bukan di container.

### 6. `landing-v2.css` L2033 — `max-width: var(--v2-container)` di blok lain

Sama seperti #5, cek konteksnya.

---

## YANG **TIDAK** BOLEH DIUBAH (fixed by design)

Ini px tetap yang memang benar karena `.pen` menetapkannya:

| Baris | Selector | Nilai | Alasan |
|---|---|---|---|
| L324 | `.v2-hero__headline` | `width: 560px` | `.pen` H1 `width: 560` |
| L375, L395 | `.v2-sheet`, `.v2-sheet__head` | `width: 668px` | kartu berukuran tetap |
| L458 | `.v2-sheet__body` | `width: 604px` | `.pen` Sheet body 604 |
| L681 | `.v2-dock__bar` | `width: 353px` | dock pill |
| L1109 | illustration | `width: 341px` | aset |
| L1591 | BA art | `width: 150px` | aset |
| L1814, L2501 | `.v2-receipt` | `width: 440px` | struk |
| L1734 | Bento H2 | `width: 720px` | `.pen` Bento H2 720 |
| L2105 | CTA title | `width: 1000px` | `.pen` CTA title 1000 |
| L137, L321 | hero | `left: 72px` | gutter Hero |
| L455, L571, L595 | sheet body | `left: 32px` | offset dalam sheet |
| L2070, L2140 | CTA | `left: 52px` | `.pen` CTA Content L52 |

---

## VERIFIKASI — 3 viewport, tulis angka aktual

### 1440 (harus tetap sama seperti sekarang, jangan regresi)

```
.v2-bento__grid      L104  R1440  w1336
.v2-cta__content     L52   R1388  w1336
.v2-cta__trust       L52   R1388  w1336
.v2-live             R1368
.v2-sheet            R1368
how/ba/pricing       L104  R1336
tinggi: how 971, bento 1380, ba 867
```

### 1920

```
.v2-bento__grid      L104  R1920  w1816
.v2-cta__content     L52   R1868  w1816
.v2-cta__trust       L52   R1868  w1816
.v2-live             R1848
.v2-sheet            R1848
how/ba/pricing       L104  R1816
tinggi: how 971, bento 1380, ba 867
```

### 2560

```
.v2-bento__grid      L104  R2560  w2456
.v2-cta__content     L52   R2508  w2456
.v2-live             R2488
.v2-sheet            R2488
how/ba/pricing       L104  R2456
```

### Ketiga viewport

- `overflow horizontal = false`
- `Live counter` **tidak overlap** `Specimen Sheet` di ketiganya
- tidak ada elemen dengan `scrollWidth > clientWidth` selain marquee/sr-only

---

## LARANGAN

- Jangan ubah px tetap di tabel "YANG TIDAK BOLEH DIUBAH".
- Jangan sentuh font, radius, warna, aset, anchor, barcode, ticker, Pricing mirror, Receipt rotate, F2 CTA.
- Jangan sentuh Cornell / `tsconfig.json`.
- Jangan pakai GSAP.
