-- Cover both columns, in foreign-key order, so deletes and integrity checks on
-- note_outputs never scan the active edit-draft table.
drop index public.note_edit_drafts_base_output_idx;
create index note_edit_drafts_base_output_note_idx
  on public.note_edit_drafts (base_output_id, note_id);

drop index public.note_edit_drafts_draft_output_idx;
create index note_edit_drafts_draft_output_note_idx
  on public.note_edit_drafts (draft_output_id, note_id)
  where draft_output_id is not null;
