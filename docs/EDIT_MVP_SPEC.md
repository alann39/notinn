# Edit MVP — Spec untuk omp

> Tujuan: user bisa memperbaiki judul + isi catatan dari web dashboard, tanpa regenerate (yang membuang hasil & bakar token).
> Status: **belum dikerjakan**. Spec ini hasil audit kode di `main` @ `a9cfe79`.

---

## 0. Aturan yang TIDAK boleh dilanggar

Ini bukan saran, ini invarian blueprint repo:

1. **`note_outputs` immutable.** Jangan `UPDATE public.note_outputs`. Revisi selalu baris baru + repoint `notes.current_output_id` (lihat komentar `generation_reason` di `phase0_enums_and_helpers.sql:70`).
2. **Jangan tambah value ke enum `generation_reason`** (`initial|regenerate|shorter|detailed|custom`). Edit manual bukan generasi.
3. **Jangan sentuh Cornell** (`cornell-*.ts(x)`) — itu lab, belum di-wire, bukan bagian task ini.
4. **Jangan hapus dependency Tiptap** di commit ini. Itu chore terpisah (`@tiptap/*` memang 0 import, tapi bukan urusan Edit MVP).
5. **Jangan commit file dirty yang tidak terkait**: `README.md`, `dashboard/playwright.config.ts`, `design.pen`.
6. **Jangan push ke `main`.** Kerja di branch `feat/web-note-edit`, push preview butuh approval manusia.
7. Semua RPC web wajib: `security definer`, `set search_path = ''`, auth via `public.get_linked_user_id()`, `revoke all ... from public, anon, authenticated` lalu `grant execute ... to service_role, authenticated`.

---

## 1. Kondisi sekarang (hasil audit)

| Hal | Fakta |
|---|---|
| Halaman detail | `dashboard/src/app/note-detail-page.tsx` (1.120 baris) — read-only: download PDF/MD/TXT, copy, toggle action item, regenerate, delete |
| RPC web yang ada | `web_get_note`, `web_list_notes`, `web_search_notes`, `web_set_note_saved`, `web_delete_note`, `web_submit_job`, `web_get_job_status`, `web_list_templates`, `web_get_profile`, `web_get_preferences`, `web_get_usage_summary` |
| RPC update | **tidak ada** → harus dibuat |
| Penyimpanan isi | `notes.current_output_id` → `note_outputs.content_json` + `rendered_text` |
| Render di UI | `marked` + `DOMPurify` (sudah di deps & dipakai) |
| Revisi yang sudah ada | `note_edit_drafts` + `begin/complete/apply_note_edit_draft` — dipakai bot (AI rewrite). Pola ini yang kita tiru, bukan dimodifikasi. |
| Trigger | `notes_set_updated_at` sudah ada → **jangan** set `updated_at` manual di notes |

---

## 2. Keputusan desain

**Overlay table, bukan mutasi output.**

Alasan: `content_json` divalidasi per `template_key` (schema_version). Kalau kita menulis markdown hasil edit ke `content_json`, invarian schema bisa pecah dan `rendered_text` berhenti deterministik. Overlay memisahkan "kata AI" dari "koreksi manusia" — bisa dihapus kapan saja tanpa menyentuh histori.

- **Judul** → `UPDATE notes.title` (metadata mutable, aman, sudah ada constraint ≤300 & not blank).
- **Isi** → tabel baru `note_edits` (1 baris per note, overlay di atas `base_output_id`).
- Overlay **hanya berlaku** kalau `base_output_id = notes.current_output_id`. Kalau user regenerate, overlay lama otomatis basi dan UI balik nampilin output AI (data tetap tersimpan, tidak merusak apa pun).

---

## 3. Migration

File baru: `supabase/migrations/20261023120000_web_note_manual_edit.sql`

```sql
-- Web manual edit: overlay revision for note body + mutable title update.
-- note_outputs stays immutable (blueprint 3, principle 4); manual corrections
-- live in note_edits and are only honored while they still point at the
-- current output.

create table public.note_edits (
  note_id uuid primary key references public.notes (id) on delete cascade,
  base_output_id uuid not null,
  rendered_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint note_edits_rendered_text_not_blank
    check (length(btrim(rendered_text)) > 0),
  constraint note_edits_rendered_text_length
    check (length(rendered_text) <= 100000),
  constraint note_edits_base_output_fkey
    foreign key (base_output_id, note_id)
    references public.note_outputs (id, note_id) on delete cascade
);

comment on table public.note_edits is
  'Human correction overlay for a note body. Never mutates note_outputs; ignored once base_output_id no longer matches notes.current_output_id.';

create trigger note_edits_set_updated_at
  before update on public.note_edits
  for each row execute function public.set_updated_at();

alter table public.note_edits enable row level security;
revoke all on table public.note_edits from anon, authenticated;
revoke all on table public.note_edits from public, service_role;

-- --- web_update_note ----------------------------------------------------------

create or replace function public.web_update_note(
  p_note_id uuid,
  p_title text,
  p_rendered_text text
)
returns table (outcome text, note_id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_output_id uuid;
  v_title text;
begin
  v_user_id := public.get_linked_user_id();
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  v_title := nullif(btrim(coalesce(p_title, '')), '');
  if v_title is null or length(v_title) > 300 then
    return query select 'invalid_title'::text, null::uuid, null::timestamptz;
    return;
  end if;

  if p_rendered_text is null or length(btrim(p_rendered_text)) = 0 then
    return query select 'invalid_content'::text, null::uuid, null::timestamptz;
    return;
  end if;

  if length(p_rendered_text) > 100000 then
    return query select 'content_too_long'::text, null::uuid, null::timestamptz;
    return;
  end if;

  select n.current_output_id into v_output_id
    from public.notes as n
   where n.id = p_note_id
     and n.user_id = v_user_id
     and n.deleted_at is null
   for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::timestamptz;
    return;
  end if;

  update public.notes as n
     set title = v_title
   where n.id = p_note_id;

  if v_output_id is not null then
    insert into public.note_edits (note_id, base_output_id, rendered_text)
    values (p_note_id, v_output_id, p_rendered_text)
    on conflict (note_id) do update
      set base_output_id = excluded.base_output_id,
          rendered_text = excluded.rendered_text;
  end if;

  return query
    select 'updated'::text, p_note_id, now();
end;
$$;

comment on function public.web_update_note(uuid, text, text) is
  'Web RPC to update an owned note title and body. Body is stored as an overlay in note_edits; note_outputs is never modified.';

revoke all on function public.web_update_note(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.web_update_note(uuid, text, text)
  to service_role, authenticated;
```

