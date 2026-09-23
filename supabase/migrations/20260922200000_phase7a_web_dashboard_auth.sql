-- Phase 7A: web dashboard authentication and account linking.
-- Adds auth_links bridging table, magic-link token tracking,
-- and web-specific RPCs for dashboard queries.
--
-- Security posture:
-- 1. All tables retain zero client grants and RLS enabled.
-- 2. Web queries run through SECURITY DEFINER web_* RPCs granted to authenticated.
-- 3. Ingestion and operational RPCs remain service-role only.

-- --- Auth link tokens (magic link nonces) ------------------------------------

create table public.auth_link_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  nonce text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.auth_link_tokens is
  'Single-use magic-link tokens for Telegram → web dashboard account linking. '
  'Contains only internal UUIDs and opaque nonces — no Telegram identity or content.';

create index auth_link_tokens_nonce_idx on public.auth_link_tokens (nonce)
  where used_at is null;

alter table public.auth_link_tokens enable row level security;
revoke all on table public.auth_link_tokens from anon, authenticated;
revoke all on table public.auth_link_tokens from public, service_role;

-- --- Auth links (Supabase Auth ↔ internal user) ------------------------------

create table public.auth_links (
  auth_user_id uuid not null unique,
  user_id uuid not null unique references public.users (id) on delete cascade,
  linked_at timestamptz not null default now(),
  primary key (auth_user_id)
);

comment on table public.auth_links is
  'One-to-one bridge between auth.users and public.users. '
  'A browser session resolves to an internal user through this table.';

alter table public.auth_links enable row level security;
revoke all on table public.auth_links from anon, authenticated;
revoke all on table public.auth_links from public, service_role;

-- --- Helper: resolve auth.uid() → internal user_id --------------------------

create or replace function public.get_linked_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select al.user_id
    from public.auth_links as al
   where al.auth_user_id = auth.uid()
   limit 1;
$$;

revoke all on function public.get_linked_user_id() from public, anon, authenticated;
grant execute on function public.get_linked_user_id() to service_role, authenticated;

-- --- Web-specific RPCs -------------------------------------------------------

