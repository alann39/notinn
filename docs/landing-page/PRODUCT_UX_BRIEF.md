# Product and UX brief

## 1. Problem

Target user sudah menerima atau membuat banyak informasi di Telegram, tetapi bahan tersebut masih berantakan: pesan panjang, voice note, screenshot, foto, atau dokumen. Mereka harus membaca ulang, menyalin, merapikan, dan mengingat lokasi informasi secara manual.

Landing page harus menghubungkan masalah itu dengan alur Notinn yang paling sederhana:

```text
Bahan mentah
  -> kirim ke private chat Notinn
  -> Notinn menyusun catatan
  -> simpan atau ubah format
  -> temukan kembali saat dibutuhkan
```

## 2. Positioning

**Kategori:** conversational knowledge inbox.

**Bukan:** generic AI summariser, cloud drive, task manager, meeting recorder, atau pengganti Telegram.

**One-line value proposition:**

> Notinn mengubah teks, voice note, screenshot, dan dokumen yang kamu kirim lewat Telegram menjadi catatan terstruktur yang siap dipakai lagi.

## 3. Target audience

### Primary

1. Knowledge worker Indonesia yang banyak menerima informasi di chat.
2. Mahasiswa yang menyimpan materi, screenshot, PDF, dan voice note.
3. Independent professional yang membutuhkan ringkasan, action items, atau catatan rapat tanpa memindahkan bahan ke aplikasi lain.

### Priority jobs

| Situasi                       | Hasil yang dicari                                       |
| ----------------------------- | ------------------------------------------------------- |
| Selesai rapat atau perjalanan | Voice note menjadi keputusan dan action items           |
| Menerima chat panjang         | Poin penting tersusun tanpa merapikan manual            |
| Menerima PDF atau DOCX        | Ringkasan detail beserta keterbatasan yang terlihat     |
| Menemukan screenshot berguna  | Teks dan konteks menjadi catatan yang bisa dicari       |
| Membutuhkan catatan lama      | Mencari ulang dari library atau bertanya secara natural |

## 4. Business and experience goals

### Primary goal

Meningkatkan kunjungan yang membuka private chat bot dan memahami tindakan pertama yang harus dilakukan.

### Secondary goals

- membangun kepercayaan sebelum user mengirim content;
- menjelaskan input yang didukung dan hasil yang diterima;
- menetapkan ekspektasi bahwa output AI perlu ditinjau;
- mengarahkan existing user ke dashboard tanpa mengganggu CTA utama.

### Non-goals

- mengumpulkan email atau nomor telepon;
- menawarkan signup web;
- melakukan upload file di browser;
- menampilkan dashboard interaktif palsu;
- menjual plan yang belum tersedia publik;
- membuat halaman SEO terpisah pada iterasi pertama;
- mengimplementasikan chat demo yang memproses content nyata.

## 5. Success model

Tidak ada target angka yang dibuat sebelum baseline tersedia. Instrumentasi hanya mencatat event content-free berikut:

1. `landing_view`
2. `landing_primary_cta_click`
3. `landing_secondary_cta_click`
4. `landing_nav_click`
5. `landing_faq_open`
6. `landing_privacy_link_click`
7. `landing_dashboard_click`

Funnel utama:

```text
landing_view
  -> landing_primary_cta_click
  -> Telegram handoff
```

Telegram handoff tidak membuktikan bot start. Korelasi dengan `/start` hanya boleh memakai campaign code yang tidak mengandung identitas atau content user.

## 6. Core journey

### First-time visitor

1. Melihat promise dan visual alur di fold pertama.
2. Memahami bahwa interaksi terjadi lewat Telegram.
3. Melihat contoh input dan output sintetis.
4. Memeriksa format, use case, dan privacy.
5. Memilih `Buka Notinn di Telegram`.
6. Telegram membuka private chat Notinn.

### Existing user

1. Melihat utility link `Buka dashboard`.
2. Jika belum memiliki session, route dashboard tetap mengarahkan ke login flow yang menggunakan magic link dari bot.

### Visitor yang belum siap

1. Memilih `Lihat cara kerja`.
2. Focus berpindah ke heading section demo, bukan hanya scroll visual.
3. Setelah proof dan FAQ, final CTA mengulang satu tindakan yang sama.

## 7. Information architecture

Urutan wajib:

1. **Header:** wordmark, Cara kerja, Format, Privacy, Buka dashboard, CTA Telegram.
2. **Hero:** status Closed Alpha, promise, explanation, CTA, visual input-to-note.
3. **Supported input strip:** teks, forward, voice/audio, screenshot/photo, PDF, DOCX, TXT, Markdown.
4. **Transformation proof:** satu contoh before/after yang jujur dan bisa dibaca.
5. **How it works:** kirim, Notinn menyusun, simpan atau ubah.
6. **Output formats:** contoh format, bukan daftar sebelas card yang setara.
7. **Use cases:** rapat, belajar, riset, dan pekerjaan mandiri dalam alternating editorial rows.
8. **Search and reuse:** Telegram recent/search serta dashboard note library sebagai supporting proof.
9. **Privacy boundary:** apa yang Notinn lakukan, apa yang tetap menjadi tanggung jawab Telegram dan provider.
10. **Availability:** Closed Alpha dan batas akses.
11. **FAQ:** native disclosure.
12. **Final CTA:** satu conversion ask.
13. **Footer:** privacy, terms, dashboard, Telegram, dan product status.

## 8. Hierarchy rules

- Satu primary action per viewport: CTA Telegram.
- CTA dashboard adalah utility link, bukan filled button kedua.
- Product proof lebih penting dari daftar fitur.
- Privacy tampil sebelum final CTA, bukan disembunyikan di footer.
- Tidak ada carousel. Semua proof penting harus bisa ditemukan tanpa gesture tersembunyi.
- Tidak ada autoplay video.
- Tidak ada logo cloud sampai customer atau partner usage memiliki izin dan sumber.

## 9. Required states

| State               | Behaviour                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Default             | Semua content statis tersedia tanpa JavaScript selain enhancement                         |
| Loading             | Hero dan copy langsung dari bundle; image memakai reserved space, bukan full-page spinner |
| Image failed        | Alt text dan layout copy tetap menjelaskan alur; tidak ada blank hero                     |
| Offline/degraded    | Page shell dan copy cacheable; CTA Telegram tetap berupa link biasa                       |
| Reduced motion      | Tidak ada translate, parallax, autoplay, atau reveal-on-scroll                            |
| JavaScript disabled | Nav anchors, CTA, native details, dan legal links tetap bekerja                           |
| Narrow width        | Reflow satu kolom tanpa horizontal scroll pada 320 px                                     |
| Long translation    | CTA, heading, nav, dan demo labels membungkus tanpa clipping                              |

## 10. Constraints

- Product masih Closed Alpha.
- Telegram private chat adalah primary interface.
- Landing tidak menerima atau memproses user content.
- Generated note tidak boleh dipresentasikan sebagai selalu akurat.
- Raw audio, image, dan document bytes diproses in-memory oleh Notinn dan tidak disimpan sebagai file Notinn; original Telegram copy berada di boundary terpisah.
- Provider disclosure harus menyebut Gemini dan kemungkinan OpenRouter fallback secara ringkas, lalu menautkan privacy notice untuk detail.
- Landing tidak membaca service-role key dan tidak memanggil repository database secara langsung.