### 3.1 `web_get_note` wajib diperluas

Return type berubah → **drop dulu**, lalu `create or replace` (pola sama seperti `phase8h`). Tambah 2 kolom di akhir, jangan ubah/urut ulang kolom lama (UI sudah mapping by name, tapi jaga diff minimal):

```sql
drop function if exists public.web_get_note(uuid);
-- ... create or replace function public.web_get_note(p_note_id uuid) ...
-- pada returns table tambahkan di paling akhir:
--   manual_edit_rendered_text text,
--   manual_edit_updated_at timestamptz
-- pada select tambahkan:
--   case when e.base_output_id = n.current_output_id then e.rendered_text end,
--   case when e.base_output_id = n.current_output_id then e.updated_at end
-- dan join:
--   left join public.note_edits as e on e.note_id = n.id
```

UI memakai: `manual_edit_rendered_text ?? output_rendered_text`.

---

## 4. UI — `note-detail-page.tsx`

Scope minimal, jangan bikin rich-text editor.

**State**
```
isEditing, draftTitle, draftContent, isSaving, saveError
```

**Masuk edit**
- Tombol `Edit` di header aksi (dekat Download/Delete), ikon pensil, `min-height:44px`.
- Prefill: `draftTitle = note.title`, `draftContent = manual_edit_rendered_text ?? output_rendered_text`.

**Mode edit**
- Judul: `<input>` teks biasa, maxLength 300.
- Isi: `<textarea>` monospace, `min-height 45vh`, spellcheck off, maxLength 100000.
- Toggle `Pratinjau` (pakai `marked` + `DOMPurify` yang sudah ada) — opsional tapi murah, bantu karena isinya markdown.
- Autosave draft **ke localStorage saja** (`notinn:note-edit:<noteId>`), debounce 1s. **Jangan** bikin RPC draft di DB.
- Simpan: `supabase.rpc('web_update_note', { p_note_id: id, p_title, p_rendered_text })`.
  - `outcome === 'updated'` → hapus localStorage, refetch note, keluar dari mode edit.
  - `invalid_title` / `invalid_content` / `content_too_long` / `not_found` → tampilkan pesan, tetap di mode edit, jangan refetch.
- Batal: kalau dirty → konfirmasi (`AlertDialog` sudah dipakai di file ini). Hapus localStorage, keluar.
- Keyboard: `Esc` = batal, `Cmd/Ctrl+Enter` = simpan.
- Mobile: action bar sticky di bawah + `env(safe-area-inset-bottom)`; textarea `100%` width, tidak ada horizontal scroll.
- Disable tombol Edit kalau `note` masih `processing` / `current_output_id` null.

**Jangan**
- Jangan bikin tab/step ala Cornell.
- Jangan sentuh action items / tags (tetap milik AI di versi ini).
- Jangan ubah layout read mode yang sudah ada.

---

## 5. Verification (wajib, urut)

```powershell
# 1. migration bersih dari nol
npm run db:reset

# 2. tipe DB ter-generate ulang (RPC baru + kolom baru)
npm run db:types

# 3. typecheck + lint dashboard
cd dashboard; npx tsc --noEmit -p tsconfig.json; npx eslint src/app/note-detail-page.tsx

# 4. unit test repo (deno)
cd ..; npm test

# 5. build
cd dashboard; npm run build
```

Manual E2E (dev server):
1. Login via magic link → buka catatan.
2. Edit judul + isi → Simpan → reload → perubahan persist.
3. Regenerate catatan → pastikan isi balik ke output AI (overlay basi tidak menimpa).
4. Edit lagi setelah regenerate → overlay baru menempel ke output baru.
5. Coba simpan judul kosong & isi kosong → ditolak dengan pesan jelas.
6. Cek user lain tidak bisa update catatan (RPC harus `not_found`).
7. Mobile 390px: tidak ada horizontal scroll, tombol ≥44px.

---

## 6. Deliverable

- Branch: `feat/web-note-edit`
- Commit 1: `feat(db): add web_update_note RPC with note_edits overlay`
- Commit 2: `feat(dashboard): inline title & body editing on note detail`
- **Jangan push.** Lapor diff + hasil verification, tunggu approval.

---

## 7. Yang sengaja ditunda (jangan dikerjain sekarang)

- Login email/Google (butuh perubahan model identitas: `users.telegram_user_id` NOT NULL + `enable_signup = false`)
- Edit action items & tags
- Riwayat versi / restore versi lama di UI
- Hapus dependency Tiptap
- Wire Cornell ke route produksi
