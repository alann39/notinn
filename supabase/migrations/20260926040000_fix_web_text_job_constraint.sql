-- Fix web text job constraint:
-- When a text job's note is staged or the job fails, source_text is scrubbed to null
-- for privacy (blueprint 16.3). The source constraint must permit input_type = 'text'.

alter table public.processing_jobs drop constraint if exists processing_jobs_source_required;

alter table public.processing_jobs
  add constraint processing_jobs_source_required
  check (
    update_id is not null
    or storage_path is not null
    or input_type = 'text'
  );
