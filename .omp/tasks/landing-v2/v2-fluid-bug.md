# Bug Fluid — 1920px (dan semua viewport > 1440)

Ditemukan dari screenshot user di 1920×1080. Semua diukur, bukan taksiran.

**Akar masalah:** Fix A1 (Hero gutter 72) dikunci pakai `position: absolute; left: 1160px`
— nilai absolut desain 1440. Di viewport lain, angka itu tidak ikut menyesuaikan.

---

## BUG 1 — `Live counter` nyangkut di 1160, nggak ikut ke kanan

| Viewport | Live counter L | Sheet L | Live kanan sheet? |
|---|---|---|---|
| 1280 | 1160 | 632 | **iya, tumpang tindih** |
| 1440 | 1160 | 700 | **iya, tumpang tindih** |
| 1600 | 1160 | 860 | **iya, tumpang tindih** |
| 1920 | 1160 | 1180 | **iya, tumpang tindih** |
| 2560 | 1160 | 1820 | tidak |

`position: absolute; left: 1160px` — hardcoded. Akibatnya badge "1,284 notes today"
selalu di x=1160, sedangkan Specimen Sheet bergerak mengikuti gutter kanan.
Di 1280–1920 badge **masuk ke area sheet** (live R=1329 vs sheet L=1180 di 1920 → overlap 149px).

**Fix:** jangan `left: 1160px`. Pakai `right: 72px` (gutter kanan) supaya menempel
ke gutter kanan seperti desain. Di 1440 hasilnya `1440-72-168.6 = 1199.4` — sedikit
beda dari 1160 desain (39px), tapi **konsisten di semua viewport**. Kalau mau persis
1160 di 1440, pakai `right: calc(72px + 39px)`. Rekomendasi: `right: 72px`.

## BUG 2 — Section lain tidak fluid: tetap 1440 dan di-center

Di 1920, semua section non-Bento **tetap 1440px** dan di-center (`L=240`):

| Section | L | R | w | padL |
|---|---|---|---|---|
| How It Works | **240** | 1680 | 1440 | 104px |
| Before After | **240** | 1680 | 1440 | 104px |
| Pricing | **240** | 1680 | 1440 | 104px |
| CTA Content | **52** | 1388 | 1336 | 0 |
| Footer CTA | 0 | 1920 | 1920 | 72px |
| Bento Grid | **104** | 1544 | 1440 | 0 |

Padahal desainnya **fluid** — gutter tetap 72/104, konten melebar mengisi viewport.

Perhatikan inkonsistensi: How/BA/Pricing di 240 (center), Bento di 104 (kiri),
Footer di 0 (full), CTA di 52. **Empat alignment berbeda** di satu halaman.

**Fix:** semua section pakai satu pola:
```css
padding-inline: var(--v2-gutter);   /* 104 */
width: 100%;
max-width: none;                     /* bukan 1440 */
```
Konten di dalam mengisi sisa lebar. Bento tetap breakout (padding 96/104 + Grid 1440
di 1440; di 1920 Grid = 1920−104 = 1816).

## BUG 3 — Bento Grid mentok 1440, nggak ikut melebar

Di 1920: `Bento Grid w=1440, R=1544` — padahal viewport 1920. Section Bento
`padding: 96px 104px` tapi Grid dikunci `width: 1440`.

**Fix:** `width: 100%` (bukan 1440) + `margin-right: -104px` tetap, supaya di 1440
jadi 1440 dan di 1920 jadi 1816.

## BUG 4 — CTA Content mentok 1336

Di 1920: `CTA Content w=1336, L=52` — 1336 itu angka desain 1440. Di 1920 harusnya
`1920 − 2×52 = 1816`.

**Fix:** `width: 100%; max-width: none` di dalam wrapper berpading 52.

## BUG 5 — Footer CTA `padding-inline: 72px`, tidak konsisten dengan section lain

Footer pakai 72, section lain 104. Di desain `.pen`, `F2 CTA` `padding: [40, 72]`
— jadi 72 memang benar **untuk F2 CTA**. Tapi `Footer bottom` `padding: 18px 70px`
dan section lain 104. Ini bukan bug, tapi perlu dipastikan memang disengaja.
Rekomendasi: biarkan (ikut `.pen`), jangan disamakan.

---

## Ringkas: satu pola untuk semua

```css
/* section wrapper */
padding-inline: var(--v2-gutter);   /* clamp(1.25rem, 7.25vw, 6.5rem) */
max-width: none;                     /* JANGAN 1232 / 1440 */
width: 100%;

/* konten di dalam */
width: 100%;                         /* bukan px tetap */
```

Pengecualian yang dibenarkan `.pen`:
- **Hero**: `padding-inline: 72px`, Sheet `width: 668` tetap (kartu berukuran tetap)
- **Bento Grid**: `margin-right: -104px` (breakout satu sisi)
- **F2 CTA**: `padding: 40px 72px`
- **Footer bottom**: `padding: 18px 70px`

---

## Verifikasi (harus di 3 viewport)

Untuk **setiap** viewport 1440, 1920, 2560:

| Cek | Syarat |
|---|---|
| `clientWidth` | sama dengan target |
| `Live counter` kanan | `clientWidth − 72` (±2) |
| `Live counter` vs `Sheet` | **tidak overlap** |
| `Sheet` kanan | `clientWidth − 72` (±2) |
| `How/BA/Pricing` konten | `L = 104`, `R = clientWidth − 104` |
| `Bento Grid` | `L = 104`, `R = clientWidth` |
| `CTA Content` | `L = 52`, `R = clientWidth − 52` |
| overflow horizontal | `false` |
| tinggi section | 971 / 1380 / 867 di semua lebar (kecuali wrap teks) |

---

## Catatan: kenapa ini lolos sebelumnya

Audit gue selama ini di **1440 saja** — viewport desain. Di 1440 semua angka match,
jadi 22 gate hijau. Bug-nya cuma muncul di viewport lain.

**Pelajaran untuk skill `pixel-parity-audit`:** parity di artboard width itu syarat
perlu, bukan cukup. Wajib ukur juga di **minimal satu viewport lebih lebar** untuk
menangkap nilai absolut yang tidak fluid, dan satu lebih sempit untuk menangkap overflow.
