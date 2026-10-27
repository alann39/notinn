# Landing v2 — progress

## Tahap 1 — selesai (dengan 1 blocker build di luar scope)

- **File dibuat/diubah**
  - `dashboard/src/index.css` (diubah — blok token `.landing-v2` setelah `.dark`)
  - `dashboard/src/styles/landing-v2.css` (baru)
  - `dashboard/src/components/landing/v2/hero.tsx` (baru)
  - `dashboard/src/components/landing/v2/specimen-sheet.tsx` (baru)
  - `dashboard/src/components/landing/v2/floating-dock.tsx` (baru)
  - `dashboard/src/components/landing/v2/primitives/file-row.tsx` (baru)
  - `dashboard/src/components/landing/v2/primitives/marquee-item.tsx` (baru)
  - `dashboard/src/components/landing/v2/primitives/stat-block.tsx` (baru)
  - `dashboard/src/components/landing/v2/primitives/section-header.tsx` (baru)
  - `dashboard/src/app/landing-page.tsx` (diganti — hanya `Hero` + `FloatingDock`)

- **Token baru ditambahkan** (semua di `index.css`, di-scope ke `.landing-v2`)
  - `--text-primary` → `#0A0A0A`
  - `--ink-hover` → `#0A0A0A0A`
  - `--accent` → `#FF6308`
  - `--accent-line-soft` → `#FF630833`
  - `--bg` → `#FFFFFF` (dan `--on-dark` → `#FFFFFF`)
  - `--border-dark` → `#FFFFFF1F`
  - `--on-dark-label` → `#FFFFFF99`
  - `--body` → `#5B5B5B`
  - `--text-muted` → `#A7A7A7`
  - `--border` → `#E6E5E2`
  - `--bg-muted` → `#F2F1EF`
  - `--bg-subtle` → `#F9F8F6`
  - `--accent-ink` → `#B45309`
  - `--success` → `#28C840`
  - `--surface-dark` → `#0B0B0A`
  - `--label` → `#767270`
  - `--text-tertiary` → `#7D8187`
  - `--warning` → `#FEBC2E`
  - `--border-strong` → `#C7C4BE`
  - `--accent-surface-soft` → `#FFF4EC`

  **Kenapa scoped, bukan `:root`:** `--accent`, `--success`, `--warning`, `--border`
  sudah dipakai tema coss di seluruh dashboard. Override di `:root` akan mengecat ulang
  halaman notes/settings/admin. Karena `@theme inline` me-resolve `var(--accent)` di
  elemen, scope `.landing-v2` tetap membuat utility Tailwind (`bg-accent` dll.) benar di
  dalam landing tanpa menyentuh app. Hex `#3D3D3D` tidak dibuatkan token baru — memakai
  `--text-primary` sesuai instruksi.

- **Warna NGGAK KETEMU**
  - Dot kiri `Specimen Sheet` di outline hanya ditulis `fill→danger?` tanpa hex. Tidak ada
    token `danger` di tabel, jadi dipetakan ke `--accent` (token terdekat). Kalau desain
    memang punya merah macOS, perlu token baru — belum dibuat.
  - `#00000000` (stroke Search Tile, Tahap 2) → transparan, tidak butuh token.
  - `$on-accent-field-border` (Search field, Tahap 2) belum ada di tabel → akan diputuskan
    di Tahap 2.
  - `#FFFFFF1A` (border Footer bottom, Tahap 4) tidak ada di tabel; rencana pakai
    `--border-dark` (`#FFFFFF1F`) — belum diimplementasi.

- **Asumsi yang diambil**
  - **Brand mark** — desain hanya menyebut `Logo [rectangle 30x30]` tanpa isi. Dipakai
    monogram "N" putih di kotak `--text-primary`. Brand bukan link (halaman ini sendiri).
  - **Hero statis** — belum ada motion di Tahap 1. Rule "Framer Motion saja" tidak
    dilanggar karena tidak ada animasi JS; satu-satunya animasi adalah pulse dot `--success`
    (CSS, dimatikan oleh `prefers-reduced-motion`). Alasan: halaman ini di-prerender lewat
    `entry-server.tsx`; entrance animation berbasis state akan mengirim HTML dengan
    `opacity:0` ke crawler/no-JS.
  - **Sheet 668x660** — lebar 668 dipatuhi; tinggi mengikuti isi (±525–545px) karena
    spacing antar-blok di outline tidak menyebut angka. Tidak memaksa `min-height: 660px`
    supaya tidak muncul ruang mati.
  - **Index list** — tiap baris punya `stroke→border` sendiri, jadi dirender sebagai tiga
    kotak ber-border terpisah (gap 8px), bukan satu tabel dengan divider.
  - **Task selesai** — item pertama (`@arun`) punya checkbox terisi + teks `text-muted` di
    outline; ditambah `line-through` sebagai penanda selesai, plus `sr-only "Done: "`.
  - **Checkbox & "Ask this note a question"** adalah mock statis — dirender `span`/`p`,
    bukan kontrol palsu yang tidak berfungsi.
  - **Anchor dock** (kontrak untuk tahap berikutnya): `#capture` (Hero, sudah ada),
    `#how-it-works` + `#dashboard` + `#tags` (Tahap 2), `#faq` (Tahap 3). Sampai tahap itu
    href-nya inert; `focusHashTarget` sudah aman untuk target yang belum ada.
  - **Grid rules** dibatasi `max-width: 1440px` supaya tetap sejajar dengan konten di
    layar >1440.
  - **FileRow/MarqueeItem/StatBlock/SectionHeader** sudah dibuat lengkap dengan styling,
    dipakai di Tahap 2–3. `FileRow` mengasumsikan konteks tile gelap (border
    `--border-dark`, warna inherit) sesuai Export tile di Bento.

- **Verifikasi**
  - `npm --prefix dashboard run build:client` → **FAIL** (blocker di luar scope, lihat bawah)
  - `npx vite build` (di `dashboard/`) → **PASS** — `✓ built in 25.86s`
  - `npx tsc --noEmit` → 12 error, **semuanya** di file Cornell untracked yang sudah rusak
    sebelum Tahap 1; **0 error** di file landing v2
  - `npx tsc -p tsconfig.landing-v2-check.json --noEmit` (config sementara yang hanya
    mengecualikan 8 file Cornell di atas) → **exit 0**. Config sementara sudah dihapus.
  - `npx eslint src/components/landing/v2 src/app/landing-page.tsx` → **exit 0**
  - Visual (dev + preview, Chromium): 1440x920, 1280x800, 1920x1080, 900x1000, 390x844 —
    `scrollWidth === clientWidth` di semua lebar, `--accent`/`--text-primary` resolve,
    H1 Manrope 62px @1440, dock `position: fixed`, nav punya accessible name.
    `/#capture` memfokuskan `<section id="capture" tabindex="-1">`
    (`document.activeElement.id === "capture"`).
  - Dua bug ditemukan & diperbaiki saat smoke: (1) pita hitam di bawah hero pada viewport
    >920px — `.landing-v2` belum `min-height: 100vh`; (2) grid line melebar sampai 1920px
    sementara konten capped 1440px — grid sekarang `max-width: 1440px`.

- **A11y yang dipertahankan:** `skip-link` → `#main-content` (`tabIndex={-1}`),
  `applyPageMetadata({ lang: "en", robots: "noindex, nofollow" })`, `focusHashTarget()` +
  listener `hashchange`, landmark `main` + `nav[aria-label]`, ikon dekoratif `aria-hidden`,
  label dock lewat `sr-only`, `aria-current="location"` untuk item aktif, dan
  `prefers-reduced-motion` untuk pulse/transisi.

- **Sisa/blocker**
  - **`build:client` gagal karena pekerjaan Cornell yang belum selesai, bukan landing.**
    Output sebelum Tahap 1 dan sesudahnya identik: 12 error TS di
    `src/app/test-cornell-editor-page.tsx`, `src/components/dashboard/cornell-*.ts(x)`
    (`Cannot find module '../../types/cornell.ts'`, `CornellNote` tidak diekspor
    `src/types/notes.ts`). Semua file itu untracked (WIP pengguna). Tidak disentuh: bukan
    scope landing dan memperbaikinya berarti mengarang tipe untuk fitur lain. Begitu file
    Cornell itu beres, `build:client` akan lolos karena `tsc` proyek (tanpa file tersebut)
    sudah exit 0.
  - `landing.css` dan `prisma-hero.css` sengaja belum dihapus (rule 5). `legal-page.tsx`
    masih memakai `landing.css`, jadi file itu tidak boleh dihapus di Tahap 4 —
    `prisma-hero.css` yang bisa dihapus setelah komponen lama dibuang.
  - Section lain (`input-marquee`, `how-it-works`, `bento`, `before-after`,
    `section-transition`, `pricing-receipt`, `closing-cta`, `footer`) belum dibuat — Tahap 2–4.


## Tahap 2 — selesai

- **File dibuat/diubah**
  - `dashboard/src/components/landing/v2/input-marquee.tsx` (baru)
  - `dashboard/src/components/landing/v2/how-it-works.tsx` (baru — 3 ilustrasi
    struktural ada di file yang sama sebagai komponen lokal)
  - `dashboard/src/components/landing/v2/bento.tsx` (baru — 6 tile)
  - `dashboard/src/styles/landing-v2.css` (diubah — blok Input Marquee / How It
    Works / Bento + rules di 3 media query yang sudah ada)
  - `dashboard/src/app/landing-page.tsx` (diubah — `Hero` → `InputMarquee` →
    `HowItWorks` → `Bento` di dalam `<main id="main-content">`)
  - Primitives Tahap 1 dipakai apa adanya: `MarqueeItem` (24 item = 12 × 2,
    weight 500/300 berselang-seling sesuai desain), `SectionHeader` (pill+`route`
    untuk How It Works, plain untuk Bento), `StatBlock` (3×), `FileRow` (3× di
    Export tile). Tidak ada primitive yang diubah — hanya satu override
    ter-scope `.v2-how .v2-stat-block__foot` (lihat asumsi 7).

- **Token baru ditambahkan:** tidak ada. Semua warna existing cukup.

- **Warna NGGAK KETEMU**
  - `#00000000` (stroke Search Tile) → transparan, tidak perlu token; tile
    dirender tanpa border (sesuai outline).
  - `$on-accent-field-border` (border Search field) → `--accent-line-soft`
    (`#FF630833`). Nama variabelnya tidak ada di tabel token.
  - `accent-surface-soft?` (fill Input Marquee — outline sendiri pakai tanda
    tanya) → `--accent-surface-soft` (`#FFF4EC`).
  - `{paused}` / `w` / `f` / `v` / `e` (layer spacer) → bukan warna, tidak
    dibuat jadi elemen: semuanya jadi `gap`/`padding` flex.

- **Asumsi yang diambil**
  1. **Marquee pakai CSS keyframes, bukan Framer Motion.** Rule "Framer Motion
     saja" mengatur *engine* animasi JS; di section ini tidak ada animasi JS sama
     sekali. Alasan: (a) halaman ini di-prerender (`entry-server.tsx`) dan loop
     dekoratif tidak boleh bergantung pada hidrasi; (b) rAF terus-menerus untuk
     hiasan adalah biaya tanpa hasil; (c) `prefers-reduced-motion` bisa dimatikan
     murni lewat media query. GSAP tidak dipakai di mana pun.
  2. **WCAG 2.2.2**: strip bergerak >5 detik, jadi ada tiga mekanisme jeda —
     hover, `focus-within`, dan tombol toggle yang selalu ada di tab order
     (terlihat saat hover/fokus, dan tetap terlihat setelah di-pause). Di
     `prefers-reduced-motion` animasi mati, set duplikat disembunyikan, tombol
     disembunyikan (tidak ada gerak = tidak ada yang perlu dijeda).
  3. **Track `aria-hidden`.** Pembaca layar mendapat `<h2 class="sr-only">` +
     daftar 6 format sekali, bukan 24 item duplikat.
  4. **Ilustrasi 3 langkah kosong di outline** (`Illustration — Capture [frame
     341x196]` tanpa child). Digambar ulang sebagai bentuk struktural: bubble
     chat + waveform + tombol kirim, kartu catatan + badge, search field + 2 baris
     hasil. **Tanpa teks** — mengarang label di dalam ilustrasi berarti mengarang
     copy.
  5. **Row B Bento = tiga tile gelap.** Outline memberi `stroke=$border-dark` di
     Formats dan Export, nol di Voice; tile campuran terang/gelap dalam satu baris
     tidak masuk akal visual dan `FileRow` (primitif Tahap 1) sudah berasumsi
     konteks gelap. Voice ikut gelap.
  6. **`Dash shot` (rectangle 812x457) dirender sebagai skeleton tanpa kata**:
     bar aplikasi + 3 kartu galeri dengan preview halaman (12 garis). Sumber
     desain tidak punya screenshot dan judul catatan palsu = copy karangan.
     Caption di bawahnya memakai copy asli (`Notes library · grid view`,
     `Showing 3 notes`).
  7. **Proporsi, bukan piksel.** Desain 1440 dengan konten 1232px, sedangkan
     kontainer Tahap 1 menghasilkan ~1310px @1440. Grid memakai rasio
     `812fr / 410fr` (row A) dan 3 kolom sama (row B) dengan gap 10px, jadi
     ritmenya sama walau lebar absolutnya beda. `Foot` StatBlock dinaikkan ke
     atas artwork (override ter-scope) supaya ilustrasi menempel di tepi bawah
     kartu seperti layer terakhir di outline, bukan menggantung dengan ruang mati
     di antara body dan meta.
  8. **`stroke=$border` pada frame Bento** diterjemahkan jadi hairline
     `border-top` section — bg sudah berubah dari putih ke `--bg-subtle` di sana.
  9. Section 2 dan 3 tidak punya tinggi di outline → `padding-block:
     clamp(4rem, 8vw, 7rem)`.
  10. `in‑chat` disalin apa adanya dari `v2-copy.md`, termasuk hyphen non-breaking
      (U+2011).

