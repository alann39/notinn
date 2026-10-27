# Audit Pixel #3 — diff penuh (semua elemen bernama)

Metode: extract 261 layer bernama dari `v2-export.html`, ukur di browser pada
`clientWidth = 1440` (diverifikasi, bukan diasumsikan), lalu diff per field
terhadap counterpart di live. Bukan lagi gate pilihan sendiri.

**Hasil: 46 elemen dipetakan, 61 selisih nyata, 6 di antaranya struktural.**

Yang sudah benar (jangan disentuh): Pricing mirror, Receipt rotate, F2 CTA oranye,
Bento breakout 1440, transition scaleY, Sheet 708/604, Brand gap 4, Index 90,
CTA Content 1336/52/271, semua radius, semua font, 9 aset.

---

## STRUKTURAL 1 — Hero pakai gutter 72px, bukan 104px

**Ini temuan terbesar yang tersisa.** Hero BUKAN bagian dari kontainer 1232/104.
Di `.pen`, anak-anak Hero punya `x` absolut sendiri:

| Elemen | `.pen` x | Live x | Selisih |
|---|---|---|---|
| Brand | **72** | 104 | +32 |
| Hero Headline | **72** | 104 | +32 |
| Index list | **72** | 104 | +32 |
| Specimen Sheet | **700** | 668 | −32 |
| Live counter | **1160** | 1167.4 | +7.4 |

Aritmetika desain: `72 + 560 = 632` (headline), `700 + 668 = 1368`, `1440 − 1368 = 72`.
Jadi Hero punya gutter simetris **72**, bukan 104.

Konsekuensi: seluruh Hero bergeser 32px ke kanan, dan Specimen Sheet 32px ke kiri.
Karena Sheet kanan harus di 1368 (= 700 + 668), sedangkan live 668 + 668 = 1336.

**Fix:** Hero pakai `padding-inline: 72px` sendiri (bukan `--v2-gutter`), layout
`560px + gap + 668px` dengan Sheet di-anchor kanan.

Catatan: `Live counter` di desain `x=1160`, artinya `1160 + 166.6 = 1326.6`,
bukan 1368. Jadi counter bukan rata kanan Sheet — dia punya offset sendiri.
Ikuti angka `.pen`: `left: 1160`.

---

## STRUKTURAL 2 — Gap vertikal antar-blok section hilang

Tiga section punya `gap` eksplisit di `.pen`, live-nya `normal` (0):

| Section | `.pen` gap | Live gap | Akibat tinggi |
|---|---|---|---|
| How It Works | **64** | normal (0) | 971 → 931.8 (**−39.2**) |
| Bento | **40** | normal (0) | 1380 → 1188 (**−192**) |
| Before After | **48** | normal (0) | 867 → 870 (+3) |

Tinggi anak-anaknya sudah benar (How Header 137.8 vs 159? — lihat bawah), jadi
yang hilang murni gap antar-blok.

---

## STRUKTURAL 3 — Bento padding kanan hilang, lebar jadi 1544

`.pen`: `Bento` → `padding: [96, 104]` (vertikal 96, horizontal 104).
Live: `.v2-bento` → `padding: 96px 0px`, dan `.v2-bento__inner` → `width: 1544`, `padding-left: 104px`.

**1544 > 1440** — elemen ini lebih lebar dari viewport. Itu penyebab Bento
overflow internal. Desain: `Bento` full-bleed dengan padding 104 di kedua sisi,
tapi anak-anaknya (Bento Grid 1440) sengaja menembus padding kanan.

Baca ulang `.pen`: `Bento Grid width = fill_container` di dalam Bento yang
`padding: 104`. Jadi Grid = `1440 − 208 = 1232`… **tapi** export pen mengukur
Grid = 1440 dan Dashboard Tile = 812 mulai di `x=104`.

Artinya: Grid 1440 memang breakout ke kanan (menembus padding kanan), bukan
simetris. Ini breakout **satu sisi**, bukan dua sisi.

**Fix:** `Bento` `padding: 96px 104px`, Grid `width: 1440`, `margin-right: -104px`
(atau `margin-inline: 0 -104px`), sehingga Grid mulai di 104 dan berakhir di 1440.

---

## STRUKTURAL 4 — How It Works: padding horizontal hilang + How Header kurang tinggi

`.pen`: `How It Works` `padding: 112px 104px 96px`, `gap: 64`.
Live: `padding: 112px 0px 96px`, `gap: normal`. Padding horizontal dipindah ke
`.v2-how > *` (`padding: 0 104px`), jadi hasil visual mirip — tapi gap 64 hilang.

