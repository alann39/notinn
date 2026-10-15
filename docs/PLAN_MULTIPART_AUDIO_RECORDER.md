# Plan: Multi-Part Audio Recording with Pipelined Transcription & Synthesis (Bypass 45MB Storage Limit)

**Created**: 2026-10-14  
**Author**: Kai (Hermes Tech Lead) & Alann  
**Target Milestone**: Notinn Audio Recording V2  
**Status**: IN PROGRESS (Phases 1, 2, & 3 Completed on `feat/multipart-recorder`)  
**Active Commits**: `cc71d28`, `23b102b`, `1831064`  

---

## 1. Executive Summary

### 1.1 Problem Statement
Supabase Free tier Storage gateway memiliki hard limit 50 MB per file upload. Di sisi frontend web recorder, kita telah membatasi rekaman maksimal **45 MB** (safety headroom 5 MB) sebelum auto-stop. Meskipun user Pro/Alpha memiliki kuota durasi hingga 2 jam (7200 detik), rekaman audio berkualitas tinggi (WebM Opus 64-128kbps atau AAC) dapat menembus 45 MB dalam waktu 45–60 menit, memotong sesi sebelum durasi maksimal tercapai.

### 1.2 The Solution: "Pipelined Multi-Part Recording"
Alih-alih mencoba mengunggah satu file raksasa yang pasti diblokir oleh storage gateway, kita menerapkan strategi **Session-Based Multi-Part Recording**:
1. **Auto-Partition**: Begitu rekaman mendekati limit 45 MB (atau user klik "Jeda & Proses Bagian Ini"), Part 1 otomatis di-seal dan diunggah via TUS upload ke Supabase Storage (`audio_uploads/{session_id}_part1.webm`).
2. **Immediate Background Transcription**: Backend langsung mentranskripsi Part 1 secara asinkron ke Gemini Audio API tanpa menunggu sesi rekaman selesai.
3. **Seamless Chaining ("Lanjutkan Rekaman")**: User langsung diberikan opsi untuk menekan **"Lanjutkan Rekaman (Part 2)"**. Counter bytes & timer internal untuk part tersebut di-reset, sementara akumulasi total durasi sesi tetap dicatat.
4. **Final Merged Synthesis**: Saat user mengakhiri sesi (klik "Selesai Sesi"), backend menggabungkan seluruh teks transkrip dari tiap part berurutan, lalu memanggil prompt AI (Cornell Note / Action Items / Meeting Summary) untuk menghasilkan 1 catatan akhir yang utuh dan holistik.

---

## 2. Architecture & Data Flow

```
[ Browser / InBrowserRecorder ]
       |
       |-- (Mencapai 45MB / User Split)
       v
   [ Part 1: Blob (<=45MB) ] --------(TUS Upload)-------> [ Supabase Storage ]
       |                                                         |
       | (UI: Tampilkan Banner "Part 1 Diproses",                |
       |      Buka Opsi "Lanjutkan Rekaman")                     v
       |                                              [ Edge Function: process-job ]
       |                                                         |
       |                                                         |-- (Transcribe Part 1)
       v                                                         v
   [ Part 2: Blob (<=45MB) ] --------(TUS Upload)-------> [ Storage & Transcribe Part 2 ]
       |                                                         |
       |-- (User Klik "Selesai Seluruh Sesi")                    |
       v                                                         v
   [ Call: web_finalize_session ] ------------> [ Synthesis Stage: Concatenate Transcripts ]
                                                                 |
                                                                 v
                                                     [ Note AI: Generate Note & Title ]
                                                                 |
                                                                 v
                                                     [ Save to `notes` table (1 Final Note) ]
```

---

## 3. Database & API Contracts

### 3.1 Database Migration: Session & Parts Tracking
Kita membutuhkan tabel ringan untuk melacak status sesi multi-part sebelum disatukan:

```sql
-- migration: create_audio_recording_sessions.sql

create type audio_session_status as enum ('recording', 'processing', 'completed', 'failed');

create table public.audio_recording_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_key text not null default 'meeting',
  total_parts int not null default 1,
  total_duration_seconds int not null default 0,
  status audio_session_status not null default 'recording',
  final_note_id uuid references public.notes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audio_session_parts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.audio_recording_sessions(id) on delete cascade,
  part_number int not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  duration_seconds int not null,
  transcript text,
  status text not null default 'pending', -- 'pending' | 'transcribing' | 'completed' | 'failed'
  created_at timestamptz not null default now(),
  unique(session_id, part_number)
);
```

### 3.2 Edge Function / RPC Contract

1. **`web_submit_part`**:
   - Mendaftarkan Part baru ke session aktif.
   - Enqueue worker untuk transkripsi part tersebut secara terisolasi.
   - Output: `{ part_id: string, session_id: string, status: "transcribing" }`.

2. **`web_finalize_session`**:
   - Dipanggil saat user mengakhiri sesi.
   - Menunggu seluruh transkripsi part berstatus `completed`.
   - Menggabungkan transkrip dengan format segment header:
     ```text
     [Bagian 1 (00:00 - 32:10)]
     ...isi transkrip...

     [Bagian 2 (32:11 - 58:45)]
     ...isi transkrip...
     ```
   - Menjalankan prompt AI synthesis untuk menghasilkan catatan akhir ke tabel `notes`.
   - Output: `{ note_id: string, redirect_url: string }`.

