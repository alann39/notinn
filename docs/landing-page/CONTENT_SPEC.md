# Content specification

## 1. Voice

- Direct, calm, useful.
- Bahasa Indonesia sehari-hari tanpa slang atau jargon AI.
- Address reader dengan `kamu` secara konsisten.
- CTA verb-first.
- Sentence case untuk heading, button, nav, dan labels.
- Hindari kata: revolusioner, ajaib, effortless, supercharge, second brain, game-changer.
- Jangan memakai emoji sebagai UI icon.
- Jangan membuat klaim akurasi, keamanan absolut, jumlah pengguna, waktu pemrosesan, atau penghematan waktu tanpa data.

## 2. Page metadata copy

```text
Title: Notinn | Ubah pesan dan dokumen jadi catatan rapi
Description: Kirim teks, voice note, screenshot, atau dokumen lewat Telegram. Notinn mengubahnya menjadi catatan terstruktur yang bisa disimpan dan ditemukan lagi.
Open Graph title: Bahan mentah masuk. Catatan rapi keluar.
Open Graph description: Notinn adalah inbox pengetahuan di Telegram untuk menyusun teks, voice note, screenshot, dan dokumen menjadi catatan yang siap dipakai.
```

Canonical URL harus berasal dari deployment config. Jangan hard-code domain yang belum ditetapkan.

## 3. Header

| Element                     | Copy             |
| --------------------------- | ---------------- |
| Wordmark                    | Notinn           |
| Nav 1                       | Cara kerja       |
| Nav 2                       | Format           |
| Nav 3                       | Privacy          |
| Utility                     | Buka dashboard   |
| Primary CTA                 | Buka di Telegram |
| Mobile menu accessible name | Buka navigasi    |

Nav anchors: `#cara-kerja`, `#format`, `#privacy`.

## 4. Hero

**Status label**

```text
Closed Alpha
```

**H1**

```text
Kirim bahan mentah. Terima catatan yang rapi.
```

**Supporting copy**

```text
Kirim teks, voice note, screenshot, atau dokumen lewat Telegram. Notinn menyusun isinya menjadi catatan yang bisa kamu simpan, ubah formatnya, dan temukan lagi.
```

**Primary CTA**

```text
Buka Notinn di Telegram
```

**Secondary anchor**

```text
Lihat cara kerja
```

**Trust note**

```text
Berjalan di private chat Telegram. Output AI tetap perlu kamu tinjau.
```

## 5. Supported input strip

**Heading**

```text
Kirim dari format yang sudah kamu pakai
```

**Items**

```text
Teks
Pesan yang diteruskan
Voice note dan audio
Screenshot dan foto
PDF dan DOCX
TXT dan Markdown
```

Footnote:

```text
Batas ukuran, durasi, dan halaman berlaku selama Closed Alpha.
```

## 6. Transformation proof

**Eyebrow**

```text
Satu kiriman, hasil yang siap dipakai
```

**Heading**

```text
Dari pesan acak menjadi rencana yang jelas
```

**Before label**

```text
Pesan masuk
```

**Synthetic before content**

```text
besok ketemu vendor jam 10 bahas proposal baru terus tanyain revisi harga sama timeline implementasi mungkin bawa tim legal juga
```

**After label**

```text
Catatan dari Notinn
```

**Synthetic after content**

```text
Persiapan rapat vendor

Jadwal
Besok, 10.00

Topik pembahasan
- Proposal baru
- Revisi harga
- Timeline implementasi
- Perlu tidaknya tim legal ikut
```

**Disclosure**

```text
Contoh sintetis. Struktur output mengikuti isi sumber dan format yang dipilih.
```

## 7. How it works

**Heading**

```text
Tetap di Telegram. Tiga langkah saja.
```

| Step | Title            | Body                                                                                               |
| ---- | ---------------- | -------------------------------------------------------------------------------------------------- |
| 01   | Kirim            | Teruskan pesan atau kirim teks, voice note, screenshot, foto, atau dokumen ke private chat Notinn. |
| 02   | Notinn menyusun  | Notinn membaca content yang diperlukan, memilih struktur default, lalu menghasilkan catatan.       |
| 03   | Simpan atau ubah | Simpan hasilnya, buat lebih singkat atau detail, ganti format, cari lagi, atau hapus.              |

Catatan implementasi: gunakan istilah `content` hanya pada dokumen teknis. UI copy memakai `isi`.

## 8. Formats

**Eyebrow**

```text
Format yang mengikuti kebutuhanmu
```

**Heading**

```text
Bukan satu ringkasan untuk semua hal
```

**Body**

```text
Gunakan hasil default, lalu ubah format tanpa mengirim ulang bahan yang sama.
```

**Featured formats**

```text
Clean note
Short summary
Action items
Meeting notes
Study notes
Research note
```

**Progressive disclosure label**

```text
Lihat semua format
```

