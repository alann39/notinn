# Fix Batch 9 — Bento mobile: swipe horizontal (carousel)

Keluhan user: "coba cek mobile view, di preview gue masih berantakan untuk section
02 — The Web Dashboard. Mending bisa di-swipe dari kanan ke kiri aja, jadi nggak
terlalu panjang."

---

## Kondisi terukur sekarang (mobile)

| Viewport | Bento tinggi | Grid w | Tile w | Page total |
|---|---|---|---|---|
| 390 | **1928px** | 333 | 333 | **8918px** |
| 430 | 1822px | 368 | 368 | 8721px |
| 768 | 1757px | 657 | 657 | 8351px |

Semua 6 tile di-stack 1 kolom (`grid-template-columns: minmax(0,1fr)` di
`@media max-width:768px`), jadi section-nya jadi **1928px tinggi** di HP dan
halaman total **8918px**. Itu yang user rasa "terlalu panjang".

Masalah tambahan dari vision review di 390:
- Dashboard tile (333px) memaksa grid 2 kolom di dalam mockup → kartu note
  terpotong, tag meluber keluar tepi.
- `.v2-dash` `height: 240px` sementara kontennya butuh lebih → isi kepotong.

---

## Yang diminta

Bento di mobile jadi **horizontal swipe carousel**: tile tersusun menyamping,
user geser kanan-kiri. Bukan stack vertikal panjang.

---

## Fix

### 1. Breakpoint mobile: Bento jadi carousel

Di `@media (max-width: 768px)`, ganti stack jadi scroll-snap carousel.

```css
@media (max-width: 768px) {
  /* Grid jadi track horizontal */
  .v2-bento__grid {
    display: flex;
    flex-direction: column;      /* dua row tetap: A lalu B */
    gap: 12px;
    overflow: visible;           /* jangan clip, biar tiap row bisa scroll sendiri */
  }

  /* Tiap row jadi track yang bisa digeser */
  .v2-bento__row--a,
  .v2-bento__row--b {
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    gap: 12px;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x mandatory;
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;       /* Firefox */
    padding-bottom: 4px;         /* ruang shadow */
  }
  .v2-bento__row--a::-webkit-scrollbar,
  .v2-bento__row--b::-webkit-scrollbar { display: none; }

  /* Side Tiles (Search+Ask) jangan jadi kolom, biar ikut track */
  .v2-bento__side {
    display: contents;           /* anak-anaknya naik ke track Row A */
  }

  /* Tiap tile jadi kartu selebar ~82% viewport, snap ke kiri */
  .v2-bento__row--a > .v2-tile,
  .v2-bento__row--a > .v2-bento__side > .v2-tile,
  .v2-bento__row--b > .v2-tile {
    flex: 0 0 82%;
    width: 82%;
    max-width: 340px;
    scroll-snap-align: start;
    scroll-snap-stop: always;
  }

  /* Dashboard tile butuh ruang lebih karena berisi mockup */
  .v2-tile--dashboard { flex-basis: 88%; width: 88%; max-width: 380px; }

  /* Tinggi seragam biar rapi */
  .v2-bento__row--a > .v2-tile,
  .v2-bento__row--b > .v2-tile { height: auto; min-height: 300px; }
}
```

**Catatan `display: contents`:** `.v2-bento__side` sekarang wrapper berisi Search +
Ask (kolom vertikal). Untuk carousel, anak-anaknya harus jadi sibling di track Row A.
`display: contents` melakukan itu tanpa mengubah markup. Kalau browser target tidak
support (Safari < 11.1 — tidak relevan sekarang), fallback: ubah markup jadi flat.

**Cek markup dulu** sebelum pakai `display: contents`: kalau `.v2-bento__side` punya
`gap`/`padding` sendiri, properti itu hilang saat `contents`. Pindahkan gap ke track.

### 2. Perbaiki mockup dashboard di mobile

```css
@media (max-width: 768px) {
  .v2-dash { height: auto; aspect-ratio: 812 / 520; }
  .v2-dash__shot { height: 100%; object-fit: cover; }
  /* Mockup internal: jangan paksa 2 kolom kalau sempit */
  .v2-dash__grid { grid-template-columns: minmax(0, 1fr); }
}
```

Kalau mockup dashboard adalah gambar (`<img>`), cukup `aspect-ratio` + `object-fit: cover`
— jangan biarkan `height: 240px` memotong.

### 3. Indikator swipe (opsional tapi disarankan)

Biar user tahu bisa digeser, tambah petunjuk halus di bawah track:

```css
@media (max-width: 768px) {
  .v2-bento__row--a::after,
  .v2-bento__row--b::after {
    content: "";
    flex: 0 0 1px;
  }
}
```

Atau lebih eksplisit: tambah `<p class="v2-bento__hint">Geser untuk lihat lainnya →</p>`
di markup, tampil hanya di mobile, `aria-hidden="true"` karena instruksi visual.
**Rekomendasi: pakai hint teks**, lebih jelas daripada dot dekoratif.

### 4. A11y wajib

- Track yang bisa di-scroll harus **fokusable**: `tabindex="0"` + `role="region"` +
  `aria-label` ("Dashboard tiles, geser horizontal"). Tanpa ini keyboard user tidak
  bisa menggeser.
- `scroll-snap-type: x mandatory` + `scroll-snap-align: start` sudah cukup untuk
  navigasi keyboard (arrow key bekerja di elemen fokusable).
- `prefers-reduced-motion: reduce` → `scroll-behavior: auto`.

---

## VERIFIKASI

```
npx tsc --noEmit                                             -> exit 0
npm run build:client                                         -> PASS
npx eslint src/components/landing/v2 src/app/landing-page.tsx -> exit 0
```

Ukur di 390, 430, 768, dan pastikan 1440 TIDAK berubah:

### Mobile (390)
- `.v2-bento__row--a` `overflow-x` = **auto** (bukan visible)
- `.v2-bento__row--a` `scrollWidth` **>** `clientWidth` (artinya ada yang bisa digeser)
- `.v2-bento__row--a` `scroll-snap-type` mengandung **x mandatory**
- tinggi `.v2-bento` **≤ 900px** (sekarang 1928px)
- tinggi halaman total **< 7000px** (sekarang 8918px)
- `overflow horizontal di documentElement` = **false**
- tiap `.v2-tile` di row A/B: `flex-basis` ≈ 82% (dashboard 88%)
- track punya `tabindex="0"` dan `role="region"`

### Desktop (1440) — regresi
- `.v2-bento__row--a` `display` = **grid** (bukan flex)
- `.v2-bento__grid` width = **1232**, L=104, R=104
- tinggi `.v2-bento` = **1380** (tidak berubah)
- Dashboard w=812, Side w=404, Row B 404/404/392
- tidak ada `overflow-x: auto` di row

### 768 (batas breakpoint)
- Tentukan: 768 masuk mobile atau desktop? Sekarang `max-width: 768px` → **mobile**.
  Pastikan konsisten dan tidak ada state aneh di tepat 768.

---

## LARANGAN

- Jangan ubah desktop (≥1101px). Semua perubahan di dalam `@media (max-width: 768px)`.
- Jangan hapus/ubah tile, isi, warna, radius, font, aset.
- Jangan sentuh `.v2-hero`, `.v2-pricing`, `.v2-cta`, `.v2-footer`, dock, FAQ.
- Jangan sentuh Cornell / `tsconfig.json`.
- Jangan pakai GSAP atau library carousel. CSS scroll-snap saja.