-- List notes for the authenticated web user.
create or replace function public.web_list_notes(
  p_offset integer default 0,
  p_limit integer default 20,
  p_saved_only boolean default false
)
returns table (
  id uuid,
  title text,
  source_type text,
  language text,
  is_saved boolean,
  created_at timestamptz,
  updated_at timestamptz,
  tags text[],
  template_key text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.get_linked_user_id();
  if v_user_id is null then
    return;
  end if;

  return query
    select
      n.id,
      n.title,
      n.source_type::text,
      n.language,
      n.is_saved,
      n.created_at,
      n.updated_at,
      coalesce(
        (select array_agg(t.value::text)
         from jsonb_array_elements_text(
           (select no.content_json -> 'tags'
              from public.note_outputs as no
             where no.id = n.current_output_id)
         ) as t(value)),
        '{}'::text[]
      ) as tags,
      coalesce(
        (select no.template_key
           from public.note_outputs as no
          where no.id = n.current_output_id),
        'summary'
      ) as template_key
    from public.notes as n
    where n.user_id = v_user_id
      and n.deleted_at is null
      and (not p_saved_only or n.is_saved = true)
    order by n.updated_at desc
    offset p_offset
    limit p_limit;
end;
$$;

revoke all on function public.web_list_notes(integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.web_list_notes(integer, integer, boolean) to service_role, authenticated;

-- Get a single note with its current output for the authenticated user.
create or replace function public.web_get_note(p_note_id uuid)
returns table (
  id uuid,
  title text,
  source_type text,
  language text,
  is_saved boolean,
  created_at timestamptz,
  updated_at timestamptz,
  tags text[],
  template_key text,
  output_id uuid,
  output_content_json jsonb,
  output_rendered_text text,
  output_template_key text,
  output_provider text,
  output_model text,
  output_generation_reason text,
  output_created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.get_linked_user_id();
  if v_user_id is null then
    return;
  end if;

  return query
    select
      n.id,
      n.title,
      n.source_type::text,
      n.language,
      n.is_saved,
      n.created_at,
      n.updated_at,
      coalesce(
        (select array_agg(t.value::text)
         from jsonb_array_elements_text(no.content_json -> 'tags') as t(value)),
        '{}'::text[]
      ) as tags,
      coalesce(no.template_key, 'summary') as template_key,
      no.id as output_id,
      no.content_json as output_content_json,
      no.rendered_text as output_rendered_text,
      no.template_key as output_template_key,
      no.provider as output_provider,
      no.model as output_model,
      no.generation_reason::text as output_generation_reason,
      no.created_at as output_created_at
    from public.notes as n
    left join public.note_outputs as no on no.id = n.current_output_id
    where n.id = p_note_id
      and n.user_id = v_user_id
      and n.deleted_at is null;
end;
$$;

revoke all on function public.web_get_note(uuid) from public, anon, authenticated;
grant execute on function public.web_get_note(uuid) to service_role, authenticated;

-- Search notes for the authenticated web user.
create or replace function public.web_search_notes(
  p_query text,
  p_limit integer default 10
)
returns table (
  id uuid,
  title text,
  source_type text,
  language text,
  is_saved boolean,
  created_at timestamptz,
  updated_at timestamptz,
  tags text[],
  template_key text,
  rank real
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_tsquery tsquery;
begin
  v_user_id := public.get_linked_user_id();
  if v_user_id is null then
    return;
  end if;

  v_tsquery := websearch_to_tsquery('english', p_query);

  return query
    select
      n.id,
      n.title,
      n.source_type::text,
      n.language,
      n.is_saved,
      n.created_at,
      n.updated_at,
      coalesce(
        (select array_agg(t.value::text)
         from jsonb_array_elements_text(
           (select no2.content_json -> 'tags'
              from public.note_outputs as no2
             where no2.id = n.current_output_id)
         ) as t(value)),
        '{}'::text[]
      ) as tags,
      coalesce(
        (select no3.template_key
           from public.note_outputs as no3
          where no3.id = n.current_output_id),
        'summary'
      ) as template_key,
      ts_rank(n.search_vector, v_tsquery) as rank
    from public.notes as n
    where n.user_id = v_user_id
      and n.deleted_at is null
      and n.is_saved = true
      and n.search_vector @@ v_tsquery
    order by rank desc, n.updated_at desc
    limit least(p_limit, 50);
end;
$$;

revoke all on function public.web_search_notes(text, integer) from public, anon, authenticated;
grant execute on function public.web_search_notes(text, integer) to service_role, authenticated;

-- Get usage summary for the authenticated web user.
create or replace function public.web_get_usage_summary()
returns table (
  plan_key text,
  plan_display_name text,
  period_start timestamptz,
  period_end timestamptz,
  metric text,
  display_name text,
  used bigint,
  monthly_limit bigint,
  reserved bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_plan_key text;
  v_plan_display text;
  v_period_start timestamptz;
  v_period_end timestamptz;
begin
  v_user_id := public.get_linked_user_id();
  if v_user_id is null then
    return;
  end if;

  select u.plan_key into v_plan_key
    from public.users as u
   where u.id = v_user_id;

  select p.display_name into v_plan_display
    from public.plans as p
   where p.plan_key = v_plan_key;

  v_period_start := date_trunc('month', now() at time zone 'UTC');
  v_period_end := v_period_start + interval '1 month';

  return query
    select
      v_plan_key as plan_key,
      coalesce(v_plan_display, v_plan_key) as plan_display_name,
      v_period_start as period_start,
      v_period_end as period_end,
      pa.metric::text as metric,
      case pa.metric::text
        when 'new_note' then 'New Notes'
        when 'regeneration' then 'Regenerations'
        when 'semantic_answer' then 'Ask Notes'
        else pa.metric::text
      end as display_name,
      coalesce(qb.consumed, 0)::bigint as used,
      pa.monthly_limit::bigint as monthly_limit,
      coalesce(
        (select count(*)
         from public.quota_reservations as qr
         where qr.user_id = v_user_id
           and qr.metric = pa.metric
           and qr.period_start = v_period_start
           and qr.consumed_at is null
           and qr.released_at is null
           and qr.created_at > now() - interval '20 minutes'),
        0
      )::bigint as reserved
    from public.plan_allowances as pa
    left join public.quota_buckets as qb
      on qb.user_id = v_user_id
     and qb.metric = pa.metric
     and qb.period_start = v_period_start
    where pa.plan_key = v_plan_key;
end;
$$;

revoke all on function public.web_get_usage_summary() from public, anon, authenticated;
grant execute on function public.web_get_usage_summary() to service_role, authenticated;

-- Get user profile for the dashboard.
create or replace function public.web_get_profile()
returns table (
  display_name text,
  plan_key text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.get_linked_user_id();
  if v_user_id is null then
    return;
  end if;

  return query
    select u.display_name, u.plan_key, u.created_at
      from public.users as u
     where u.id = v_user_id;
end;
$$;

revoke all on function public.web_get_profile() from public, anon, authenticated;
grant execute on function public.web_get_profile() to service_role, authenticated;

-- Get user preferences for the dashboard.
create or replace function public.web_get_preferences()
returns table (
  output_language text,
  privacy_mode text,
  default_text_template text,
  default_voice_template text,
  default_document_template text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.get_linked_user_id();
  if v_user_id is null then
    return;
  end if;

  return query
    select
      up.output_language::text,
      up.privacy_mode::text,
      up.default_text_template,
      up.default_voice_template,
      up.default_document_template
    from public.user_preferences as up
    where up.user_id = v_user_id;
end;
$$;

revoke all on function public.web_get_preferences() from public, anon, authenticated;
grant execute on function public.web_get_preferences() to service_role, authenticated;

-- --- Consume magic-link token ------------------------------------------------

create or replace function public.consume_auth_link_token(p_nonce text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.auth_link_tokens%rowtype;
begin
  select * into v_token
    from public.auth_link_tokens
   where nonce = p_nonce
     and used_at is null
     and expires_at > now()
   for update skip locked;

  if not found then
    return null;
  end if;

  update public.auth_link_tokens
     set used_at = now()
   where id = v_token.id;

  return v_token.user_id;
end;
$$;

revoke all on function public.consume_auth_link_token(text) from public, anon, authenticated;
grant execute on function public.consume_auth_link_token(text) to service_role;

-- --- Create or retrieve auth link --------------------------------------------

create or replace function public.upsert_auth_link(
  p_auth_user_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.auth_links (auth_user_id, user_id)
  values (p_auth_user_id, p_user_id)
  on conflict (user_id) do update
    set auth_user_id = excluded.auth_user_id,
        linked_at = now();
end;
$$;

revoke all on function public.upsert_auth_link(uuid, uuid) from public, anon, authenticated;
grant execute on function public.upsert_auth_link(uuid, uuid) to service_role;

-- --- Create magic-link token -------------------------------------------------

create or replace function public.create_auth_link_token(
  p_user_id uuid,
  p_nonce text,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.auth_link_tokens (user_id, nonce, expires_at)
  values (p_user_id, p_nonce, p_expires_at);
end;
$$;

revoke all on function public.create_auth_link_token(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.create_auth_link_token(uuid, text, timestamptz) to service_role;