- **Build / verifikasi**
  - `npm --prefix dashboard run build:client` → **PASS** (`✓ built in 20.93s`).
    Catatan: blocker Cornell hilang karena **pengguna sendiri** menambahkan 8 file
    `cornell-*`/`test-cornell-editor-page.tsx` ke `exclude` di
    `dashboard/tsconfig.json` (mtime 21:06). Saya tidak menyentuh file Cornell
    maupun tsconfig.
  - `npx tsc --noEmit` (di `dashboard/`) → **exit 0**, 0 error.
  - `npx vite build` → **PASS** (`✓ built in 22.42s`).
  - `npx eslint src/components/landing/v2 src/app/landing-page.tsx` → **exit 0**.
  - Visual (Chromium, preview `dist` di 4176): 1440x900, 1280x800, 390x844 —
    `scrollWidth === clientWidth` di ketiganya. Marquee 96px (72px mobile),
    teks 28px @1440 / 20px @390, track bergerak 63px/s (5272px per 42s), pause
    lewat hover/fokus/klik (`data-paused="true"`, label berubah jadi "Resume the
    scrolling list"). Grid 3 kartu, ilustrasi 380x196 @1440 dan 300x172 @390,
    tile Bento 864x560 + 436x560 dan row B 430x296 (semua sama tinggi per baris),
    waveform 35 bar. `/#dashboard` memfokuskan section (`document.activeElement.id
    === "dashboard"`, top = 96px karena `scroll-margin-top`). Tidak ada konten
    yang overflow dari tile.
  - Dua bug ditemukan & diperbaiki saat smoke: (1) meta row StatBlock terdorong
    `margin-top:auto` sehingga ada ruang mati di atas artwork — sekarang artwork
    yang mengambil sisa ruang; (2) `Dash fade` di-`bottom: 52px` (angka ajaib
    yang meleset begitu caption wrap di mobile) — fade dipindah jadi `::after`
    milik shot, jadi selalu menempel di tepi bawah shot.

- **Sisa/blocker**
  - **`#tags` masih tidak punya target.** Outline tidak punya section tags sama
    sekali; dock masih menautkan `#tags` (inert). Perlu keputusan di Tahap 4
    (hapus item dock atau arahkan ke section lain) — saya tidak mengarang id.
    `#faq` masih inert seperti rencana (Tahap 3).
  - `dashboard/tsconfig.json` sekarang punya `exclude` Cornell dari pengguna.
    Kalau file Cornell itu nanti dibersihkan/dipindah, `exclude` perlu ikut
    dirapikan — bukan bagian landing.
  - Section Tahap 3–4 (`before-after`, `section-transition`, `pricing-receipt`,
    `closing-cta`, `footer`) belum ada. `landing.css` / `prisma-hero.css` tetap
    utuh (rule 5).

## Tahap 3 — selesai

- **File dibuat/diubah**
  - `dashboard/src/components/landing/v2/before-after.tsx` (baru)
  - `dashboard/src/components/landing/v2/section-transition.tsx` (baru)
  - `dashboard/src/components/landing/v2/pricing-receipt.tsx` (baru)
  - `dashboard/src/styles/landing-v2.css` (diubah — blok Before After,
    Section transition, Pricing + rules di 3 media query)
  - `dashboard/src/app/landing-page.tsx` (diubah — `Bento` → `BeforeAfter` →
    `SectionTransition` → `PricingReceipt` → `SectionTransition`)
  - Primitives Tahap 1 dipakai apa adanya: `SectionHeader` (BA + Pricing).
    Tidak ada primitive yang diubah.

- **Token baru ditambahkan:** tidak ada. Semua warna memakai token Tahap 1:
  `--bg`, `--bg-subtle`, `--bg-muted`, `--border`, `--border-strong`,
  `--text-primary`, `--text-muted`, `--text-tertiary`, `--body`, `--label`,
  `--accent`, `--accent-line-soft`, `--accent-ink`, `--accent-surface-soft`,
  `--on-dark`.

- **Warna NGGAK KETEMU:** tidak ada hex baru. Satu keputusan turunan:
  kotak ikon `check` di kartu Before/After tidak punya `fill` di outline,
  sementara ikonnya dianotasi `→ bg/on-dark`. Supaya ikon putih terbaca,
  kotaknya diisi `--text-primary` (bukan hex baru). Kotak `close` memakai
  `1px --border` + ikon `--text-muted` sesuai garis luarnya.

- **Asumsi yang diambil**
  1. **Section Transition = ruang napas 120px, bukan konten.** Frame desain
     `1440x120` tidak punya `fill` maupun child; outline menampilkan seluruh
     fill yang ada, jadi tidak ada yang disembunyikan. Komponen merender satu
     band `aria-hidden` setinggi 120px (72px ≤768) dengan latar `--bg-subtle`.
     Satu komponen dipakai dua kali, sesuai urutan desain (sebelum dan sesudah
     Pricing). Tidak ada ornamen yang dikarang.
  2. **Art Before/After = sketsa CSS tanpa kata.** Desain hanya memberi frame
     `176x176` + satu rectangle `150x150` tanpa artwork ter-export. Mengikuti
     preseden Tahap 2, tiap plate diberi satu sketsa struktural (bubble+dot,
     lembar catatan, kaca pembesar, dokumen terlipat) yang murni dekoratif
     (`aria-hidden`), tanpa teks baru, tanpa SVG manual.
  3. **Tinggi kartu 224px tercapai dari padding.** `176px` art + `1.5rem`
     padding atas/bawah = 224px, sama dengan desain. Teks 18/600 + dua baris
     state 14px masuk tanpa memaksa tinggi.
  4. **Grid Before/After 2 kolom sampai 1100px.** Di bawah 1100px dua kartu
     ~489px sudah tidak muat untuk art 176px + copy; grid jadi 1 kolom. Art
     mengecil 120px (≤768) dan 96px (≤480), plate ikut `width:
     calc(100% - 24px)`.
  5. **Pricing = header + FAQ di kiri, receipt di kanan.** Rasio kolom
     `653fr / 440fr` dengan gap `clamp(2rem, 9.6vw, 8.6875rem)`; receipt
     dibatasi `max-width: 440px` dan `justify-self: end`. `SectionHeader`
     dipakai ulang dengan override ter-scope: judul 60px, intro 16px/380px,
     eyebrow `--accent-ink` — sesuai angka desain, tanpa varian primitive baru.
  6. **FAQ statis, bukan accordion.** Desain menampilkan kelima tanya-jawab
     terbuka sekaligus, jadi dirender sebagai lima blok; menambah kontrol
     buka-tutup akan mengubah perilaku yang tidak diminta. Container FAQ
     diberi `id="faq"` + `tabIndex={-1}` supaya item dock `#faq` yang sejak
     Tahap 1 inert sekarang mendarat dan memfokuskan target (sudah diuji).
  7. **Receipt memakai HTML semantik.** Meta dan totals sebagai `dl`,
     line items sebagai `ul`, pemisah sebagai `hr`, brand sebagai `h3`
     (`aria-labelledby` pada `<article>`). Barcode 35 bar (`width` 1–3px dari
     outline) dan titik `·` pada tiga item ditandai `aria-hidden` karena
     dekoratif; pembaca layar tetap mendapat nama item.
  8. **Tidak ada motion JS baru.** Tidak ada entrance/scroll animation di
     ketiga section ini, jadi rule “Framer Motion saja” tidak dilanggar dan
     tidak ada GSAP. Semua warna/ukuran statis; `prefers-reduced-motion` tidak
     perlu rule tambahan.
  9. **Link CTA** memakai `TELEGRAM_URL` yang sudah ada; `target="_blank"` +
     `rel="noopener noreferrer"` mengikuti CTA Hero.

- **Verifikasi**
  - `npx tsc --noEmit` (di `dashboard/`) → **exit 0**.
  - `npm run build:client` → **PASS**, `BUILD_EXIT=0`, `✓ built in 37.51s`
    (warning chunk >500 kB sudah ada sebelumnya, bukan dari Tahap 3).
  - `npx eslint src/components/landing/v2 src/app/landing-page.tsx` → **exit 0**.
  - Visual Chromium terhadap `dist` (`serve:dist`, 127.0.0.1:4173):
    - 1440x900: `scrollWidth === clientWidth` (1440). BA section 989px,
      grid 2×2, kartu 643x226, art 176x176, plate 150x150. Dua transition
      masing-masing 120px. Pricing 970px (desain 980), receipt 440x663,
      5 FAQ, 35 bar barcode, judul pricing 60px, intro 16px.
    - 1024x900 dan 768x900: BA + pricing jadi satu kolom, receipt 520px / 440px,
      `scrollWidth === clientWidth`, tidak ada overflow di kartu/receipt/FAQ.
    - 390x844: `scrollWidth === clientWidth` (390), BA 4 kartu 350x155, art 96,
      plate 70, transition 72px, receipt 350x651, tidak ada overflow.
    - `/#faq` → `location.hash === "#faq"`, `document.activeElement.id ===
      "faq"` (DIV), jadi anchor dock berfungsi.
    - Teks receipt & FAQ dibaca balik dari DOM: 409 karakter receipt, 5
      pertanyaan, 4 judul kartu BA — semuanya cocok dengan `v2-copy.md`.
  - Satu bug ditemukan & diperbaiki saat smoke: plate art memakai
    `max-width: calc(100% - 26px)` yang tetap resolve ke 150px, sehingga di
    390px plate menutupi 3–4 huruf pertama judul kartu (“You”, “A m”, …).
    Diganti `width: calc(100% - 24px); max-width: 150px`; judul penuh lagi dan
    plate desktop tetap 150px.

- **A11y yang dipertahankan/ditambah:** heading h2 per section lewat
  `SectionHeader` (`aria-labelledby`), kartu BA memakai `article` + `h3`,
  receipt `article` + `h3`, FAQ `h3`; ikon dekoratif `aria-hidden`; CTA
  eksternal punya teks; `#faq` fokusable; tidak ada gambar/teks tersembunyi
  yang membawa informasi.

- **Sisa/blocker**
  - `#tags` masih inert (tidak ada section tags di outline) — keputusan Tahap 4.
  - `closing-cta`, `footer`, dan finalisasi `FloatingDock` belum dibuat
    (Tahap 4). `landing.css` / `prisma-hero.css` tetap utuh.
  - File Cornell dan `dashboard/tsconfig.json` tidak disentuh.
  - Berhenti di Tahap 3, tidak lanjut Tahap 4.

## Tahap 4 — selesai

- **File dibuat**
  - `dashboard/src/components/landing/v2/closing-cta.tsx`
  - `dashboard/src/components/landing/v2/footer.tsx`
- **File diubah**
  - `dashboard/src/components/landing/v2/floating-dock.tsx` — scroll-spy
    `IntersectionObserver` (band 10% tinggi viewport) untuk `#capture`,
    `#how-it-works`, `#dashboard`, `#faq`; `aria-current="location"` hanya pada
    section yang sedang di tengah. Props `activeId` dihapus (tidak ada pemakai).
    `#tags` sengaja tidak ikut observasi karena target-nya berada di dalam
    `#capture`.
  - `dashboard/src/app/landing-page.tsx` — komposisi `… <SectionTransition />
    <ClosingCta />` di dalam `<main>`, lalu `<Footer />` (di luar `<main>`,
    `role="contentinfo"`). `focusHashTarget()` sekarang mengulang fokus pada
    `requestAnimationFrame`: Firefox/WebKit memindahkan fokus kembali ke anchor
    yang diklik sesudah `hashchange`, sehingga fokus tunggal hilang.
  - `dashboard/src/components/landing/v2/specimen-sheet.tsx` — daftar tag di
    specimen sheet diberi `id="tags"` + `tabIndex={-1}` sebagai target dock.
  - `dashboard/src/components/landing/v2/pricing-receipt.tsx` — `#pricing`
    diberi `tabIndex={-1}` karena link footer “Pricing” menunjuk ke sana.
  - `dashboard/src/styles/landing-v2.css` — blok Closing CTA + Footer, varian
    `.v2-btn--surface`, rules tablet/phone, `transition: none` untuk kontak
    footer pada `prefers-reduced-motion`.
  - `dashboard/tests/browser/landing.spec.ts` — ditulis ulang untuk v2: kontrak
    publik, 5 anchor dock (href, target tunggal, `tabindex="-1"`, fokus), isi
    CTA + footer, metadata, overflow 1440/390.
  - `dashboard/tests/browser/landing.no-js.spec.ts` — ditulis ulang untuk
    prerender v2: h1/CTA/footer ada tanpa JS, 5 href dock menunjuk elemen yang
    ada, klik FAQ tetap menggulir tanpa bundle, overflow di 320px.
  - `dashboard/tests/browser/landing.accessibility.spec.ts` — komentar basi
    (video hero) dibersihkan; assertion tidak diubah.
  - `dashboard/playwright.config.ts` — `no-js` project dikembalikan seperti
    semula (sempat dihapus saat spec no-js ditulis ulang).
- **File dihapus** (semua `imported_by = 0`, diverifikasi dengan grep sebelum
  `rm`)
  - `src/components/landing/`: `availability.tsx`, `final-cta.tsx`,
    `how-it-works.tsx`, `landing-faq.tsx`, `landing-features.tsx`,
    `landing-floating-menu.tsx`, `landing-header.tsx`, `landing-marquee.tsx`,
    `output-formats.tsx`, `privacy-boundary.tsx`, `search-and-dashboard.tsx`,
    `supported-inputs.tsx`, `transformation-proof.tsx` (+`.bak`),
    `use-cases.tsx`.
  - `src/components/ui/`: `prisma-hero.tsx`, `hero-05.tsx`, `feature.tsx`,
    `how-it-works.tsx`, `comparison-03.tsx`, `pricing-1.tsx`,
    `motion-footer.tsx`, `hero-theme-toggle.tsx` — delapan ini persis komponen
    yang dulu dirangkai `landing-page.tsx` versi lama (dicek lewat
    `git show HEAD:dashboard/src/app/landing-page.tsx`).
  - `src/styles/prisma-hero.css` (tidak pernah di-import setelah halaman lama
    hilang).
  - **Tidak dihapus:** `landing-footer.tsx` (dipakai `legal-page.tsx`) dan
    `landing.css` (di-import `legal-page.tsx`).
- **Token baru:** tidak ada. Tidak ada hex literal di file baru (dicek dengan
  grep).
- **Warna NGGAK KETEMU**
  - `#FFFFFF1A` (border Footer bottom) → `--border-dark` (`#FFFFFF1F`), sesuai
    rencana Tahap 1.
  - Frame kontak footer di outline tertulis `fill→text-primary` di atas footer
    `text-primary` — kombinasinya tidak terlihat. Dirender sebagai tombol
    ber-stroke `--border-dark` dengan label `--on-dark`.
  - Baris legal footer tidak punya anotasi warna → `--on-dark-label`.
- **Asumsi yang diambil**
  1. **Tidak ada section Tags di desain.** Tidak dibuat section baru. Item dock
     “Tags” menunjuk daftar tag yang memang ada di specimen sheet hero
     (`id="tags"`), sehingga kelima anchor dock hidup tanpa mengarang isi.
     Konsekuensinya `#tags` tidak pernah menjadi item aktif saat scroll; ia
     hanya target navigasi.
  2. **Link footer:** `Product → #how-it-works`, `Pricing → #pricing`,
     `FAQ → #faq`, `Privacy → /privacy`, `Terms → /terms`. Desain tidak
     menyebut href; tiga yang pertama memakai section yang ada.
  3. **Ticker footer statis**, tiga salinan persis seperti 18 node di outline.
     Tidak dianimasikan: strip auto-scroll permanen berutang kontrol pause
     (WCAG 2.2.2) yang tidak ada di desain.
  4. **Closing CTA** memakai `min-height: 520px` di desktop (bukan tinggi tetap);
     isi aktual 543px di 1440. Headline `clamp(2.75rem, 5.8vw, 5.25rem)`
     (terukur 83.52px di 1440, desain 84). Grid 12 kolom memakai
     `--ink-hover` seperti hero, turun ke 4 kolom di ≤768.
  5. **Ikon Material Symbols** dipetakan ke lucide: `space_dashboard` →
     `LayoutDashboard`, `arrow_outward` → `ArrowUpRight`.
  6. **Kontak footer** `mailto:contact@alann.works` (satu-satunya alamat di
     copy).
  7. **Ruang dock:** baris legal footer diberi `padding-bottom: 6rem` (5.5rem di
     ≤768) supaya tidak tertutup dock fixed. Terukur: teks legal berakhir 30px
     di atas bar dock (1440/1024), 22px (768/390).
  8. **Scroll-spy:** arah baca menentukan item aktif; di antara section item
     terakhir dipertahankan, dan di footer `faq` tetap aktif (dock tidak punya
     item pricing/footer). Ini disengaja, bukan bug.
  9. **Salinan teks** 100% dari `v2-copy.md` (CTA + footer), tanpa kalimat baru.
- **Gate / verifikasi**
  - `npx tsc --noEmit` (di `dashboard/`) → **exit 0**.
  - `npm run build:client` → **PASS**, `BUILD_EXIT=0`.
  - `npm run build` (client + SSR + prerender) → **PASS**, `BUILD_EXIT=0`;
    `dist/index.html` memuat “Ready to begin?”, “Questions?” dan 5×
    “KNOWLEDGE INBOX”.
  - `npx eslint src/components/landing/v2 src/app/landing-page.tsx` → **exit 0**.
  - `npx eslint` untuk spec + `playwright.config.ts` yang diubah → **exit 0**.
  - `npx playwright test landing.spec.ts landing.no-js.spec.ts` (chromium,
    firefox, webkit, mobile-chromium, mobile-webkit, no-js) → **28 passed**,
    termasuk 5 anchor dock yang benar-benar memfokuskan target di kelima engine.
    Satu flake ditemukan di firefox/webkit (timeout 30s saat 5 project paralel)
    dan diberi `test.setTimeout(60_000)` dengan alasan tertulis.
  - Smoke Chromium terhadap `dist` (1440/1024/768/390/320):
    - Kelima target ada dan `tabIndex=-1`; klik tiap item dock mengubah hash,
      menggulir, dan `document.activeElement` = target (`capture`,
      `how-it-works`, `dashboard`, `tags`, `faq`). `#pricing` lewat link footer
      juga fokus.
    - `aria-current` berpindah mengikuti section saat scroll (capture →
      how-it-works → dashboard → faq).
    - `scrollWidth === clientWidth` di 1440/1024/768/390/320 (dock 317px masih
      muat di 320px).
    - Footer: `background rgb(10,10,10)`, ticker `rgb(11,11,10)` tinggi 88px, 3
      salinan 6 counter, kontak `mailto:`, 5 link footer, legal line utuh.
    - Tidak ada error console.
- **A11y**
  - Dipertahankan: skip-link, `main#main-content[tabindex=-1]`,
    `applyPageMetadata`, focus hash, landmark `nav[aria-label]`, `sr-only` untuk
    label ikon dock, counter ticker dibacakan sekali lewat daftar `sr-only`,
    ikon dekoratif `aria-hidden`, CTA eksternal punya teks, `#faq`/`#tags`/
    `#pricing` fokusable.
  - `landing.accessibility.spec.ts` **masih gagal** karena 26 node
    `color-contrast` — semuanya di section Tahap 1–3 (`v2-sheet__*`,
    `v2-stat-block__foot`, eyebrow, `v2-receipt__meta/note`, dll.), memakai
    token desain apa adanya (`#A7A7A7` di `#F9F8F6` = 2.26:1, `#FF6308` di
    putih = 2.98:1). Tidak dari Closing CTA/Footer. Tidak diperbaiki di tahap
    ini karena artinya mengubah token mapping yang brief tetapkan WAJIB —
    keputusan desain, bukan cleanup.
- **Sisa/blocker**
  - Kontras axe di atas (pre-existing sejak Tahap 1) belum hijau.
  - `docs/landing-page/IMPLEMENTATION_SPEC.md` masih mendaftar file lama yang
    sudah dihapus (`landing-header.tsx`, `supported-inputs.tsx`, dst.). Tidak
    diedit karena itu dokumen spesifikasi produk/input, bukan source; perlu
    keputusan pemilik dokumen.
  - File Cornell dan `dashboard/tsconfig.json` tidak disentuh (tsconfig memang
    sudah dimodifikasi sebelum sesi ini, dengan komentar `exclude` Cornell).
  - Berhenti di Tahap 4; tidak lanjut ke pekerjaan lain.
## FIX Tahap 1 — aset gambar (9 slot) — selesai

Scope: hanya TAHAP 1 dari `v2-fix-brief.md`. Tahap 2 (font) dan Tahap 3 (geometri)
tidak dikerjakan.

- **File diubah**
  - `dashboard/src/components/landing/v2/hero.tsx` — monogram `N` (span
    `.v2-brand__mark`) diganti `<img src="/landing/v2/notinn-logo.png"
    alt="Notinn" width={30} height={30}>`.
  - `dashboard/src/components/landing/v2/how-it-works.tsx` — tiga komponen
    ilustrasi lokal (`CaptureIllustration`, `StructureIllustration`,
    `UtilityIllustration`) dan `CAPTURE_WAVE` dihapus; `Step` sekarang membawa
    `art: string` dan render `<img width={341} height={196} alt="" aria-hidden>`.
    Import `Send`/`Sparkles` yang tak terpakai dibersihkan.
  - `dashboard/src/components/landing/v2/bento.tsx` — `DashboardTile` sekarang
    `<img src="/landing/v2/dashboard.png" width={812} height={457}>`; konstanta
    `DASH_CARDS` dan `PAGE_LINE_WIDTHS` dihapus. Caption (`Notes library · grid
    view` / `Showing 3 notes`) dipertahankan apa adanya.
  - `dashboard/src/components/landing/v2/before-after.tsx` — `Art` sekarang
    `<img>` dari map `ART_SRC` (idea→peep-idea, meeting→peep-meeting,
    source→peep-search, quarter→peep-later), `width={150} height={150}`.
  - `dashboard/src/styles/landing-v2.css` — CSS placeholder dibuang, diganti
    aturan img:
    - dihapus: seluruh blok `.v2-illus*` (21 selector), `.v2-dash__bar`,
      `__brand`, `__search`, `__avatar`, `__grid`, `__card`, `__line`,
      `__tag`, `__preview`, `__chips` + variannya (24 selector), seluruh
      `.v2-ba-art__plate`/`.v2-ba-art__shape` + 8 varian `data-art`
      (20 selector), `.v2-brand__mark` versi kotak hitam, serta rule media query
      `.v2-illus { height: 172px }` dan `.v2-dash__card`/`padding` lama.
    - ditambah: `.v2-brand__mark` (30×30, `object-fit: contain`),
      `.v2-how__art` (absolute `top:88px left:28px`, 341×196, `contain`),
      `.v2-dash__shot` (absolute inset 0, `object-fit: cover`),
      `.v2-ba-art` (150×150, `aspect-ratio:1`, `contain`).
    - `Dash fade` dipertahankan: `.v2-dash::after`, `height: 127px`, gradient
      `transparent → var(--surface-dark)`; warnanya ikut tile gelap
      (`#0B0B0A`) karena shot sekarang menutup area, bukan `--bg-subtle` lagi.
- **Catatan implementasi**
  - `Dash shot` memakai `object-fit: cover` pada kotak selebar tile (862×506
    terukur di 1440), jadi crop-nya mengikuti rasio tile; `width`/`height`
    atribut tetap 812×457 sesuai kontrak agar rasio intrinsik/CLS benar.
  - `How It Works`: kartu diberi `min-height: 459px` + `position: relative`
    supaya frame absolut 341×196 di `top: 88` tidak overflow, dan label
    didorong dengan `margin-top: auto` (desain `justify-between`) sehingga teks
    tidak tertimpa artwork.
  - Semua img dekoratif `alt="" aria-hidden="true"`; hanya logo yang punya
    `alt="Notinn"`.

- **Hasil ukur (dev server Vite, Chromium, `Emulation.setDeviceMetricsOverride`,
  1440×900)**
  - `document.documentElement.clientWidth` = **1440**,
    `scrollWidth` = **1440** (tidak ada overflow horizontal).
  - `document.querySelectorAll(".landing-v2 img").length` = **9** — semua
    `complete === true` dan `naturalWidth > 0` (9/9 termuat).
  - Daftar `src` berurutan: notinn-logo.png, step-01.png, step-02.png,
    step-03.png, dashboard.png, peep-idea.png, peep-meeting.png,
    peep-search.png, peep-later.png.
  - Ukuran ter-render: logo **30×30** (contain); step **341×196** masing-masing
    3× (contain); dashboard **862×506** (cover, natural 1920×1080); peep
    **150×150** masing-masing 4× (contain).
  - `object-fit` terhitung: contain ×8, cover ×1 (hanya dashboard).
  - `alt`: `["Notinn", "", "", "", "", "", "", "", ""]`;
    `aria-hidden`: `[null, "true"×8]`.
  - `Dashboard Tile`: `.v2-dash` **862.09×506.19**, `.v2-dash__shot`
    **862.1×506.2**; `::after` height **127px**, top **379.188px**,
    `background-image` = `linear-gradient(rgba(0, 0, 0, 0), rgb(11, 11, 10))`
    (bukan `none`).
  - `How It Works` card: tinggi **459px**; art offset dari kartu
    `left 29px`, `top 89px`, `341×196` (target desain 28/88 — selisih 1px dari
    border kartu 1px). Label mulai di `top 348.4px`, art berakhir di
    `285px` → **tidak ada overlap**.
  - `Before/After` card: **643.2×200**, art **150×150**.
  - Node placeholder tersisa (`[class*="v2-illus"]`, `.v2-dash__bar`,
    `.v2-dash__grid`, `.v2-dash__card`, `.v2-dash__preview`, `.v2-dash__chips`,
    `.v2-ba-art__plate`, `.v2-ba-art__shape`) = **0**.
  - `.v2-brand__mark` sekarang `IMG`, `textContent` = `""` (monogram hilang).
  - Console error saat load = **0**.
  - Responsif (img count / art / BA art / overflowX):
    1024 → 9 / 341×196 / 150×150 / false;
    768 → 9 / 286.5×196 / 120×120 / false;
    390 → 9 / 292×196 / 96×96 / false;
    320 → 9 / 222×196 / 96×96 / false. Tidak ada overlap di semua lebar.

- **Gate**
  - `npx tsc --noEmit` (di `dashboard/`) → **exit 0** (44.8s).
  - `npm run build:client` → **PASS**, `BUILD_EXIT=0`, `✓ built in 36.57s`
    (warning chunk >500 kB sudah ada sebelumnya).
  - `npx eslint src/components/landing/v2 src/app/landing-page.tsx` →
    **exit 0**.
  - File sementara pengukuran (script Playwright + screenshot) sudah dihapus;
    hanya 5 file sumber di atas yang berubah.

- **Tidak dikerjakan (sesuai instruksi):** Tahap 2 (`@font-face`, peta font) dan
  Tahap 3 (kontainer fluid, radius, geometri per item). Nilai seperti
  `--v2-container`, radius 20px, dan tracking belum disentuh.

## FIX Tahap 2 — font (Paper Mono + Geist) — selesai

Scope: hanya TAHAP 2 dari `v2-fix-brief.md`. Tahap 3 (kontainer fluid, radius,
geometri) tidak dikerjakan.

- **File diubah**
  - `dashboard/src/styles/landing-v2.css` — 3 `@font-face` (Paper Mono 400/600,
    Geist V2 variable 100–900) di paling atas file; token
    `--font-v2-sans`/`--font-v2-mono`/`--font-v2-display` di dalam `.landing-v2`
    (tidak menyentuh `--font-sans`/`--font-heading` global); seluruh peta font
    §2.2 diterapkan per kelas (family, weight, size, letter-spacing,
    line-height eksplisit termasuk `normal`).
  - `dashboard/src/components/landing/v2/bento.tsx` — satu modifier
    `v2-tile--voice` supaya headline Voice Tile bisa 19px/-0.6px seperti tabel
    (tile lain 14px/-0.3px).

- **Dua bug spesifisitas ditemukan & diperbaiki**
  1. Rule `.landing-v2 h1..h4 { font-family: var(--font-v2-sans) }` (0,1,1)
     mengalahkan `.v2-ba-card__title` / `.v2-receipt__brand-name` (0,1,0),
     sehingga dua elemen Manrope tetap terukur Geist. Diganti
     `.landing-v2 :where(h1, h2, h3, h4)` → spesifisitas 0,1,0, jadi rule
     komponen menang.
  2. `.v2-section-header[data-size="lg"] .v2-section-header__title` (0,2,0)
     menimpa `.v2-pricing .v2-section-header__title` (0,2,0, urutan lebih awal),
     membuat judul Pricing 48px. Override `lg` dihapus (isinya 48px, sama
     dengan base), sehingga Pricing dapat 60px.

- **Hasil ukur (dev server Vite `npx vite` port 5199, Chromium, viewport
  1440×900)**
  - `document.documentElement.clientWidth` = **1440**,
    `scrollWidth` = **1440** (tidak ada overflow horizontal).
  - `h1.v2-hero__title` → `font-family: "Geist V2", "Geist Variable", Geist,
    system-ui, sans-serif` (mengandung **Geist**), `font-weight: 500`,
    `font-size: 62px`, `letter-spacing: -2.6px`, `line-height: 67px`.
  - Elemen ber-`font-family` **Paper Mono**: **209 node** leaf. Sampel:
    `.v2-live` "1,284 notes today" (12px), `.v2-hero__index` "(01)" (14px/1.2px),
    `.v2-index-row__num` "01", `.v2-index-row__label` "CAPTURE",
    `.v2-sheet__file` (14px), `.v2-sheet__crumb` (14px/1.2px),
    `.v2-stat-block__foot`, `.v2-tile__label` "SEARCH"/"ASK" (14px/1.4px),
    `.v2-citations li` "note 1", `.v2-chip` Voice/PDF/Image/DOCX,
    `.v2-receipt__*` (brand 18px/600/6px, meta 14px, item 14px,
    grand value 24px/600/-0.5px), `.v2-footer__ticker-num` 20px/600/-0.5px,
    `.v2-footer__links`, `.v2-footer__bottom`.
  - Font benar-benar termuat: `document.fonts.check` →
    `Paper Mono 400` **true**, `Paper Mono 600` **true**, `Geist V2 500 62px`
    **true**; `document.fonts` berisi `Paper Mono 400 loaded`,
    `Paper Mono 600 loaded`, `Geist V2 100 900 loaded`.
  - HTTP font (semua **200**): `/fonts/geist/Geist-Variable.woff2`,
    `/fonts/paper-mono/paper-mono-400.woff2`,
    `/fonts/paper-mono/paper-mono-600.woff2`.
  - Tabel §2.2 diverifikasi satu per satu lewat `getComputedStyle`:
    - Hero: brand **Manrope 700 / 16 / -0.5px / normal**; live **Paper Mono
      400 / 12 / normal / normal**; index **Paper Mono 400 / 14 / 1.2px**;
      h1 **Geist 500 / 62 / -2.6px / 67px**; lede **Geist 400 / 14 / normal /
      23px**; CTA **Geist 500 / 14 / normal / normal**.
    - Sheet: file & saved **Paper Mono 400 / 14 / normal**; crumb **Paper Mono
      400 / 14 / 1.2px**; section **Manrope 700 / 14 / normal**; title **Geist
      500 / 32 / -1.1px / 38px**; summary **Geist 400 / 14 / normal / 24px**;
      task, owner **Geist 400 / 14 / normal**; tag **Paper Mono 400 / 14**;
      ask **Geist 500 / 14**.
    - Marquee: **Manrope 500 dan 300 / 28 / -0.7px / 28px** (selang-seling).
    - How It Works: pill **Manrope 600 / 14**; H2 **Geist 500 / 48 / -1.6px /
      52px**; label **Geist 600 / 19 / -0.6px / 23px**; body **Geist 400 / 14 /
      normal / 22px**; foot **Paper Mono 400 / 14**; note **Geist 400 / 14 /
      23px**.
    - Bento: eyebrow **Paper Mono 400 / 14 / 1.4px**; H2 **Geist 500 / 48 /
      -1.6px / 52px**; intro **Geist 400 / 14 / 23px / justify**; dash caption
      **Paper Mono 400 / 14**; tile label **Paper Mono 400 / 14 / 1.4px**;
      search field **Geist 400 / 14**; search title **Geist 500 / 14 /
      -0.3px**; body & hint **Geist 400 / 14 / 21px**; citations **Paper Mono
      400 / 14**; ask q **Geist 400 / 14 / 20px**; ask answer **Geist 400 / 14 /
      21px**; ask title **Geist 500 / 14 / 21px**; format chip **Paper Mono 400
      / 14**; f title **Geist 500 / 14 / -0.3px**; f body **Geist 400 / 14 /
      21px**; voice title **Geist 500 / 19 / -0.6px**.
    - Before/After: eyebrow **Paper Mono 400 / 14 / 1.4px**; H2 **Geist 500 /
      48 / -1.6px / 52px**; intro **Geist 400 / 14 / 22.4px / justify**; card
      title **Manrope 600 / 18 / -0.3px**; before **Geist 400 / 14 / 20.3px**;
      after **Geist 500 / 14 / 20.3px**; trust **Geist 400 / 14 / 20.3px**.
    - Pricing: eyebrow **Paper Mono 400 / 14 / 1.2px**; H2 **Geist 500 / 60 /
      -2.6px / 63.6px**; intro **Geist 400 / 16 / 25.6px**; FAQ q **Geist 500 /
      16**; FAQ a **Geist 400 / 14**; receipt **Paper Mono**; brand **Paper Mono
      600 / 18 / 6px**; brand meta **Paper Mono 400 / 14**; grand value
      **Paper Mono 600 / 24 / -0.5px**.
    - Closing CTA: pill **Manrope 600 / 14**; H2 **Geist 500 / 84 / -3.6px /
      92.4px / center**; sub **Geist 400 / 14 / 22.4px / center**; trust
      **Paper Mono 400 / 14**.
    - Footer: H2 **Geist 500 / 48 / -2px / 52.8px**; counters **Paper Mono 600
      / 20 / -0.5px**; label ticker **Paper Mono 400 / 14**; contact
      **Manrope 600 / 14**; links & bottom **Paper Mono 400 / 14**.
  - Mobile (390×844): `clientWidth = scrollWidth = 390`; h1 **36px /
    38.88px**, CTA **42.9px**, section title **32px** — tidak ada heading
    desktop fixed yang bocor ke ponsel.
  - Console error saat load = **0**.

- **Gate**
  - `npx tsc --noEmit` (di `dashboard/`) → **exit 0**.
  - `npm run build:client` → **PASS**, `BUILD_EXIT=0`, `✓ built in 46.16s`
    (warning chunk >500 kB sudah ada sebelumnya).
  - `npx eslint src/components/landing/v2 src/app/landing-page.tsx` →
    **exit 0**.
  - Script pengukuran sementara sudah dihapus; hanya 2 file sumber di atas yang
    berubah.

- **Tidak dikerjakan (sesuai instruksi):** Tahap 3 — `--v2-container` masih
  1440px, `--v2-gutter` masih `clamp(1.25rem, 4.5vw, 4.5rem)`, radius
  kartu/sheet/dock/receipt dan geometri per item belum disentuh.

---

## TAHAP 3 — GEOMETRI (selesai 2026-10-27)

Scope: hanya geometri (G1–G40, tabel radius §3.2, kontainer fluid §3.1). Font
Tahap 2 tidak disentuh; tidak ada file Cornell / `tsconfig.json` yang diubah.

### Perubahan sumber

- `dashboard/src/styles/landing-v2.css`
  - Token baru: `--v2-radius-card: 20px`, `--v2-radius-sheet: 6px`,
    `--v2-radius-dock: 20px`, `--v2-radius-dock-item: 13px`,
    `--v2-container: 1232px`, `--v2-gutter: clamp(1.25rem, 7.25vw, 6.5rem)`;
    `--v2-radius-lg` dinaikkan 18 → 20.
  - `.v2-container`: `box-sizing: content-box; max-width: 1232px;
    padding-inline: var(--v2-gutter)`.
  - Hero: kolom 560px/668px, sheet di top 150, headline top 170, index list
    tiga kolom 186.667 dengan rule atas (posisi absolut top 700 / left gutter),
    rule field 12 kolom × 124px mulai x=52.
  - CTA: `.v2-btn` radius 9999, gap 10, primary pad `0 24px`, secondary
    `0 22px` + `outline: 1px solid #E6E5E2` offset -0.5.
  - Sheet: 668×660, radius 6, `outline: 1px solid #E6E5E2`, shadow
    `0 24px 30px #0F172A1A`; head 43.5px bg `#FCFBFA` pad `0 20px`; body
    `604` lebar di `left 32 / top 64`; tag & Ask chip di kaki body.
  - How It Works: section pad `112px 104px 96px`, grid gap 20 + min-height 459,
    kartu bg `#FF63081A` radius 20, `Top` pad 28 gap 24, `Foot` pad `14px 28px`
    bg `#0A0A0A08`, ilustrasi absolut `left 28 / top 88 / 341×196`.
  - Bento: section bg `#F5F4F1` pad 96, grid gap 16, Row A `812:404`,
    Row B `404:404:392`, tile pad `24px 22px` radius 20, Dashboard 812×520
    (shot 812×457 cover, fade `top 330 h 127`, caption `h 52 pad 0 22px`),
    Search 404×252 bg `#FF6308`, Ask 404×252 bg `#0B0B0A`, Formats 404×284,
    Voice 404×284 bg `#FF6308` (waveform 35 bar 5px/gap 3/radius 3), Export
    h 284; field/citation/bubble/chip sesuai §3.3.
  - Before/After: section pad `104px 104px 24px`, grid gap 16, kartu 224px
    pad 24 gap 24 radius 20 bg putih, art `<img>` 150×150 contain.
  - Section transition: `height: 120px` + `linear-gradient(180deg)` dua varian
    (`data-to="pricing"` → `#FFF4EC → #FFFFFF`, `data-to="cta"` →
    `#FFF4EC → #F9F8F6`).
  - Pricing: min-height 980 bg `#FFF4EC`; receipt 440 pad 28 radius 4 bg
    `#FFFDF9` shadow `0 16px 32px #B4530933`.
  - Closing CTA: tinggi 520 bg `#F9F8F6`, inner pad `46px 52px`, gap 48,
    trust 1336 gap 24.
  - Footer: marquee 88 pad `0 24px` bg `#0B0B0A`, bottom `52.5px` pad
    `18px 70px`.
  - Dock: shell 170, bar 353×52 radius 20 pad `6px 8px` gap 8 bg
    `#0B0B0AE6` outline `1px #FFFFFF1F` shadow `0 8px 24px #00000033`,
    item 40×40 radius 13, item aktif & CTA bg `#FF6308` shadow
    `0 4px 10px #FF630840`.
  - Marquee: viewport pad `0 24px`, gap 26, item 28px.
- `dashboard/src/components/landing/v2/primitives/stat-block.tsx`: struktur
  `Top` (head + text) dan `Foot` sesuai desain.
- `dashboard/src/components/landing/v2/primitives/file-row.tsx`: kartu kolom
  10px pad, ikon/nama/ekstensi (Export files jadi baris 3 kartu).
- `dashboard/src/components/landing/v2/section-transition.tsx` + 
  `dashboard/src/app/landing-page.tsx`: prop `to="pricing" | "cta"` untuk dua
  gradient.
- `dashboard/src/index.css`: token surface `--surface-sunken: #f5f4f1`,
  `--sheet-head: #fcfbfa`, `--receipt-surface: #fffdf9`.

### Hasil ukur dev server, viewport 1440 (Playwright, `clientWidth = 1440`)

| Target | Aktual |
|---|---|
| `.v2-container` width (computed) | **1232px** (`box-sizing: content-box`, rect 1440) |
| `.v2-container` padding-inline | **104px** (tepi kiri konten 104) |
| `.v2-stat-block` background-color | **rgba(255, 99, 8, 0.1)** |
| `.v2-stat-block` border-radius | **20px** (ukuran 397.33×459) |
| `.v2-bento` background-color | **rgb(245, 244, 241)** |
| `.v2-section-transition` background-image | **linear-gradient(rgb(255,244,236) 0%, rgb(255,255,255) 100%)** (bukan `none`) |
| `.v2-section-transition[data-to="cta"]` | linear-gradient(rgb(255,244,236) 0%, rgb(249,248,246) 100%) |
| `.v2-receipt` border-radius | **4px** |
| `.v2-receipt` padding | **28px** (w 440, bg rgb(255,253,249)) |
| `.v2-dock__bar` width | **353px** (h 52, pad 6px 8px, gap 8px) |
| `.v2-dock__bar` border-radius | **20px** |
| `.v2-ba-card` height | **224px** (w 608, pad 24, gap 24, radius 20) |
| `.v2-dock__item` | 40×40, radius 13px |
| `.v2-dock` (shell) | 1440×170, bar di top 12 dari band 70 |
| `.v2-sheet` | 668×660, radius 6px, outline 1px #E6E5E2 |
| `.v2-sheet__head` | 668×43.5, bg rgb(252,251,250), pad 0 20px |
| Dashboard tile | 812×520, radius 20px, bg rgb(11,11,10) |
| Search / Ask tile | 404×252, pad 24px 22px, radius 20px (bg #FF6308 / #0B0B0A) |
| Formats / Voice / Export | 404 / 404 / 392 × 284, pad 24px 22px |
| `.v2-pricing` | 1440×980, bg rgb(255,244,236) |
| `.v2-cta` | 1440×520, bg rgb(249,248,246); inner pad 46px 52px |
| `.v2-cta__trust` | w 1336, gap 24 |
| `.v2-footer__ticker` | h 88, pad 0 24px |
| `.v2-footer__bottom` | h 52.5, pad 18px 70px |
| `.v2-btn--primary` / `--secondary` | radius 999px, pad 24px / 22px, gap 10px |
| `.v2-marquee-item` | font 28px, gap 26px, viewport pad 0 24px |
| `img` count di `.landing-v2` | **9** |
| Overflow horizontal | 1440 → scrollWidth 1440; 390 → scrollWidth 390 |
| Mobile 390 | sheet auto (749.6), BA card auto (182), dashboard tile auto (373.6) |

### Gate

- `npx tsc --noEmit` → **exit 0**
- `npm run build:client` → **PASS**, `BUILD_EXIT=0`, `✓ built in 34.93s`
  (warning chunk >500 kB sudah ada sebelumnya)
- `npx eslint src/components/landing/v2 src/app/landing-page.tsx` → **exit 0**
- Script pengukuran & screenshot sementara sudah dihapus.

---

## Audit #2 — KRITIS 1–4 + SEDANG 5–6 + RINGAN 7–12 (2026-10-27)

Dikerjakan berurutan sesuai bagian "Urutan fix". Ground truth diambil dengan
Playwright langsung dari `v2-export.html` (viewport 1440) untuk angka absolut,
lalu live diukur di dev server yang sama viewportnya.

### Perubahan per temuan

1. **KRITIS 1 — Pricing di-mirror balik.** DOM `.v2-pricing__grid` sekarang
   `SectionHeader` → `Receipt` → `FAQ` (bukan lagi header+FAQ di satu kolom lalu
   receipt). Ketiganya absolute di dalam `.v2-container` (padding box = frame
   1440): header `L=108.852`, receipt `L=97.794 / T=300.957`, FAQ `L=683.852 /
   T=312` (`w=653`). Di bawah 1100px ketiganya kembali ke flow (flex column).
2. **KRITIS 2 — Receipt rotate −1.8°.** `transform: rotate(-1.8deg)` +
   `transform-origin: top left` (dari node pen `rotation: -358.2`).
3. **KRITIS 3 — F2 CTA.** `.v2-footer__cta` sekarang blok oranye penuh:
   `background: var(--accent)` (#FF6308), `height: 320px`, `padding: 40px 72px`,
   `gap: 24px`, `justify-content: space-between`. Wrapper `v2-container` dilepas
   dari markup (blok memang full-bleed 1440). Contact pill jadi tombol hitam
   solid `16px 26px`, link footer pakai Geist 14px seperti desain. Shader grain
   **tidak** diimplementasi (`enabled: false` di pen).
4. **KRITIS 4 — Bento breakout 1440.** `.v2-bento` sekarang `overflow: hidden`,
   `.v2-bento__inner` = `content-box` `width: 1440px` + `padding-left: 104px`
   (mulai di gutter, sisa 208px dipotong artboard). Rasio kolom: Row A
   `812fr / 612fr`, Row B `404fr / 404fr / 600fr`. Dashboard 812 dan
   Formats/Voice 404 tetap. Di ≤1100px inner balik ke `border-box` 100%.
5. **SEDANG 5 — Transition pertama.** `.v2-section-transition[data-to="pricing"]`
   dapat `transform: scaleY(-1)`.
6. **SEDANG 6 — Specimen Sheet.** `.v2-sheet__head` `box-sizing: content-box`,
   `width: 668px` + `padding-inline: 20px` → 708 (dots gap 8, `head-left` gap 8).
   `.v2-sheet__body` absolute `top: 64 / left: 32`, `width: 604`, `height: 319`.
   Tags absolute `552/32` dan Ask chip `596/32`; sheet jadi `position: relative`
   `display: block`. ≤1100px semuanya kembali ke flow.
7. **RINGAN 7–12.**
   - `Brand` gap → **4px**.
   - `How Header` → kolom `gap: 16px`, judul `margin-top: 0`.
   - `Index list` tinggi → **90** (`content-box`, `height: 77.5`, pad 12 atas,
     `margin-top: -0.5`).
   - `CTA Content` → absolute `52/46`, `width: 1336`, tinggi **271**
     (pill mb 24, headline box 112, sub 22, actions pad-top 32).
   - `CTA trust` → absolute `top: 422`, `left: 52`, `width: 1336`.
   - `Foot` (how card) → `gap: 0`, `justify-content: space-between`.
   - `Footer bottom` tetap 1440×52.5 (sesuai catatan #13, tidak dipaksa 1580).
   - Bonus: isi Receipt disamakan skalanya dengan pen (meta 11px, item 12px,
     kode 11px, TOTAL 13/24px, barcode gap 2, note 9px/15px); FAQ item jadi
     `content-box` 90.5 + pad 20/0 + rule bawah + `margin-bottom: -0.5` dan gap 0
     (total 655 = desain).

File tersentuh: `dashboard/src/components/landing/v2/{pricing-receipt,bento,footer,specimen-sheet,closing-cta,section-transition}.tsx`,
`dashboard/src/app/landing-page.tsx` (tidak diubah isinya, hanya ikut gate),
`dashboard/src/styles/landing-v2.css`. `tsconfig.json` dan file Cornell tidak
disentuh.

### Hasil ukur live, viewport 1440 (`clientWidth = 1440`)

| Target | Desain | Aktual live |
|---|---|---|
| FAQ chat left / width | 683.8 / 653 | **683.84 / 653** ✓ |
| Receipt left / transform | 97.8 / matrix(…,−0.0314,…) | **97.78** / **matrix(0.999507, -0.0314108, 0.0314108, 0.999507, 0, 0)** ✓ |
| F2 CTA background-color | #FF6308 | **rgb(255, 99, 8)** ✓ |
| F2 CTA height / padding / justify | 320 / 40 72 / space-between | **320px / 40px 72px / space-between** ✓ |
| Bento Grid width | 1440 | **1440** ✓ |
| Side Tiles width | 612 | **612** ✓ |
| Search / Ask Tile | 612×252 | **612×252 / 612×252** ✓ |
| Export Tile width | 600 | **600** ✓ |
| Dashboard / Formats / Voice | 812 / 404 / 404 | **812 / 404 / 404** ✓ |
| Transition #1 transform | matrix(1,0,0,−1,0,0) | **matrix(1, 0, 0, -1, 0, 0)** ✓ |
| Sheet head width / box-sizing | 708 / content-box | **708** / **content-box** ✓ |
| Sheet body | 604 @ 32/64, h 319 | **604 @ 700,214 (=32/64), h 319** ✓ |
| Brand gap | 4px | **4px** ✓ |
| How Header gap | 16px | **16px** ✓ |
| Index list height | 90 | **90** ✓ |
| CTA Content width / left / height | 1336 / 52 / 271 | **1336 / 52 / 271** ✓ |
| CTA trust top dari section | 422 | **422** (y 5647.78 vs section 5225.78) ✓ |
| Foot gap | 0, space-between | **0px, space-between** ✓ |
| Footer bottom | 1440×52.5 | **1440×52.5** ✓ |
| Overflow horizontal | 1440 | scrollWidth **1440** ✓ |
| Responsive 1100/768/390 | — | tidak ada overlap, scrollWidth = viewport ✓ |

### Gate

- `npx tsc --noEmit` → **exit 0**
- `npm run build:client` → **PASS** (`✓ built in 30.01s`, warning chunk >500 kB
  sudah ada sebelumnya)
- `npx eslint src/components/landing/v2 src/app/landing-page.tsx` → **exit 0**
- Script pengukuran & screenshot sementara ada di `dashboard/.tmp/` (tidak
  di-commit).

---

## Fix Batch 5 — 6 selisih struktural + 3 keluhan user (2026-10-27)

Dikerjakan berurutan sesuai "Urutan Kerja" di `v2-fix5-brief.md`. Ground truth
diambil ulang dari `v2-export.html` (Playwright, viewport 1440) sebelum
menyentuh CSS, lalu live diukur di dev server yang sama.

### Perubahan per item

**A1 — Hero gutter 72 (bukan 104)**
- `.v2-hero__inner` sekarang `box-sizing: border-box; width: 100%;
  max-width: none; padding-inline: 72px` (tidak lagi memakai `.v2-container`
  /`--v2-gutter`).
- `.v2-brand` absolute `top: 34px; left: 72px`; `.v2-live` absolute
  `top: 36px; left: 1160px`; `.v2-index-list` absolute `left: 72px`.
- `.v2-hero__bar` dibuat `position: static` supaya ia bukan containing block
  untuk brand/live (kalau tidak, `left: 72` akan dihitung dari bar, bukan dari
  frame hero).

**A2 — Gap vertikal section**
- `.v2-how > .v2-container` → `display: flex; flex-direction: column; gap: 64px`.
- `.v2-bento` → `display: flex; flex-direction: column; gap: 40px`.
- `.v2-before-after > .v2-container` → `flex column; gap: 48px`.
- `margin-top` yang dulu menggantikan gap dihapus (`.v2-how__grid`,
  `.v2-bento__grid`, `.v2-ba__grid`, `.v2-ba__trust`, `.v2-how__note`) supaya
  tidak dobel.

**A3 — Bento padding + breakout satu sisi**
- `.v2-bento`: `box-sizing: border-box; height: 1380px; padding: 96px 104px;
  overflow: hidden`.
- `.v2-bento__inner`: `width: 1440px; margin-right: -104px` (kiri tetap 104,
  kanan menembus ke 1440). Sebelumnya `1544px` + `padding-left: 104px`.

**A4 — How Header 159**
- Pill disamakan ke desain: `gap: 7px; padding: 5px 12px` (dari 0.4rem/0.75rem).
- `.v2-how .v2-section-header__main` → flex column, `gap: 16px`.
- H2 How di-set eksplisit `52px/56px`, `letter-spacing: -2px`.
- Hasil: 31 + 16 + 112 = **159**.

**A5 — CTA satu kontainer**
- `.v2-cta__inner` → `padding: 0` (sebelumnya `46px 52px`, padding ganda).
- `.v2-cta__content` tetap `L52 w1336 h271`; `.v2-cta__trust` tetap `top: 422`.

**A6 — Footer bottom 89.5**
- `.v2-footer__bottom` → `height: 89.5px` dengan `box-sizing: border-box`
  (52.5 content + 36 padding + 1 border). Padding `18px 70px` tidak berubah,
  jadi frame tetap 1440.

**B1 — Footer ticker jalan**
- `@keyframes v2-footer-ticker` (`translateX(0)` → `translateX(-100%)`).
- `.v2-footer__ticker-set` → `animation: v2-footer-ticker 40s linear infinite`.
- `prefers-reduced-motion: reduce` → `animation: none; transform: none` plus
  set duplikat `display: none`.
- `footer.tsx`: `CounterSet` menerima `hidden`, set ke-2/3 dapat
  `data-clone="true"`. Ketiga set memang sudah `aria-hidden="true"`; teks
  counter untuk screen reader tetap disediakan sekali lewat `<ul class="sr-only">`.

**B2 — Barcode 40 bar**
- `BARCODE_WIDTHS` diganti array desain 40 bar: `2,1,3,1,2,2,1,3,1,1,2,3,1,2,1,1,
  3,2,1,2,3,1,1,2,1,3,2,1,1,3,2,1,2,1,3,1,2,2,1,3` (71px + 39×2 = 149).
- `.v2-receipt__barcode` → `justify-content: center; width: fit-content;
  margin-inline: auto; height: 40px; gap: 2px`; `.v2-receipt__bar` →
  `flex: none; height: 40px` (tidak lagi `space-between` + `height: 100%`).

**B3 — Footer ketutupan dock**
- `.v2-footer` → `padding-bottom: 120px`.
- Breakpoint ≤768px: `.v2-footer__bottom` diberi `height: auto` supaya padding
  5.5rem lama tidak memaksa 89.5px.

### Angka aktual (dev server, `document.documentElement.clientWidth = 1440`)

| Target | Aktual |
|---|---|
| `clientWidth` / `scrollWidth` | **1440 / 1440** (tidak ada overflow horizontal) |
| `.v2-brand` left | **72** |
| `.v2-hero__headline` left / width | **72 / 560** |
| `.v2-sheet` left / width | **700 / 668** |
| `.v2-live` left | **1160** |
| `.v2-index-list` left | **72** |
| `.v2-how` tinggi | **971** |
| `.v2-how .v2-section-header` tinggi | **159** |
| `.v2-bento` tinggi | **1380** |
| `.v2-bento__grid` width / left | **1440 / 104** |
| `.v2-before-after` tinggi | **867** |
| `.v2-cta__content` | left **52**, width **1336**, height **271** |
| `.v2-cta__inner` padding | **0px** |
| `.v2-cta__trust` dari atas `.v2-cta` | **422** |
| `.v2-footer__bottom` tinggi | **89.5** |
| `.v2-footer__ticker-set` animationName | **v2-footer-ticker** (40s linear infinite, transform berubah `0` → `-24.02px` dalam 700ms) |
| Barcode jumlah bar | **40** |
| Barcode tinggi bar | **40** (offsetHeight) |
| Barcode total terpakai | **149** (71 bar + 78 gap), offsetWidth **149** |
| Barcode posisi | `width: 149px`, `margin-inline: 117.5px` → terpusat di kolom 384 |
| Footer text vs dock (viewport 1200, scroll mentok) | teks bottom **1043.25** < dock bar top **1142** → clearance **98.75px** |

Catatan: `.v2-footer__bottom` di 1440 sekarang `top 6382`, `height 89.5`;
sebelum fix `height 52.5`.

### Cek regresi

- 1439 / 1280 / 1101: `scrollWidth === clientWidth` (grid Bento 1440 memang
  menembus padding kanan dan dipotong `overflow: hidden`, sesuai desain).
- 1024 / 768: Bento kembali ke gutter normal, tinggi auto (1790 / 1676.9),
  grid 875.5 / 656.7 — tidak ada overflow.
- 390: `clientWidth = scrollWidth = 390`; brand static (bukan absolute);
  barcode tetap 40 bar 149×40.
- Reduced motion: ketiga set `animationName: none`, set duplikat
  `display: none`, `aria-hidden="true"` di semua set.
- Tidak menyentuh font, Pricing mirror, Receipt rotate, F2 CTA, radius, aset,
  anchor, shader grain, Cornell, atau `tsconfig.json`.

### Gate

- `npx tsc --noEmit` → **exit 0**
- `npm run build:client` → **PASS**, `BUILD_EXIT=0`, `✓ built in 34.61s`
- `npx eslint src/components/landing/v2 src/app/landing-page.tsx` → **exit 0**

---

## Fix Fluid — BUG 1–4 (2026-10-27)

Akar masalah: angka absolut artboard 1440 dipakai sebagai px tetap. Semua fix
di `dashboard/src/styles/landing-v2.css`; tidak ada perubahan markup, font,
radius, warna, aset, anchor, barcode, ticker, atau Pricing mirror.

### Perubahan per bug

1. **BUG 1 — Live counter.** `.v2-live` buang `left: 1160px`, ganti `right: 72px`
   (menempel gutter kanan, sama dengan tepi kanan Specimen Sheet). Tidak lagi
   masuk area sheet di viewport mana pun.
2. **BUG 2 — Section non-Bento fluid.** `.v2-container` diubah dari
   `content-box` + `max-width: 1232px` + `margin-inline: auto` menjadi
   `box-sizing: border-box; width: 100%; max-width: none; margin-inline: 0;
   padding-inline: var(--v2-gutter)`. How It Works / Before After / Pricing
   otomatis melebar; di 1440 hasilnya identik (104 + 1232 + 104 = 1440).
3. **BUG 3 — Bento Grid.** `.v2-bento__inner` `width: 1440px` →
   `width: calc(100% + 104px)` + `margin-right: -104px` (breakout tetap).
   1440 → 1440, 1920 → 1816, 2560 → 2456.
4. **BUG 4 — CTA Content.** `.v2-cta__inner` dapat `padding: 0 52px` dan
   `.v2-cta__content` jadi in-flow `width: 100%` (bukan `absolute` + `1336px`),
   `margin-top: 46px` mempertahankan posisi 46px. `.v2-cta__trust` juga
   `left/right: 52px; width: auto` agar ikut fluid. Di ≤1100px
   `.v2-cta__content` reset `margin-top: 0` supaya flex column tidak dobel gap.
5. **Pricing FAQ.** `.v2-faq` `width: 653px` → `right: 104px; width: auto`
   (tetap 652.16 di 1440 karena kolom memang flush ke tepi konten; tumbuh
   mengikuti viewport di atasnya). `left: 683.852px` tidak diubah.

Pengecualian yang dipertahankan: Hero `padding-inline: 72px` + Sheet `668px`,
F2 CTA `padding: 40px 72px`, Footer bottom `padding: 18px 70px` — semuanya
terverifikasi tidak berubah.

### Angka aktual (Playwright, dev server 127.0.0.1:5179)

| Cek | 1440 | 1920 | 2560 | Syarat |
|---|---|---|---|---|
| `clientWidth` | **1440** | **1920** | **2560** | = target ✓ |
| `scrollWidth` | **1440** | **1920** | **2560** | = clientWidth ✓ |
| Overflow horizontal | **false** (0) | **false** (0) | **false** (0) | false ✓ |
| Live counter kanan | **1368** | **1848** | **2488** | cw−72 ✓ |
| Sheet kanan | **1368** | **1848** | **2488** | cw−72 ✓ |
| Live vs Sheet overlap | **false** | **false** | **false** | tidak overlap ✓ |
| How konten L / R | **104 / 1336** | **104 / 1816** | **104 / 2456** | 104 / cw−104 ✓ |
| Before After konten L / R | **104 / 1336** | **104 / 1816** | **104 / 2456** | 104 / cw−104 ✓ |
| Pricing konten L / R | **104 / 1336** | **104 / 1816** | **104 / 2456** | 104 / cw−104 ✓ |
| Bento Grid L / R | **104 / 1440** | **104 / 1920** | **104 / 2560** | 104 / cw ✓ |
| Bento Grid width | **1336** | **1816** | **2456** | fluid ✓ |
| CTA Content L / R | **52 / 1388** | **52 / 1868** | **52 / 2508** | 52 / cw−52 ✓ |
| CTA Content width | **1336** | **1816** | **2456** | fluid ✓ |
| CTA Content height | **271** | **271** | **271** | tetap ✓ |
| Tinggi How / Bento / BA | **971 / 1380 / 867** | **971 / 1380 / 867** | **971 / 1380 / 867** | tetap ✓ |
| Hero padding-inline | **72px** | **72px** | **72px** | 72 (pengecualian) ✓ |
| Footer bottom padding | **70px** | **70px** | **70px** | 18px 70px ✓ |
| F2 CTA padding | **40px 72px** | **40px 72px** | **40px 72px** | 40px 72px ✓ |
| Sheet width | **668** | **668** | **668** | 668 (pengecualian) ✓ |

Detail tambahan: Live counter L/R = 1199.38/1368 (1440), 1679.38/1848 (1920),
2319.38/2488 (2560) — lebar 168.63 tetap, hanya bergeser. FAQ 652.16 di 1440
(desain 653, selisih 0.84 dari pembulatan `left: 683.852` + `right: 104`).

### Cek regresi lain (tidak ada overflow horizontal)

| Viewport | clientWidth / scrollWidth | Live kanan | Overlap | How / Bento / BA tinggi |
|---|---|---|---|---|
| 2560 | 2560 / 2560 | 2488 | false | 971 / 1380 / 867 |
| 1920 | 1920 / 1920 | 1848 | false | 971 / 1380 / 867 |
| 1600 | 1600 / 1600 | 1528 | false | 971 / 1380 / 867 |
| 1440 | 1440 / 1440 | 1368 | false | 971 / 1380 / 867 |
| 1280 | 1280 / 1280 | 1208 | false | 971 / 1380 / 867 |
| 1101 | 1101 / 1101 | 1029 | false | 1450 / 1380 / 867 |
| 1024 | 1024 / 1024 | 949.8 | false | 1450 / 1790 / 1347 |
| 768 | 768 / 768 | 712.3 | false | 1807 / 1662 / 1259 |
| 390 | 390 / 390 | 361.7 | false | 1807 / 1833 / 1291 |
| 320 | 320 / 320 | 296.8 | false | 1824 / 1945 / 1561 |

Tinggi How 1450 di 1101–1024 dan nilai mobile adalah wrap teks/grid yang sudah
ada sebelumnya (di bawah breakpoint 1100 semua section memang auto height).

### Gate

- `npx tsc --noEmit` → **exit 0**
- `npm run build:client` → **PASS**, `BUILD_EXIT=0`, `✓ built in 31.50s`
- `npx eslint src/components/landing/v2 src/app/landing-page.tsx` → **exit 0**
  (CSS dilaporkan "ignored, no matching configuration" — bukan error)
- Script pengukuran sementara (`measure-v2.tmp.mjs`, `regress-v2.tmp.mjs`)
  sudah dihapus.

Tidak menyentuh font, radius, warna, aset, anchor, barcode, ticker, Pricing
mirror, file Cornell, maupun `tsconfig.json`.

---

## Fix Bento Symmetry — breakout 1440 dihapus (2026-10-27)

Akar masalah: brief "Bento breakout 1440" berasal dari export HTML pen yang
memakai `content-box`, sehingga `Bento` terukur 1648px di viewport 1440
(1440 + 2×104, padding kiri-kanan terhitung dua kali). Itu artefak export.
Sumber `.pen`: `Bento` dan `Bento Grid` = `fill_container`, padding `[96, 104]`,
jadi grid adalah content box: 1440 − 208 = 1232, simetris 104/104.

### Perubahan (`dashboard/src/styles/landing-v2.css`, hanya selector Bento)

1. `.v2-bento__inner` — `width: calc(100% + 104px)` → `width: 100%`;
   `margin-right: -104px` → `margin-right: 0`. `max-width: none` tetap.
2. `.v2-bento__row--a` — `minmax(0, 812fr) minmax(0, 612fr)` →
   `812px minmax(0, 1fr)`. `.v2-bento__row--b` — `404fr 404fr 600fr` →
   `404px 404px minmax(0, 1fr)`. Hanya Dashboard/Formats/Voice yang fixed di
   `.pen`; sisanya `fill_container`, jadi sisa lebar jatuh ke Side Tiles dan
   Export Tile (1920: side 884, export 872; 2560: side 1524, export 1512).
3. `@media (min-width: 1101px) and (max-width: 1439px)` — baris Bento kembali
   proporsional (`812fr/612fr`, `404fr/404fr/600fr`) supaya tile tidak terjepit
   di bawah lebar desain. Di ≥1440 ukuran fixed yang berlaku.
4. Komentar stale "breakout" di blok `.v2-bento` dan breakpoint 1100 diperbarui.

Tidak ada `width: 1440px` maupun `calc(100% + …)` tersisa di selector Bento mana
pun (`grep` bersih). Tidak menyentuh font, warna, radius, aset, anchor, barcode,
ticker, Pricing mirror, Cornell, atau `tsconfig.json`.

### Angka aktual (Playwright, dist build, 127.0.0.1:4199)

| Ukuran | 1440 | 1920 | 2560 |
|---|---|---|---|
| `clientWidth` / `scrollWidth` | 1440 / 1440 | 1920 / 1920 | 2560 / 2560 |
| `.v2-bento__grid` L / R / w | **104 / 104 / 1232** | **104 / 104 / 1712** | **104 / 104 / 2352** |
| `.v2-bento__inner` L / R / w | 104 / 104 / 1232 | 104 / 104 / 1712 | 104 / 104 / 2352 |
| `.v2-bento__row--a` L / R / w | 104 / 104 / 1232 | 104 / 104 / 1712 | 104 / 104 / 2352 |
| Dashboard w (L / R) | **812** (104 / 524) | 812 (104 / 1004) | 812 (104 / 1644) |
| `.v2-bento__side` L / R / w | **932 / 104 / 404** | 932 / 104 / **884** | 932 / 104 / **1524** |
| `.v2-bento__row--b` w | 1232 | 1712 | 2352 |
| Formats / Voice / Export w | **404 / 404 / 392** | 404 / 404 / **872** | 404 / 404 / **1512** |
| Tile terakhir Row B → right | **104** | **104** | **104** |
| Tinggi how / bento / ba | **971 / 1380 / 867** | 971 / 1380 / 867 | 971 / 1380 / 867 |
| Overflow horizontal | **false** | **false** | **false** |

Cek rumus: grid width = `clientWidth − 208` → 1232 / 1712 / 2352 ✔;
side width = `grid − 812 − 16` → 404 / 884 / 1524 ✔;
grid L == `clientWidth − grid right` → 104 == 104 di ketiganya ✔.

Simetri section (semua `main > section`, L == clientWidth − R):

| Section | 1440 | 1920 | 2560 |
|---|---|---|---|
| hero / marquee / how / bento / before-after / pricing / cta | 0 / 0 | 0 / 0 | 0 / 0 |

Konten di dalam section juga simetris: `.v2-how > .v2-container`,
`.v2-before-after > .v2-container`, `.v2-pricing > .v2-container` semuanya
L0 R0; `.v2-cta__content` L52 R52 (1336 / 1816 / 2456).

### Regresi dicek

- 1101 / 1200 / 1280: baris Bento proporsional, grid L104 R104, tidak ada
  overflow, tile terakhir Row B tetap right 104.
- ≤1100: Bento kembali ke gutter `--v2-gutter`, tinggi auto (tidak berubah).

### Gate

- `npx tsc --noEmit` → **exit 0**
- `npm run build:client` → **PASS**, `BUILD_EXIT=0`, `✓ built in 22.23s`
- `npx eslint src/components/landing/v2 src/app/landing-page.tsx` → **exit 0**

---

## Fix Batch 7 — P1–P7 (2026-10-27)

Dikerjakan sesuai urutan brief: P6 → P4+P5 → P3 → P7 → P2 → P1.

### Perubahan

**P6 — ukuran judul tile (`dashboard/src/styles/landing-v2.css`)**
- `.v2-tile__title` sekarang `font-size: 14px; font-weight: 500; line-height: 21px`
  (sebelumnya `line-height: normal`).
- Override Voice 19px dihapus (`.v2-tile--voice .v2-tile__title { font-size: 1.1875rem }`
  dan komentarnya). Tidak ada lagi 19px di title tile mana pun.

**P4 — chips (`landing-v2.css`)**
- `.v2-chips` → `display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px`.
- `.v2-chip` → `width: 100%` + `justify-content: center`; `flex: 0 1 auto` hilang.

**P5 — file rows (`landing-v2.css`)**
- `.v2-file-list` → `display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px`.

**P3 — spacing Bento (`landing-v2.css` + `bento.tsx`)**
- `margin-top: auto` dihapus dari `.v2-tile__hint` dan `.v2-tile__title--foot`.
- Wrapper baru `.v2-tile__top` (label + konten, `gap: 6px`) dan `.v2-tile__bottom`
  (title + body, `gap: 8px`), `display: flex; flex-direction: column; min-width: 0`.
- Markup Search/Ask/Formats/Voice/Export dibungkus top/bottom; tile tetap
  `justify-content: space-between` sehingga sisa tinggi dibagi otomatis.

**P7 — FAQ accordion (`pricing-receipt.tsx` + CSS)**
- `<details class="v2-faq__item">` + `<summary class="v2-faq__question">` native,
  chevron `ChevronDown` (`v2-faq__chev`), jawaban di `.v2-faq__answer`.
- Semua item tanpa `open`; non-exclusive (tanpa `name`).
- CSS: `list-style: none`, `::-webkit-details-marker` disembunyikan, chevron
  `transition: transform 180ms ease`, `details[open] .v2-faq__chev { rotate(180deg) }`,
  `.v2-faq__answer p { margin: 0 }`, dan `transition: none` di
  `@media (prefers-reduced-motion: reduce)`.
- `.v2-faq__item` `height: 90.5px` → `min-height: 90.5px` supaya jawaban yang
  terbuka menambah tinggi, bukan terpotong.

**P2 — saved terpotong (`landing-v2.css`)**
- Akar masalah: `.v2-sheet__head` `box-sizing: content-box; width: 668px;
  padding-inline: 20px` → total 708px di dalam sheet 668px, jadi 40px terakhir
  (tepat di sisi `saved`) dipotong `overflow: hidden`.
- Fix: `.v2-sheet__head` → `box-sizing: border-box; width: 100%`, plus
  `border-radius: 6px 6px 0 0` mengikuti radius sheet. `saved` kini 20px dari
  tepi kanan sheet dan tidak terpotong.

**P1 — live counter (`src/hooks/use-note-count.ts` baru + `hero.tsx`)**
- Hook `useNoteCount()`: `supabase.from("notes").select("id", { count: "exact", head: true })`,
  lalu `supabase.channel("notes-count").on("postgres_changes", { event: "INSERT",
  schema: "public", table: "notes" }, refetch)`; channel di-remove saat unmount.
- `LiveNoteCount` merender badge hanya kalau `count` bukan `null`/`0`;
  format `Intl.NumberFormat("en-US")`, teks `{count} notes captured` (bukan
  "today", karena query menghitung total, bukan filter harian).
- Tidak ada angka hardcoded; kalau RLS memblokir (anon) atau gagal → badge
  tidak dirender. Komentar `// TODO: anon count RLS` ada di hook.

### Angka aktual (Playwright, dist build, 127.0.0.1:4173, clientWidth 1440)

| Cek | Hasil |
|---|---|
| `.v2-chip` width ×4 | **85.5 / 85.5 / 85.5 / 85.5** (selisih 0) |
| `.v2-chips` width | **360**; 4×85.5 + 3×6 = **360** ✔ |
| `.v2-file-row` width ×3 | **112 / 112 / 112** |
| `.v2-tile__title` computed (5 judul) | **14px / 500 / 21px** semuanya |
| `margin-top` anak langsung `.v2-tile > *` | **0px** di 12 node (top/bottom + dashboard) |
| gap label→konten | **6px** di Search/Ask/Formats/Voice |
| gap title→body | **8px** di Search/Formats/Voice |
| `.v2-faq details` / `[open]` saat load | **5 / 0** |
| klik summary pertama | open = **1**, chevron `matrix(-1, 0, 0, -1, 0, 0)` (180°) |
| `.v2-sheet__saved` right vs sheet right | saved R **1348**, sheet R **1368**, gap **20** |
| `.v2-sheet__head` scrollWidth > clientWidth | **false** |
| `.v2-live` awal (mock 1284) | `1,284 notes captured` |
| setelah event INSERT (mock 1300) | `1,300 notes captured` tanpa reload, REST call ke-2 |
| REST 401 (RLS blokir) | badge **hidden** (`null`) |
| reduced-motion | chevron `transition: none`, dot `animation: none` |

Responsif dicek 1440 / 1280 / 1100 / 768 / 390: keempat chip & ketiga file row
tetap sama lebar (selisih ≤ 0.02px), title tetap 14/500/21, tidak ada overflow
horizontal, `saved` selalu 20px dari tepi sheet.

### Gate

- `npx tsc --noEmit` → **exit 0**
- `npm run build:client` → **PASS** (`✓ built in 24.91s`)
- `npx eslint src/components/landing/v2 src/app/landing-page.tsx src/hooks/use-note-count.ts` → **exit 0**

Tidak mengubah warna, radius, font family, aset, anchor, barcode, ticker,
Pricing mirror, Receipt rotate, atau F2 CTA. Cornell dan `tsconfig.json` tidak
disentuh. Tidak ada GSAP; animasi accordion murni CSS transition.

---

## Fix Batch 8 — P4 → P3 → P1 → P2 (2026-10-27)

Dikerjakan sesuai urutan brief: **P4** (hapus Tags) → **P3** (tooltip) →
**P1** (grid) → **P2** (FAQ).

### Perubahan

**P4 — hapus item Tags dari dock (`floating-dock.tsx`)**
- Item `{ id: "tags", href: "#tags" }` dihapus seluruhnya; import `Tag` dari
  `lucide-react` ikut dibuang (tidak ada pemakai lain).
- `DockLink.sectionId` tidak lagi `string | null` (tidak ada item tanpa section);
  komentar lama yang menjelaskan `#tags` dihapus.
- **`id="tags"` di specimen sheet TIDAK disentuh** (`.v2-sheet__tags` masih
  `id="tags"`).
- Tidak ada link lain ke `#tags` di `dashboard/src` (grep bersih) — jadi tidak
  ada yang perlu dilaporkan/dikonfirmasi.
- Efek samping yang ikut diperbaiki: `.v2-dock__bar` masih `width: 353px`
  (lebar 7 item), jadi setelah item dibuang tersisa ~48px ruang mati di kanan
  bar. Diganti `width: fit-content` → bar mengepul ke 6 item (305px).

**P3 — tooltip CSS murni (`floating-dock.tsx` + CSS)**
- Tiap `<a class="v2-dock__item">` sekarang punya `aria-label` + child
  `<span class="v2-dock__tip" role="tooltip">`.
- Label: `Capture`, `How it works`, `Dashboard`, `FAQ`, `Open in Telegram`,
  `Web dashboard` (6 item, tanpa Tags). `sr-only` lama diganti `aria-label`
  supaya accessible name tidak dobel.
- CSS baru `.v2-dock__tip`: `position: absolute; bottom: calc(100% + 8px);
  left: 50%; transform: translateX(-50%) translateY(4px); opacity: 0;
  pointer-events: none; white-space: nowrap`, `--surface-dark` /
  `--on-dark` / `--border-dark`, mono 12px, radius 8px, `z-index: 1`.
- `.v2-dock__item { position: relative }` (sudah ada di patch) + state
  `:hover .v2-dock__tip, :focus-visible .v2-dock__tip { opacity: 1;
  transform: translateX(-50%) translateY(0) }`.
- Tambahan kecil: `.v2-dock__item:focus-visible { outline: 2px solid
  var(--on-dark); outline-offset: 2px }` supaya item yang di-Tab terlihat
  sebelum tooltip selesai fade-in.
- `@media (prefers-reduced-motion: reduce) { .v2-dock__tip { transition: none } }`.
- Tidak pakai `title` attribute; tidak ada JS/library.

**P1 — grid dua arah (`landing-v2.css`)**
- `.v2-hero__grid`: 4 lapis `linear-gradient` horizontal statis (88/300/620/860)
  diganti satu `repeating-linear-gradient(to bottom, … 124px)`.
  `background-size: 100% 100%, 100% 100%`, `background-position: 52px 0, 0 0`,
  `background-repeat: no-repeat` (layer penuh, gradient yang mengulang sendiri).
- `.v2-cta__grid`: ditambah `repeating-linear-gradient(to bottom, … calc(100% / 12))`
  dengan pitch sama seperti vertikal (8.33333%).
- Warna garis tetap `var(--ink-hover)` = `rgba(10, 10, 10, 0.04)` — tidak diubah.
- Mobile (`max-width: 768px`) ikut disamakan: dua gradient, pitch `100% / 4`.

**P2 — FAQ nempel + animasi (`pricing-receipt.tsx` + CSS)**
- Akar masalah tinggi 132px: `min-height: 90.5px` + `box-sizing: content-box`
  di `.v2-faq__item`, ditambah `.v2-faq__answer` `margin-top: 8px` yang tetap
  dihitung walau `details` tertutup (native `details` hanya menyembunyikan
  konten non-summary lewat `display: none` pada *child*, dan `margin-top` milik
  wrapper masih berkontribusi karena wrapper-nya tidak ikut di-hide di UA
  stylesheet versi Chromium ini).
- `min-height` dihapus; `.v2-faq__item` tinggal `padding: 20px 0` +
  `border-bottom` + `margin-bottom: -0.5px` (gap 0 sudah, tidak ada margin
  antar item selain hairline).
- `.v2-faq__answer` jadi `display: grid; grid-template-rows: 0fr;
  overflow: hidden; transition: grid-template-rows 220ms ease`;
  `details[open] .v2-faq__answer { grid-template-rows: 1fr }`;
  `.v2-faq__answer > div { min-height: 0; overflow: hidden }`.
- Markup dibungkus satu `<div>` di dalam `.v2-faq__answer` (syarat teknik
  `0fr → 1fr`), `margin-top: 8px` dipindah ke `.v2-faq__answer p` supaya jarak
  jawaban tidak ikut terhitung saat tertutup.
- `@media (prefers-reduced-motion: reduce)`: `transition: none` untuk
  `.v2-faq__answer` (dan `.v2-dock__tip`).
- Teknik `grid-template-rows` didukung Chromium/Firefox/Safari 16+; repo tidak
  punya `browserslist` (target dari Vite default = modern), jadi fallback
  `max-height` tidak ditambahkan.

### Angka aktual (Playwright, dist build, 127.0.0.1:4200, clientWidth 1440)

| Cek | Hasil |
|---|---|
| `.v2-hero__grid` jumlah `repeating-linear-gradient` | **2** |
| `.v2-hero__grid` arah | `to right` + layer kedua **tanpa token arah = `to bottom`** (browser menghapus arah default saat serialisasi; dites: `to bottom` → `repeating-linear-gradient(...)` tanpa `to bottom`, sedangkan `to top` tetap tertulis) |
| `.v2-hero__grid` pitch | **124px** di kedua layer; garis vertikal di x = **52, 176, 300, …, 1416** (12 garis, hasil hitung piksel screenshot) |
| `.v2-hero__grid` garis horizontal | y = **0, 124, 248, 372, 496, 620, 744, 868** (8 garis, screenshot) |
| `.v2-cta__grid` jumlah `repeating-linear-gradient` | **2** (`to right` + `to bottom`) |
| `.v2-cta__grid` pitch | **8.33333%** keduanya; garis vertikal x = **0, 103, 205, …, 1129** (12), horizontal y = **0, 47, 94, …, 519** (12) |
| Warna garis (computed) | `rgba(10, 10, 10, 0.04)` di kedua grid |
| `.v2-faq details` tertutup (5 item) | **62 / 62 / 62 / 62 / 62 px** (bukan 132) |
| Rincian 62px | summary 21px + padding 40px + border-bottom 1px |
| Jarak antar item (docTop selisih) | **61.5px** (nempel, hanya hairline) |
| Klik summary pertama | tinggi **62 → 92px**, `open: true`, item kedua docTop **4791.5 → 4821.5** (turun 30px) |
| `.v2-dock a` count | **6** |
| href dock | `#capture, #how-it-works, #dashboard, #faq, t.me/NotinnBot, /notes` — **tidak ada `#tags`** |
| `aria-label` per item | `Capture, How it works, Dashboard, FAQ, Open in Telegram, Web dashboard` (semua tidak null) |
| `.v2-dock__tip` per item | **6/6**, semua `role="tooltip"` |
| hover item → `opacity` tip | **1**, `pointer-events: none`, jarak tip bottom → link top **8px** (di atas dock) |
| `:focus-visible` (Tab) → `opacity` tip | **1**, `a.matches(":focus-visible") === true` |
| `.v2-sheet__tags` | masih **`id="tags"`** |
| reduced-motion | `.v2-dock__tip` dan `.v2-faq__answer` `transition: none` |
| `.v2-dock__bar` width | **305px** (6 item), bukan 353px |

Responsif (grid dua arah + dock 6 + FAQ):

| Lebar | hero / cta gradient | FAQ tertutup | dock a | overflow |
|---|---|---|---|---|
| 1440 | 2 / 2 | 62px ×5 | 6 | false |
| 1280 | 2 / 2 | 62px ×5 | 6 | false |
| 768 | 2 / 2 | 62px ×5 | 6 | false |
| 390 | 2 / 2 | 50.8px ×5 | 6 | false |

### Gate

- `npx tsc --noEmit` → **exit 0**
- `npm run build:client` → **PASS**, `BUILD_EXIT=0`, `✓ built in 23.49s`
- `npx eslint src/components/landing/v2 src/app/landing-page.tsx` → **exit 0**

Tidak mengubah warna garis grid, font, radius, aset, barcode, ticker, Pricing
mirror, Receipt rotate, F2 CTA, atau live counter. Cornell dan `tsconfig.json`
tidak disentuh. Tidak ada GSAP; tooltip dan accordion murni CSS transition.
File sementara pengukuran (Playwright/sharp) sudah dihapus.

---

## Fix Batch 9 — Bento mobile: swipe horizontal (carousel)

**File yang diubah**
- `dashboard/src/styles/landing-v2.css` — semua perubahan di dalam
  `@media (max-width: 768px)` + satu rule dasar `.v2-bento__hint { display: none }`
  (supaya hint tidak pernah muncul di desktop) + `prefers-reduced-motion`.
- `dashboard/src/components/landing/v2/bento.tsx` — atribut a11y di dua track
  dan satu `<p class="v2-bento__hint">` di dalam `.v2-bento__grid`.

### Yang dikerjakan

**1. Track horizontal (mobile saja)**
- `.v2-bento__grid` → `display: flex; flex-direction: column; gap: 12px;
  overflow: visible` (dua row tetap, A lalu B).
- `.v2-bento__row--a`, `.v2-bento__row--b` → `display: flex; flex-direction:
  row; flex-wrap: nowrap; gap: 12px; overflow-x: auto; overflow-y: hidden;
  scroll-snap-type: x mandatory; scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch; scrollbar-width: none;
  padding-bottom: 4px`, plus `::-webkit-scrollbar { display: none }`.
- `.v2-bento__side` → `display: contents`; anak-anaknya (Search, Ask) naik jadi
  sibling di track Row A. Wrapper tidak punya `gap`/`padding` sendiri yang
  hilang (gap 16px-nya memang dari `.v2-bento__side`, dan track memakai gap 12px
  sesuai brief), jadi tidak ada properti yang bocor.
- Tile: `flex: 0 0 82%; width: 82%; max-width: 340px; height: auto;
  min-height: 300px; scroll-snap-align: start; scroll-snap-stop: always`.
  Dashboard: `flex-basis: 88%; width: 88%; max-width: 380px`.
- Catatan implementasi: rule lama `@media (max-width: 768px)` yang meng-stack
  (`.v2-bento__side, .v2-bento__row--b { grid-template-columns: 1fr }`) dihapus
  karena sudah tidak relevan; padding tile mobile `1.1rem 1.15rem 1.25rem` dan
  `height:auto; min-height:0` untuk Search/Ask/Row B dipertahankan (sempat
  hilang saat blok diganti, lalu dikembalikan). Dashboard tile tetap `padding: 0`
  supaya mockup full-bleed seperti desktop.

**2. Mockup dashboard**
- `.v2-dash { height: auto; min-height: 0; aspect-ratio: 812 / 520 }` —
  `min-height: 0` perlu karena blok `max-width: 1100px` di atasnya memasang
  `min-height: 280px` yang kalau tidak di-reset akan mengalahkan `aspect-ratio`.
- `.v2-dash__shot { height: 100%; object-fit: cover }`. Tidak ada lagi `240px`
  yang memotong isi; tinggi mockup sekarang mengikuti lebar tile
  (188 / 207 / 243 px di 390 / 430 / 768).
- `.v2-dash__grid` tidak ada di markup (mockup adalah `<img>`), jadi rule
  `grid-template-columns: minmax(0, 1fr)` tidak ditambahkan — tidak ada elemen
  yang cocok. Keluhan "grid 2 kolom di dalam mockup" berasal dari gambar aset,
  bukan dari CSS, dan aset tidak diubah.

**3. Hint**
- `<p class="v2-bento__hint" aria-hidden="true">Geser untuk lihat lainnya →</p>`
  di dalam `.v2-bento__grid`, `display: none` di desktop, `display: block` di
  `max-width: 768px`. Jarak 12px datang dari `gap` grid, bukan margin.

**4. A11y**
- Kedua track: `role="region"`, `aria-label` ("Dashboard tiles, geser horizontal"
  / "Format tiles, geser horizontal"), `tabindex="0"`. Terverifikasi fokusable
  dan ArrowRight menggeser track (0 → 305px, snap ke tile berikutnya).
- `@media (prefers-reduced-motion: reduce)` → `scroll-behavior: auto` untuk
  kedua track (terukur `auto` di context reduced-motion, `smooth` di normal).

**5. Perbaikan tambahan (konsekuensi carousel)**
- `.v2-wave { min-width: 0; overflow: hidden }` di mobile: 35 bar × 5px + gap
  3px = 277px, lebih lebar dari isi tile 82% (237px di 390), sehingga bar
  terakhir meluber keluar kartu. Sekarang strip dekoratif itu clip di dalam
  kartunya sendiri. `scrollWidth == clientWidth` untuk keenam tile (tidak ada
  lagi konten yang menembus tepi tile).

### Angka aktual (Playwright, dist build, 127.0.0.1:4271)

| Cek | 390 | 430 | 768 | 1440 |
|---|---|---|---|---|
| `.v2-bento__row--a` display | flex | flex | flex | **grid** |
| `overflow-x` row A | auto | auto | auto | **visible** |
| row A `scrollWidth` / `clientWidth` | **864 / 333** | **950 / 368** | **1084 / 657** | 1232 / 1232 |
| row A `scroll-snap-type` | x mandatory | x mandatory | x mandatory | none |
| row B `scrollWidth` / `clientWidth` | 844 / 333 | 928 / 368 | 1044 / 657 | 1232 / 1232 |
| `.v2-bento__side` display | contents | contents | contents | grid (404×520) |
| tinggi `.v2-bento` | **1040** | **1017** | **1034** | **1380** |
| tinggi halaman total | **8030** | **7917** | **7628** | 6638 |
| overflow-x `documentElement` | false | false | false | false |
| tile Row A flex-basis | 88 / 82 / 82% | 88 / 82 / 82% | 88 / 82 / 82% | auto |
| tile Row B flex-basis | 82 / 82 / 82% | 82 / 82 / 82% | 82 / 82 / 82% | auto |
| tile width (px) Row A | 293 / 273 / 273 | 324 / 301 / 301 | 380 / 340 / 340 | 812 / 404 / 404 |
| tile width (px) Row B | 273 / 273 / 273 | 301 / 301 / 301 | 340 / 340 / 340 | 404 / 404 / 392 |
| tinggi tile | 300 semua | 300 semua | 300 semua | 520 / 252 / 252 / 284 |
| `.v2-dash` tinggi | 187.9 | 207.2 | 243.3 | 520 |
| `.v2-dash` aspect-ratio | 812 / 520 | 812 / 520 | 812 / 520 | auto |
| `.v2-dash__shot` object-fit | cover | cover | cover | cover |
| track `tabindex` / `role` | 0 / region | 0 / region | 0 / region | 0 / region |
| hint display | block | block | block | **none** |
| grid width / L / R | 333 / 28 / 28 | 368 / 31 / 31 | 657 / 56 / 56 | **1232 / 104 / 104** |

Breakpoint tetangga (tidak ada state aneh): 769 → row A `grid`, bento 1790,
tanpa overflow; 1024 → grid, 1790; 1100 → grid, 1674; 1101 → grid, 1380;
1920 → grid, 1380, grid width 1712. Tidak ada overflow horizontal di semua lebar.

### Dua target brief yang TIDAK tercapai (beserta sebab aritmetiknya)

1. **Tinggi `.v2-bento` ≤ 900px** → aktual **1040px** di 390.
   Batas bawah yang mungkin dengan batasan brief: padding 3.5rem×2 = 112,
   `gap` inner 40, header section 238 (eyebrow 16 + 14 + judul 69 + gap 24 +
   intro 115), gap grid 12, Row A 304 (min-height 300 + 4 padding-bottom),
   Row B 304, hint 31 → **1041**. Karena `min-height: 300px` per tile dan
   header 238px adalah ketentuan brief sendiri, 900px tidak bisa dicapai tanpa
   melanggar salah satunya.
2. **Halaman total < 7000px** → aktual **8030px** di 390.
   Section non-bento di 390 berjumlah **7016px** (hero 1342, marquee 72, how
   1807, before-after 1291, pricing 1167, cta 555, footer 613, dock 170).
   Artinya bahkan dengan Bento setinggi 0px, halaman tetap > 7000px — target
   mustahil tanpa menyentuh section lain (dilarang brief). Penurunan dari
   8918 → 8030 (−888px) berasal sepenuhnya dari Bento (1928 → 1040, −888).

### Gate

- `npx tsc --noEmit` → **exit 0**
- `npm run build:client` → **PASS**, `BUILD_EXIT=0`, `✓ built in 34.05s`
- `npx eslint src/components/landing/v2 src/app/landing-page.tsx` → **exit 0**

Tidak menyentuh hero, pricing, cta, footer, dock, FAQ, Cornell, `tsconfig.json`,
atau desktop ≥ 1101px (grid 1232/104/104, bento 1380, dashboard 812, side 404,
Row B 404/404/392 — identik). Tidak ada GSAP / library carousel; murni CSS
scroll-snap. Tidak ada tile/isi/warna/radius/font/aset yang dihapus atau diubah.
File pengukuran sementara (Playwright `.mjs`) sudah dihapus.
