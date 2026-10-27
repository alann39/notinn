# Fix: Bento breakout HARUS DIHAPUS — margin asimetris

## Kesalahan saya (bukan omp)

Instruksi "Bento breakout 1440" di `v2-audit2.md` dan semua brief sesudahnya itu
**SALAH**. Sumbernya: export HTML pen memakai `content-box`, sehingga `Bento`
terukur **1648px** di viewport 1440 — mustahil, karena lebih lebar dari artboard.

Angka 1648 = 1440 + 2×104 (padding kiri-kanan dihitung dua kali). Itu artefak.
Gue telen mentah dan menyuruh bikin breakout, padahal desainnya simetris.

## Bukti dari `.pen` (bukan export)

```
Bento       : width "fill_container", padding [96, 104]
Bento Grid  : width "fill_container"
Bento Row A : width "fill_container"
Side Tiles  : width "fill_container"
Search Tile : width "fill_container"
Export Tile : width "fill_container"
Dashboard   : width 812 (satu-satunya yang fixed)
Formats     : width 404 (fixed)
Voice       : width 404 (fixed)
```

Tidak ada satu pun `width` yang lebih besar dari kontennya. **Tidak ada breakout.**

Aritmetika di 1440:
- Bento content = `1440 − 208 = 1232`
- Grid = 1232
- Side Tiles = `1232 − 812 − 16 = 404`
- Export Tile = `1232 − 404 − 16 − 404 − 16 = 392`

Verifikasi dengan memaksa `box-sizing: border-box` di export pen:
```
Bento 1440 | Grid 1232 | RowA 1232 | Side 404 | Search 404 | Export 392
```
Angka-angka ini yang benar.

## Gejala di live sekarang

Diukur di `clientWidth = 1920`:

| Elemen | L | R (jarak dari kanan) | Simetris? |
|---|---|---|---|
| `.v2-bento__grid` | **104** | **0** | **TIDAK** |
| `.v2-how > *` | 104 | 104 | ya |
| `.v2-before-after > *` | 104 | 104 | ya |
| `.v2-pricing__grid` | 104 | 104 | ya |
| `.v2-cta__content` | 52 | 52 | ya |

Cuma Bento yang asimetris → tile-nya nempel ke tepi kanan layar.

## Fix — satu properti

`landing-v2.css`, selector `.v2-bento__inner`:

```css
/* SEKARANG (salah) */
.v2-bento__inner {
  width: calc(100% + 104px);
  max-width: none;
  margin-right: -104px;
}

/* JADI */
.v2-bento__inner {
  width: 100%;
  max-width: none;
  margin-right: 0;
}
```

Kalau ada `margin-left` negatif juga, set `0`. Pastikan tidak ada
`width: 1440px` atau `calc(100% + ...)` yang tersisa di selector Bento mana pun.

## Angka target setelah fix

### 1440
```
Bento Grid   L104  R104  w1232
Row A        L104  R104  w1232
Dashboard    L104  R916  w812
Side Tiles   L932  R104  w404
Search/Ask   w404  h252
Row B        w1232
Formats      w404 | Voice w404 | Export w392
```

### 1920
```
Bento Grid   L104  R104  w1712
Dashboard    w812 | Side w884
Row B        w1712 | Formats w404 | Voice w404 | Export w872
```

### 2560
```
Bento Grid   L104  R104  w2352
Dashboard    w812 | Side w1524
Row B        w2352 | Formats w404 | Voice w404 | Export w1512
```

## Verifikasi WAJIB (3 viewport)

Untuk 1440, 1920, 2560, tulis angka aktual:

1. `.v2-bento__grid` → `left` dan `clientWidth − right` **sama** (toleransi 1px)
2. `.v2-bento__grid` width = `clientWidth − 208`
3. `.v2-bento__side` width = `grid.width − 812 − 16`
4. tile terakhir Row B → `right` = `clientWidth − 104` (bukan `clientWidth`)
5. **semua** section: `left == clientWidth − right` (simetris), termasuk Bento
6. `overflow horizontal = false`
7. tinggi section: how 971, bento 1380, ba 867 (di 1440)

## Larangan

- JANGAN breakout Bento lagi. Itu artefak export, bukan desain.
- Jangan ubah font, warna, radius, aset, anchor, barcode, ticker, Pricing mirror.
- Jangan sentuh Cornell / `tsconfig.json`.
