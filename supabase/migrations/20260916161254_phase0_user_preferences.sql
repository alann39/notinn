-- Phase 0 / migration 4 of 9
-- public.user_preferences
--
-- One row per user, created on onboarding in Phase 1. The three default_*_template
-- columns are deliberately nullable: NULL means "the user has expressed no
-- preference", which is what lets the deterministic routing table in blueprint
-- 6.3 decide. Storing a non-null default here would silently override that table,
-- including the "Meeting Notes if meeting-like, otherwise Clean Note" rule for
-- voice notes, which cannot be expressed as a static column default.

create table public.user_preferences (
  user_id uuid primary key references public.users (id) on delete cascade,

  -- "mirror" (mirror the source language) or a BCP-47 language tag such as id/en.
  output_language text not null default 'mirror',

  default_text_template text references public.templates (key),
  default_voice_template text references public.templates (key),
  default_document_template text references public.templates (key),

  save_transcript boolean not null default true,
  save_extracted_text boolean not null default true,
  privacy_mode public.privacy_mode not null default 'balanced',
  timezone text not null default 'Asia/Jakarta',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_preferences_output_language_format check (
    output_language = 'mirror'
    or output_language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
  ),
  constraint user_preferences_timezone_not_blank check (length(btrim(timezone)) > 0),
  constraint user_preferences_timezone_length check (length(timezone) <= 64)
);

comment on table public.user_preferences is
  'Per-user settings (blueprint 13.3). Created on onboarding; Phase 0 defines the shape only.';

comment on column public.user_preferences.default_text_template is
  'NULL means the deterministic routing default from blueprint 6.3 applies. A non-null value is an explicit user choice and takes precedence for future jobs only.';

comment on column public.user_preferences.privacy_mode is
  'balanced (default) retains normalized source plus transcript/extracted text. minimal retains only the generated note. Applies at persistence time, not retroactively.';

create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.user_preferences enable row level security;

revoke all on table public.user_preferences from anon, authenticated;
