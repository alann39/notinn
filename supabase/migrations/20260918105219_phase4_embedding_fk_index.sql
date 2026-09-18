-- Cover the composite foreign key used when note_outputs deletes a version.
-- note_id already has the primary-key index, but the FK begins with output_id.
create index note_embeddings_output_note_idx
  on public.note_embeddings (output_id, note_id);