Tinggi anak: `.pen` How Header **159**, live 137.8 (**−21.2**).
`.pen` How Header: `gap: 16` (vertical), isi = Eyebrow Row (pill) + H2 760px.
Live: `v2-section-header` h 137.8.

---

## STRUKTURAL 5 — CTA Content ada DUA node bertumpuk

Live punya `.v2-cta__inner` (1440, pad 46/52) **dan** `.v2-cta__content` (1336, L52, h271)
di dalamnya. `.pen` cuma punya satu: `CTA Content` = 1336 @ L52, h 271, tanpa padding.

Akibatnya ada padding ganda: `inner` 46/52 + `grid` 1232. Angka `.pen` yang benar:
- `CTA Content` L52 w1336 h271 pad 0
- `CTA trust` L52 w1336 **Trel 422** (live: 458, **+36**)

**Fix:** hapus `.v2-cta__inner` sebagai wrapper berpading; jadikan `.v2-cta__content`
satu-satunya kontainer 1336 @ L52, lalu posisikan trust di 422.

---

## STRUKTURAL 6 — Footer bottom terlalu pendek

`.pen`: `Footer bottom` h **89.5**, pad `18px 70px`, 2 anak @ h16.
Live: h **52.5**, pad `18px 70px`.
Selisih **−37** = `18 (pad atas) + 16 + 16 + 18 (pad bawah)` = 68? Tidak —
89.5 − 36 = 53.5. Jadi ada gap antar anak di desain yang hilang.

**Fix:** tambahkan gap vertikal antar 2 anak footer bottom supaya total 89.5.

---

## SISA SELISIH (non-struktural, 40+ item)

| Elemen | Field | Desain | Live | Catatan |
|---|---|---|---|---|
| Live counter | w / h | 166.6 / 30 | 168.6 / 32 | padding 8/14 → text 12px, jadi 30 vs 32 |
| Live counter | radius | 9999px | 999px | kosmetik, sama secara visual |
| Live counter | left | 1160 | 1167.4 | ikut fix Hero gutter |
| Hero Headline | h | 334 | 330 | gap internal |
| Sheet head | gap | 0 | 6.4px | |
| Foot (how card) | fontSize | 16 | 12 | **cek**: teks `in-chat` di `.pen` = Paper Mono 14 |
| Foot | fontWeight | 400 | 500 | |
| Footer Note | h | 17 | 23 | |
| Footer Note | gap | 12 | 8 | |
| Footer Note | fontSize | 16 | 14 | `.pen` teks = Paper Mono 14, jadi **live benar** |
| Footer Note | padding | `0 4px 0 0` | 0 | |
| Dash caption | gap | 0 | 4px 16px | |
| Dash caption | fontSize | 16 | 14 | cek teks asli |
| Trust Bar | gap | 0 | 24px | |
| Pricing | padding | none | `64px 0` | `.pen` pakai posisi absolut, bukan padding |
| Receipt | h | 572.5 | 576.5 | +4 |
| Receipt | fontSize | 16 | 14 | teks isi = Paper Mono 14, live benar |
| CTA trust | fontSize | 16 | 14 | teks = Paper Mono 14, live benar |
| Dock Bar | bg | `rgba(11,11,10,0.9)` | `color(srgb …/0.9)` | sama, beda notasi |

**Penting:** beberapa baris `fontSize 16 vs 14` itu **false positive** — `.pen`
menulis `16` di node frame karena warisan, sedangkan teks aslinya `14`. Verifikasi
per-teks sebelum mengubah apa pun. Contoh terbukti: `Footer Note` teks `in-chat`
= Paper Mono **14** di `.pen`, jadi live yang 14 itu benar.

---

## Urutan fix

1. **Hero gutter 72** + Sheet anchor kanan (700..1368) + Live counter left 1160.
2. **Gap section**: How 64, Bento 40, BA 48.
3. **Bento padding** `96px 104px` + Grid breakout satu sisi (`margin-right: -104px`).
4. **CTA**: satu kontainer 1336 @ L52, trust Trel 422.
5. **Footer bottom** h 89.5.
6. Sisa kosmetik: Live counter h 30, Sheet head gap 0, Footer Note h17/gap12, Dash caption gap, Trust Bar gap.

## Larangan

- Jangan sentuh font (sudah benar), Pricing mirror (sudah benar), Receipt rotate (sudah benar), F2 CTA oranye (sudah benar), radius (sudah benar), aset (sudah benar).
- Jangan ubah `fontSize 16 → 14` atau sebaliknya tanpa membaca teks aslinya di `v2-export.html`.
- Jangan implement shader grain.
- Jangan sentuh file Cornell / tsconfig.json.