---

## 4. Micro-Task Breakdown

### Phase 1: Storage & Part Model (Database & Backend Shared)
- [ ] **Task 1.1**: Tulis migrasi SQL untuk tabel `audio_recording_sessions` dan `audio_session_parts`.
- [ ] **Task 1.2**: Tambahkan repository functions di `supabase/functions/_shared/repositories/audio-sessions.repository.ts`.
- [ ] **Task 1.3**: Tulis Deno unit test untuk CRUD `AudioSessionsRepository` (`tests/unit/audio-sessions.test.ts`).
- [ ] **Task 1.4**: Modifikasi `job-worker.service.ts` agar mendukung job jenis `transcribe_part` (hanya transkrip tanpa langsung generate final note).

### Phase 2: Session Finalizer & Synthesis Worker
- [ ] **Task 2.1**: Buat service function `concatenateTranscripts(parts: AudioPart[])` dengan timestamp offset matching.
- [ ] **Task 2.2**: Tulis unit test untuk `concatenateTranscripts` guna memastikan transkrip tidak saling tumpang tindih dan format cue rapi.
- [ ] **Task 2.3**: Buat handler di Edge Function `web-finalize-session` untuk menggabungkan hasil transkripsi dan memanggil `createNoteProvider().generateNote()`.
- [ ] **Task 2.4**: Tambahkan error handling & retry jika salah satu part mengalami kegagalan transkripsi.

### Phase 3: Frontend Recorder State Machine Refactor
- [ ] **Task 3.1**: Tambahkan state multi-part di `in-browser-recorder.tsx`:
  - `sessionId`: `string | null`
  - `currentPartNumber`: `number` (mulai dari 1)
  - `accumulatedParts`: `Array<{ partNumber: number, duration: number, bytes: number, blob: Blob }>`
  - `isUploadingPart`: `boolean`
- [ ] **Task 3.2**: Implementasikan transisi **Auto-Cut**:
  - Saat `liveBytes` mencapai 44.5 MB, picu event `onPartBoundaryReached()`.
  - Berikan visual countdown 3 detik ("Menyimpan Bagian X...").
  - Stop recorder untuk part tersebut, upload chunk via TUS.
- [ ] **Task 3.3**: Tambahkan UI State **"Part Completed / Ready to Continue"**:
  - Tampilkan banner status: *"Bagian 1 (45 MB / 35:20) berhasil diamankan dan sedang ditranskrip."*
  - Tombol Utama: **"Lanjutkan Rekaman (Part 2)"** (Orb menyala kembali, timer part reset ke 00:00, total timer berjalan).
  - Tombol Sekunder: **"Selesai & Buat Catatan Sekarang"** (jika user merasa sudah cukup).

### Phase 4: Seamless Audio Boundary & AudioContext Stash
- [ ] **Task 4.1**: Optimasi MediaRecorder restart: pastikan stream mikrofon (`MediaStream`) tidak ditutup (`keepAlive`) saat transisi antar-part agar tidak ada bunyi "pop" atau jeda prompt izin browser.
- [ ] **Task 4.2**: Waveform player untuk multi-part: buat tab/selector kecil di review player untuk mendengarkan Part 1 atau Part 2 secara terpisah sebelum finalisasi.

### Phase 5: End-to-End Testing & Verification
- [ ] **Task 5.1**: Tulis Playwright E2E spec (`dashboard/tests/browser/multipart-recorder.spec.ts`) yang mensimulasikan part cut, continuation, dan final submission menggunakan mock storage.
- [ ] **Task 5.2**: Jalankan manual QA di desktop & mobile Safari (iOS audio context keepalive test).
- [ ] **Task 5.3**: Verifikasi kuota user: pastikan total durasi dari akumulasi semua part dihitung dengan benar terhadap jatah plan user (Free vs Pro/Alpha).

---

## 5. Potential Pitfalls & Edge Cases

| Risiko / Pitfall | Mitigasi |
|---|---|
| **Audio terpotong di tengah kalimat saat 45MB** | Berikan subtle visual countdown 5 detik sebelum cut, dan idealnya ambil overlap 1 detik di part berikutnya jika format audio memungkinkan, atau beri jeda hening sejenak bagi user. |
| **User menutup browser saat Part 1 selesai tapi belum klik Lanjutkan** | Sesi disimpan di `audio_recording_sessions` dengan status `recording`. Di dashboard muncul toast banner: *"Kamu memiliki rekaman yang belum diselesaikan. Lanjutkan atau Selesaikan?"* |
| **Salah satu Part gagal ditranskrip oleh Gemini** | Backend worker menerapkan exponential backoff retry (3x). Jika tetap gagal, berikan opsi di UI untuk re-transcribe part yang bersangkutan tanpa merekam ulang. |
| **Safari iOS menonaktifkan mic di background** | Mic stream dijaga tetap `active` dengan Web Audio keep-alive buffer kosong selama transisi upload Part berlangsung. |

---

## 6. Next Steps
1. Review breakdown teknis di atas bersama tim/user.
2. Setelah plan disetujui, buat branch baru `feat/multipart-audio-session`.
3. Mulai eksekusi berurutan dari Phase 1 (Database & Backend contracts) secara TDD.