Expanded list may include detailed summary, key points, decision log, SOP/procedure, and extract & summarise. Names can use product labels in English until a product-wide localisation decision exists. Do not translate only this page if Telegram labels remain English.

## 9. Use cases

**Heading**

```text
Untuk informasi yang datang sebelum kamu sempat merapikannya
```

### Meetings

```text
Rekam catatan setelah rapat. Dapatkan konteks, keputusan, dan action items yang memang disebutkan.
```

### Study

```text
Kirim materi atau screenshot. Susun konsep, penjelasan, contoh, dan pertanyaan review.
```

### Research

```text
Ringkas dokumen menjadi temuan, bukti, keterbatasan, dan tindak lanjut.
```

### Daily capture

```text
Ucapkan ide saat bergerak atau teruskan chat panjang. Rapikan nanti tanpa memulai dari halaman kosong.
```

## 10. Search and dashboard

**Heading**

```text
Catatan tidak berhenti setelah dibuat
```

**Body**

```text
Simpan catatan penting, buka recent notes, cari berdasarkan kata kunci, atau gunakan dashboard untuk membaca dan mengekspor hasil dengan lebih leluasa.
```

**Link**

```text
Buka dashboard
```

Do not claim dashboard is required. Telegram remains primary.

## 11. Privacy section

**Eyebrow**

```text
Privacy yang dijelaskan, bukan disiratkan
```

**Heading**

```text
Notinn meminimalkan file mentah. Batas pihak lain tetap berlaku.
```

**Bullets**

```text
- Raw audio, image, dan document bytes diproses di memory dan tidak disimpan sebagai file Notinn.
- Teks turunan dan catatan mengikuti privacy mode serta bertahan sampai kamu menghapus note atau account.
- Original message atau file di Telegram tidak ikut terhapus ketika account Notinn dihapus.
- Content yang diperlukan dikirim ke Google Gemini. OpenRouter hanya menerima content saat transient fallback digunakan.
- Selama Gemini memakai unpaid API tier, jangan kirim informasi sensitif atau rahasia.
```

**Link**

```text
Baca privacy notice lengkap
```

**AI limitation note**

```text
Catatan yang dihasilkan dapat tidak lengkap atau keliru. Tinjau hasil sebelum memakainya untuk keputusan penting.
```

## 12. Availability

**Heading**

```text
Saat ini masih Closed Alpha
```

**Body**

```text
Akses tersedia untuk user yang diundang. Fitur, batas penggunaan, provider, dan availability dapat berubah selama tahap ini.
```

**CTA**

```text
Buka Notinn di Telegram
```

Do not say `gratis`, `free forever`, `tanpa kartu`, `langsung aktif`, or `join waitlist` unless the operating policy changes.

## 13. FAQ

### Apa yang bisa saya kirim?

```text
Notinn mendukung teks, pesan yang diteruskan, voice note, audio, screenshot, foto, PDF, DOCX, TXT, dan Markdown. Batas ukuran, durasi, halaman, dan codec berlaku selama Closed Alpha.
```

### Apakah Notinn menyimpan file asli saya?

```text
Raw audio, image, dan document bytes diproses di memory dan tidak disimpan sebagai file Notinn. Original copy di Telegram mengikuti kebijakan dan kontrol penghapusan Telegram sendiri.
```

### Apakah hasilnya selalu akurat?

```text
Tidak. Hasil AI dapat tidak lengkap, keliru, atau melewatkan konteks. Notinn menampilkan uncertainty saat terdeteksi, tetapi kamu tetap perlu meninjau hasil sebelum memakainya.
```

### Bahasa apa yang didukung?

```text
Input Bahasa Indonesia dan English didukung. Secara default, output mengikuti bahasa sumber. Preference output dapat diubah di settings.
```

### Apakah saya perlu membuat account baru?

```text
Untuk penggunaan Telegram, tidak perlu email atau password terpisah. Identitas account berasal dari private chat Telegram. Dashboard memakai secure, single-use link yang diminta dari bot.
```

### Bagaimana cara menghapus data?

```text
Hapus note langsung dari aksinya. Untuk account, kirim /delete_account lalu ikuti confirmation. Ada cancellation window tujuh hari sebelum penghapusan final.
```

### Apakah Notinn tersedia di group Telegram?

```text
Belum. Versi saat ini hanya menerima private chat.
```

## 14. Final CTA

**Heading**

```text
Biarkan Telegram menjadi pintu masuk. Bukan tempat informasi hilang.
```

**Body**

```text
Kirim satu bahan yang memang ingin kamu rapikan, lalu lihat apakah hasilnya berguna untuk cara kerjamu.
```

**CTA**

```text
Buka Notinn di Telegram
```

**Closing note**

```text
Closed Alpha. Akses memerlukan undangan aktif.
```

## 15. Footer

```text
Notinn
Inbox pengetahuan di Telegram.

Cara kerja
Format
Privacy notice
Terms
Dashboard
Telegram bot

Closed Alpha
© {current year} Notinn
```

Year must come from build/runtime, not a manually stale literal.
