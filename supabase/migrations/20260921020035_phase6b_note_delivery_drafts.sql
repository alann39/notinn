-- Phase 6B: clean Telegram delivery surfaces and approval-gated note edits.
--
-- A note may be rendered across several Telegram messages because one message is
-- capped at 4,096 characters. Delivery groups retain only opaque Telegram message
-- identifiers, never note content. Edit drafts point at append-only note_outputs;
-- the note's current_output_id moves only when the owner explicitly applies one.

create table public.note_deliveries (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete cascade,
  chat_id bigint not null,
  message_ids bigint[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint note_deliveries_message_count check (
    cardinality(message_ids) between 1 and 100
  ),
  constraint note_deliveries_message_ids_positive check (0 < all (message_ids)),
  constraint note_deliveries_message_ids_non_null check (
    array_position(message_ids, null) is null
  )
);

comment on table public.note_deliveries is
  'Owner-resolved Telegram delivery groups for a note. Contains chat/message identifiers only, never note content.';

create index note_deliveries_note_created_idx
  on public.note_deliveries (note_id, created_at desc);

create trigger note_deliveries_set_updated_at
  before update on public.note_deliveries
  for each row
  execute function public.set_updated_at();

create table public.note_edit_drafts (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete cascade,
  base_output_id uuid not null,
  draft_output_id uuid,
  request_update_id bigint not null,
  target_template_key text not null references public.templates (key),
  generation_reason public.generation_reason not null,
  status text not null default 'generating',
  expires_at timestamptz not null default (now() + interval '20 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint note_edit_drafts_one_active_per_note unique (note_id),
  constraint note_edit_drafts_request_update_key unique (request_update_id),
  constraint note_edit_drafts_status_check check (status in ('generating', 'ready')),
  constraint note_edit_drafts_reason_check check (
    generation_reason in ('regenerate', 'shorter', 'detailed', 'custom')
  ),
  constraint note_edit_drafts_ready_output_check check (
    (status = 'generating' and draft_output_id is null) or
    (status = 'ready' and draft_output_id is not null)
  ),
  constraint note_edit_drafts_base_output_fkey
    foreign key (base_output_id, note_id)
    references public.note_outputs (id, note_id),
  constraint note_edit_drafts_draft_output_fkey
    foreign key (draft_output_id, note_id)
    references public.note_outputs (id, note_id)
);

comment on table public.note_edit_drafts is
  'One expiring owner-approved edit preview per note. Outputs stay append-only and are not current until Apply.';

create index note_edit_drafts_base_output_idx
  on public.note_edit_drafts (base_output_id);
create index note_edit_drafts_draft_output_idx
  on public.note_edit_drafts (draft_output_id)
  where draft_output_id is not null;
create index note_edit_drafts_template_idx
  on public.note_edit_drafts (target_template_key);
create index note_edit_drafts_expires_idx
  on public.note_edit_drafts (expires_at);

create trigger note_edit_drafts_set_updated_at
  before update on public.note_edit_drafts
  for each row
  execute function public.set_updated_at();

-- Register a completed Telegram delivery only after every page was delivered.
create or replace function public.register_note_delivery(
  p_user_id uuid,
  p_note_id uuid,
  p_chat_id bigint,
  p_message_ids bigint[]
)
returns table (outcome text, delivery_id uuid, note_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_delivery_id uuid;
begin
  if cardinality(p_message_ids) not between 1 and 100 or
     array_position(p_message_ids, null) is not null or
     not (0 < all (p_message_ids)) then
    raise exception 'invalid Telegram delivery message identifiers'
      using errcode = '22023';
  end if;

  perform 1
    from public.notes as note
   where note.id = p_note_id
     and note.user_id = p_user_id
     and note.deleted_at is null;

  if not found then
    return query select 'not_found'::text, null::uuid, null::uuid;
    return;
  end if;

  insert into public.note_deliveries (note_id, chat_id, message_ids)
  values (p_note_id, p_chat_id, p_message_ids)
  returning id into v_delivery_id;

  return query select 'created'::text, v_delivery_id, p_note_id;
end;
$$;

-- Resolve only a group that contains the exact button-bearing message.
create or replace function public.find_note_delivery(
  p_user_id uuid,
  p_note_id uuid,
  p_chat_id bigint,
  p_message_id bigint
)
returns table (delivery_id uuid, note_id uuid, chat_id bigint, message_ids bigint[])
language sql
stable
security definer
set search_path = ''
as $$
  select delivery.id, delivery.note_id, delivery.chat_id, delivery.message_ids
    from public.note_deliveries as delivery
    join public.notes as note on note.id = delivery.note_id
   where delivery.note_id = p_note_id
     and note.user_id = p_user_id
     and note.deleted_at is null
     and delivery.chat_id = p_chat_id
     and p_message_id = any (delivery.message_ids)
   order by delivery.created_at desc
   limit 1;
$$;

create or replace function public.list_note_deliveries(
  p_user_id uuid,
  p_note_id uuid
)
returns table (delivery_id uuid, chat_id bigint, message_ids bigint[])
language sql
stable
security definer
set search_path = ''
as $$
  select delivery.id, delivery.chat_id, delivery.message_ids
    from public.note_deliveries as delivery
    join public.notes as note on note.id = delivery.note_id
   where delivery.note_id = p_note_id
     and note.user_id = p_user_id
     and note.deleted_at is null
   order by delivery.created_at;
$$;

create or replace function public.replace_note_delivery_messages(
  p_user_id uuid,
  p_delivery_id uuid,
  p_message_ids bigint[]
)
returns table (outcome text, delivery_id uuid, note_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_note_id uuid;
begin
  if cardinality(p_message_ids) not between 1 and 100 or
     array_position(p_message_ids, null) is not null or
     not (0 < all (p_message_ids)) then
    raise exception 'invalid Telegram delivery message identifiers'
      using errcode = '22023';
  end if;

  update public.note_deliveries as delivery
     set message_ids = p_message_ids
    from public.notes as note
   where delivery.id = p_delivery_id
     and note.id = delivery.note_id
     and note.user_id = p_user_id
     and note.deleted_at is null
  returning delivery.note_id into v_note_id;

  if not found then
    return query select 'not_found'::text, null::uuid, null::uuid;
    return;
  end if;

  return query select 'updated'::text, p_delivery_id, v_note_id;
end;
$$;

-- Claim the one generation slot for a note before quota or provider work.
create or replace function public.begin_note_edit_draft(
  p_user_id uuid,
  p_note_id uuid,
  p_request_update_id bigint,
  p_target_template_key text,
  p_generation_reason public.generation_reason
)
returns table (outcome text, draft_id uuid, note_id uuid, base_output_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_note public.notes%rowtype;
  v_draft_id uuid;
begin
  select note.*
    into v_note
    from public.notes as note
   where note.id = p_note_id
     and note.user_id = p_user_id
     and note.deleted_at is null
   for update;

  if not found or v_note.current_output_id is null then
    return query select 'not_found'::text, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  if v_note.normalized_source_text is null then
    return query
      select 'source_unavailable'::text, null::uuid, p_note_id, v_note.current_output_id;
    return;
  end if;

  delete from public.note_edit_drafts as draft
   where draft.note_id = p_note_id
     and draft.expires_at <= now();

  if exists (
    select 1 from public.note_edit_drafts as draft where draft.note_id = p_note_id
  ) then
    return query select 'busy'::text, null::uuid, p_note_id, v_note.current_output_id;
    return;
  end if;

  insert into public.note_edit_drafts (
    note_id,
    base_output_id,
    request_update_id,
    target_template_key,
    generation_reason
  )
  values (
    p_note_id,
    v_note.current_output_id,
    p_request_update_id,
    p_target_template_key,
    p_generation_reason
  )
  returning id into v_draft_id;

  return query select 'created'::text, v_draft_id, p_note_id, v_note.current_output_id;
end;
$$;

create or replace function public.complete_note_edit_draft(
  p_user_id uuid,
  p_draft_id uuid,
  p_output_id uuid
)
returns table (outcome text, draft_id uuid, note_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_note_id uuid;
begin
  update public.note_edit_drafts as draft
     set draft_output_id = p_output_id,
         status = 'ready',
         expires_at = now() + interval '30 minutes'
    from public.notes as note
   where draft.id = p_draft_id
     and draft.status = 'generating'
     and note.id = draft.note_id
     and note.user_id = p_user_id
     and note.deleted_at is null
     and note.current_output_id = draft.base_output_id
     and exists (
       select 1
         from public.note_outputs as output
        where output.id = p_output_id
          and output.note_id = draft.note_id
     )
  returning draft.note_id into v_note_id;

  if not found then
    return query select 'not_found'::text, null::uuid, null::uuid;
    return;
  end if;

  return query select 'ready'::text, p_draft_id, v_note_id;
end;
$$;

create or replace function public.get_note_edit_draft(
  p_user_id uuid,
  p_draft_id uuid
)
returns table (
  draft_id uuid,
  note_id uuid,
  base_output_id uuid,
  draft_output_id uuid,
  base_content_json jsonb,
  draft_content_json jsonb,
  is_saved boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select draft.id,
         draft.note_id,
         draft.base_output_id,
         draft.draft_output_id,
         base.content_json,
         candidate.content_json,
         note.is_saved
    from public.note_edit_drafts as draft
    join public.notes as note on note.id = draft.note_id
    join public.note_outputs as base on base.id = draft.base_output_id
    join public.note_outputs as candidate on candidate.id = draft.draft_output_id
   where draft.id = p_draft_id
     and draft.status = 'ready'
     and draft.expires_at > now()
     and note.user_id = p_user_id
     and note.deleted_at is null
     and note.current_output_id = draft.base_output_id;
$$;

create or replace function public.apply_note_edit_draft(
  p_user_id uuid,
  p_draft_id uuid
)
returns table (outcome text, note_id uuid, output_id uuid, is_saved boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_note_id uuid;
  v_output_id uuid;
  v_is_saved boolean;
begin
  select draft.note_id, draft.draft_output_id, note.is_saved
    into v_note_id, v_output_id, v_is_saved
    from public.note_edit_drafts as draft
    join public.notes as note on note.id = draft.note_id
   where draft.id = p_draft_id
     and draft.status = 'ready'
     and draft.expires_at > now()
     and note.user_id = p_user_id
     and note.deleted_at is null
     and note.current_output_id = draft.base_output_id
   for update of note, draft;

  if not found or v_output_id is null then
    return query select 'not_found'::text, null::uuid, null::uuid, null::boolean;
    return;
  end if;

  update public.notes as note
     set current_output_id = v_output_id
   where note.id = v_note_id;

  delete from public.note_edit_drafts as draft where draft.id = p_draft_id;

  return query select 'applied'::text, v_note_id, v_output_id, v_is_saved;
end;
$$;

create or replace function public.discard_note_edit_draft(
  p_user_id uuid,
  p_draft_id uuid
)
returns table (outcome text, note_id uuid, is_saved boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_note_id uuid;
  v_is_saved boolean;
begin
  delete from public.note_edit_drafts as draft
    using public.notes as note
   where draft.id = p_draft_id
     and note.id = draft.note_id
     and note.user_id = p_user_id
     and note.deleted_at is null
  returning draft.note_id, note.is_saved into v_note_id, v_is_saved;

  if not found then
    return query select 'not_found'::text, null::uuid, null::boolean;
    return;
  end if;

  return query select 'discarded'::text, v_note_id, v_is_saved;
end;
$$;

-- Generation failures and delivery failures release the per-note edit slot.
create or replace function public.fail_note_edit_draft(
  p_user_id uuid,
  p_draft_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with removed as (
    delete from public.note_edit_drafts as draft
     using public.notes as note
     where draft.id = p_draft_id
       and note.id = draft.note_id
       and note.user_id = p_user_id
     returning 1
  )
  select exists (select 1 from removed);
$$;

alter table public.note_deliveries enable row level security;
alter table public.note_edit_drafts enable row level security;

revoke all on table public.note_deliveries from anon, authenticated;
revoke all on table public.note_edit_drafts from anon, authenticated;
revoke all on table public.note_deliveries, public.note_edit_drafts
  from public, service_role;

revoke all on function public.register_note_delivery(uuid, uuid, bigint, bigint[])
  from public, anon, authenticated;
revoke all on function public.find_note_delivery(uuid, uuid, bigint, bigint)
  from public, anon, authenticated;
revoke all on function public.list_note_deliveries(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.replace_note_delivery_messages(uuid, uuid, bigint[])
  from public, anon, authenticated;
revoke all on function public.begin_note_edit_draft(
  uuid, uuid, bigint, text, public.generation_reason
) from public, anon, authenticated;
revoke all on function public.complete_note_edit_draft(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.get_note_edit_draft(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.apply_note_edit_draft(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.discard_note_edit_draft(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.fail_note_edit_draft(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.register_note_delivery(uuid, uuid, bigint, bigint[])
  to service_role;
grant execute on function public.find_note_delivery(uuid, uuid, bigint, bigint)
  to service_role;
grant execute on function public.list_note_deliveries(uuid, uuid)
  to service_role;
grant execute on function public.replace_note_delivery_messages(uuid, uuid, bigint[])
  to service_role;
grant execute on function public.begin_note_edit_draft(
  uuid, uuid, bigint, text, public.generation_reason
) to service_role;
grant execute on function public.complete_note_edit_draft(uuid, uuid, uuid)
  to service_role;
grant execute on function public.get_note_edit_draft(uuid, uuid)
  to service_role;
grant execute on function public.apply_note_edit_draft(uuid, uuid)
  to service_role;
grant execute on function public.discard_note_edit_draft(uuid, uuid)
  to service_role;
grant execute on function public.fail_note_edit_draft(uuid, uuid)
  to service_role;
