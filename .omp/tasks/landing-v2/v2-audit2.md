# Audit Pixel #2 — temuan baru

Ground truth: `v2-export.html` (render pen, diukur di viewport sama) + `notinn-design.pen` (nilai mentah node).
Live: dev server, `clientWidth = 1440`.

---

## KRITIS 1 — Layout Pricing TERBALIK

Desain: judul di kiri-atas, **Receipt di kolom KIRI**, **FAQ di kolom KANAN**.

| | Desain (export pen) | Live |
|---|---|---|
| FAQ chat | `L=683.8`, `w=653` → **KANAN** | `L=104`, `w=653` → **KIRI** |
| Receipt | `L=97.8`, `w=457` (rotated) → **KIRI** | `L=896`, `w=440` → **KANAN** |

Jadi seluruh section Pricing ke-mirror. Ini yang paling kelihatan.

Bukti `.pen`: urutan child `Pricing L2 — Receipt` = `[text 04—PRICING, text H2, text intro, FAQ chat, Receipt]` dan `FAQ chat` punya `x` absolut di kanan.

---

## KRITIS 2 — Receipt tidak dirotasi

`.pen` node `Receipt`:
```json
"rotation": -358.2,   →  matrix(0.999507, -0.0314108, 0.0314108, 0.999507, 0, 0)  ≈ -1.8°
```
Live: `transform: none`. Efek visual "kertas struk nyata" hilang, jadi kotak kaku.

---

## KRITIS 3 — F2 CTA (blok oranye footer) HILANG

`.pen` node `F2 CTA`:
```json
"fill": "$accent", "height": 320, "padding": [40, 72], "gap": 24,
"justifyContent": "space_between"
```
→ oranye `#FF6308`, 320px tinggi.

Live: `.v2-footer__cta` → `background-color: rgba(0,0,0,0)` (transparan), tinggi 347.4, pad `80px 92.8px`.
Akibatnya judul **"Questions? Talk to a human."** tampil putih di atas **hitam**, padahal desain: putih di atas **oranye**. Ini blok warna terbesar di footer dan hilang total.

Catatan: `.pen` punya `effect: shader grain.glsl` tapi `"enabled": false` → **jangan** implement grain.

---

## KRITIS 4 — Bento content 1232, desain 1440

Di desain, Bento sengaja lebih lebar dari section lain:

| Elemen | Desain | Live | Delta |
|---|---|---|---|
| Bento Grid | **1440** | 1232 | −208 |
| Bento Header | **1440** | 1232 | −208 |
| Dashboard Tile | 812 | 812 | ✓ |
| **Side Tiles** (Search+Ask) | **612** | 404 | **−208** |
| Search Tile | **612**×252 | 404×252 | −208 |
| Ask Tile | **612**×252 | 404×252 | −208 |
| Formats Tile | 404 | 404 | ✓ |
| Voice Tile | 404 | 404 | ✓ |
| **Export Tile** | **600** | 392 | **−208** |

Bukti aritmetika desain: `812 + 16 + 612 = 1440` dan `404 + 16 + 404 + 16 + 600 = 1440`.
Section lain pakai `content-w = 1232`; **Bento pakai 1440**. Jadi Bento = breakout, bukan ikut kontainer.

Konsekuensi sekarang: Search/Ask/Export tile 208px lebih sempit, isinya sesak.

---

## SEDANG 5 — Section Transition #1 harus flip

`.pen` transition pertama: `transform: matrix(1, 0, 0, -1, 0, 0)` = `scaleY(-1)`.
Live: `transform: none`. Gradient-nya kebalik arah.

## SEDANG 6 — Specimen Sheet: head & body

| Elemen | Desain | Live |
|---|---|---|
| Sheet head | **708**×44.5 (`box-sizing: content-box`, 668+20+20) | 668×43.5 |
| Sheet body | **604** lebar, `L=32` dari sheet, `T=64`, h **319** | 668 lebar, `L=0`, `T=43.5`, h **617** |

Live bikin body full-width dengan padding, desain pakai kolom 604 yang di-offset 32/64. Tinggi body 319 vs 617 → di live isi sheet melar sampai bawah, di desain ada ruang kosong di bawah.

## RINGAN 7–13

| # | Elemen | Desain | Live |
|---|---|---|---|
| 7 | `Brand` gap | **4px** | 9.6px |
| 8 | `How Header` gap | **16px** (vertical) | `24px 48px` |
| 9 | `Index list` tinggi | **90/91** (pad 12 atas) | 78 |
| 10 | `CTA Content` | **1336** wide, `L=52`, h **271** | 1440, `L=0`, h **520**, pad 46/52 |
| 11 | `CTA trust` jarak dari atas section | **422** | 458 |
| 12 | `Foot` (how card) gap | `space_between`, gap **0** | 16px |
| 13 | `Footer bottom` | 1580×89.5, pad `18px 70px` | 1440×52.5 |

Catatan #13: 1580 itu lebih lebar dari artboard 1440 — kemungkinan artefak export pen (content-box). Jangan dipaksa 1580; pakai 1440.

---

## Yang sudah benar (jangan diutak-atik)

- Kontainer 1232 + gutter 104 (untuk section non-Bento)
- Semua radius: kartu 20, sheet 6, dock 20, dock item 13, receipt 4
- `How card` bg `rgba(255,99,8,0.1)`, pad 28/14-28, Top gap 24
- `Bento` bg `#F5F4F1`
- `Dashboard Tile` 812×520, radius 20, bg `#0B0B0A`
- `Receipt` 440 lebar, pad 28, bg `#FFFDF9`, shadow oranye
- `Dock Bar` 353×52, radius 20, pad 6/8, gap 8
- Font: Geist 62/-2.6/67 di H1, Paper Mono 210 node
- 9 aset gambar, semua termuat
- `Search Tile` bg `#FF6308`, `Ask Tile` bg `#0B0B0A`
- Semua anchor & a11y

---

## Urutan fix

1. **Pricing di-mirror balik** — FAQ ke kanan, Receipt ke kiri. Wajib.
2. **Receipt rotate −1.8°**.
3. **F2 CTA bg `#FF6308`, h 320, pad 40px 72px, justify space-between**.
4. **Bento breakout ke 1440** — Side Tiles 612, Export Tile 600.
5. **Transition #1 `scaleY(-1)`**.
6. **Sheet head 708 (content-box) + body 604 @ L32/T64**.
7. Sisanya 7–12.
