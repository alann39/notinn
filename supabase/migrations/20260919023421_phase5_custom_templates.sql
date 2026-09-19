-- Phase 5 / owner-scoped custom templates.
--
-- A custom template changes only the generation objective. Every template uses
-- Notinn's fixed structured-note JSON contract, and every read/write stays
-- owner-scoped inside SECURITY DEFINER functions.

alter table public.templates
  add column applicable_input_types public.input_type[] not null default array[
    'text', 'voice', 'audio', 'image', 'pdf', 'docx', 'txt', 'md'
  ]::public.input_type[];

alter table public.templates
  add constraint templates_instruction_not_blank check (length(btrim(instruction_text)) > 0),
  add constraint templates_instruction_length check (length(instruction_text) <= 2000),
  add constraint templates_applicable_input_types_not_empty check (
    cardinality(applicable_input_types) > 0
  );

comment on column public.templates.applicable_input_types is
  'Input types for which this template may be selected. Enforced again at generation time.';

create index templates_active_owner_idx
  on public.templates (owner_user_id, created_at)
  where owner_user_id is not null and status = 'active';

drop function public.find_template_for_generation(uuid, text);

create or replace function public.find_template_for_generation(
  p_user_id uuid,
  p_template_key text,
  p_input_type public.input_type
)
returns table (
  template_key text,
  template_name text,
  instruction_text text,
  schema_json jsonb
)
language sql
security definer
set search_path = ''
as $$
  select template.key, template.name, template.instruction_text, template.schema_json
    from public.templates as template
    join public.users as owner on owner.id = p_user_id and owner.status = 'active'
   where template.key = p_template_key
     and template.status = 'active'
     and p_input_type = any(template.applicable_input_types)
     and (template.owner_user_id is null or template.owner_user_id = p_user_id);
$$;

comment on function public.find_template_for_generation(uuid, text, public.input_type) is
  'Returns one active system or owned template when it supports the requested input type.';

create or replace function public.list_available_templates(
  p_user_id uuid,
  p_input_type public.input_type default null
)
returns table (
  template_key text,
  template_name text,
  is_custom boolean,
  applicable_input_types public.input_type[]
)
language sql
security definer
set search_path = ''
as $$
  select template.key,
         template.name,
         template.owner_user_id is not null,
         template.applicable_input_types
    from public.templates as template
    join public.users as owner on owner.id = p_user_id and owner.status = 'active'
   where template.status = 'active'
     and (template.owner_user_id is null or template.owner_user_id = p_user_id)
     and (p_input_type is null or p_input_type = any(template.applicable_input_types))
   order by template.owner_user_id is not null, template.created_at, template.key;
$$;

comment on function public.list_available_templates(uuid, public.input_type) is
  'Lists active system templates plus active custom templates owned by one active user.';

create or replace function public.create_custom_template(
  p_user_id uuid,
  p_name text,
  p_instruction_text text,
  p_input_types public.input_type[]
)
returns table (
  template_key text,
  template_name text,
  is_custom boolean,
  applicable_input_types public.input_type[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_schema jsonb;
  v_input_types public.input_type[];
begin
  if not exists (
    select 1 from public.users as u where u.id = p_user_id and u.status = 'active'
  ) then
    return;
  end if;

  if length(btrim(p_name)) = 0 or length(p_name) > 80 then
    raise exception using errcode = '22023', message = 'invalid template name';
  end if;
  if length(btrim(p_instruction_text)) = 0 or length(p_instruction_text) > 2000 then
    raise exception using errcode = '22023', message = 'invalid template instruction';
  end if;

  select array_agg(distinct item order by item)
    into v_input_types
    from unnest(p_input_types) as item;
  if coalesce(cardinality(v_input_types), 0) = 0 then
    raise exception using errcode = '22023', message = 'template needs an input type';
  end if;

  -- Serialise the quota check for this owner without locking unrelated users.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 519));
  if (
    select count(*)
      from public.templates as t
     where t.owner_user_id = p_user_id and t.status = 'active'
  ) >= 5 then
    raise exception using errcode = 'P0001', message = 'custom template limit reached';
  end if;

  select t.schema_json into v_schema
    from public.templates as t
   where t.key = 'clean_note' and t.owner_user_id is null and t.status = 'active';
  if v_schema is null then
    raise exception using errcode = '55000', message = 'structured note schema unavailable';
  end if;

  loop
    v_key := 'ct_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    exit when not exists (select 1 from public.templates as t where t.key = v_key);
  end loop;

  insert into public.templates (
    owner_user_id, key, name, description, schema_json, instruction_text,
    applicable_input_types
  ) values (
    p_user_id, v_key, btrim(p_name), 'Custom template', v_schema,
    btrim(p_instruction_text), v_input_types
  );

  return query select v_key, btrim(p_name), true, v_input_types;
end;
$$;

comment on function public.create_custom_template(uuid, text, text, public.input_type[]) is
  'Creates at most five active templates for one owner using the fixed structured-note schema.';

create or replace function public.archive_custom_template(
  p_user_id uuid,
  p_template_key text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
      from public.processing_jobs as job
     where job.user_id = p_user_id
       and job.template_key = p_template_key
       and job.state not in ('COMPLETED', 'FAILED', 'REJECTED', 'EXPIRED', 'CANCELLED')
  ) then
    return 'in_use';
  end if;

  update public.templates as template
     set status = 'archived'
   where template.owner_user_id = p_user_id
     and template.key = p_template_key
     and template.status = 'active';
  if not found then
    return 'not_found';
  end if;

  update public.user_preferences as preference
     set default_text_template = case
           when preference.default_text_template = p_template_key then null
           else preference.default_text_template
         end,
         default_voice_template = case
           when preference.default_voice_template = p_template_key then null
           else preference.default_voice_template
         end,
         default_document_template = case
           when preference.default_document_template = p_template_key then null
           else preference.default_document_template
         end
   where preference.user_id = p_user_id;

  return 'archived';
end;
$$;

comment on function public.archive_custom_template(uuid, text) is
  'Archives one owned custom template, unless a nonterminal job still references it.';

-- Preference changes validate both ownership and the input family selected by
-- the setting. This also prevents a caller from attaching a document-only
-- template to text messages by calling the RPC directly.
create or replace function public.update_user_preference(
  p_user_id uuid,
  p_setting text,
  p_value text
)
returns table (
  output_language text,
  default_text_template text,
  default_voice_template text,
  default_document_template text,
  privacy_mode public.privacy_mode
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template_key text;
  v_required_types public.input_type[];
begin
  if not exists (
    select 1 from public.users as u where u.id = p_user_id and u.status = 'active'
  ) then
    return;
  end if;

  if p_setting = 'language' then
    if p_value not in ('mirror', 'id', 'en') then
      raise exception using errcode = '22023', message = 'unsupported output language';
    end if;
    update public.user_preferences as p set output_language = p_value
     where p.user_id = p_user_id;
  elsif p_setting = 'privacy' then
    if p_value not in ('balanced', 'minimal') then
      raise exception using errcode = '22023', message = 'unsupported privacy mode';
    end if;
    update public.user_preferences as p set privacy_mode = p_value::public.privacy_mode
     where p.user_id = p_user_id;
  elsif p_setting in ('text_template', 'voice_template', 'document_template') then
    v_template_key := nullif(p_value, 'default');
    v_required_types := case p_setting
      when 'text_template' then array['text']::public.input_type[]
      when 'voice_template' then array['voice', 'audio']::public.input_type[]
      else array['image', 'pdf', 'docx', 'txt', 'md']::public.input_type[]
    end;
    if v_template_key is not null and not exists (
      select 1 from public.templates as t
       where t.key = v_template_key
         and t.status = 'active'
         and (t.owner_user_id is null or t.owner_user_id = p_user_id)
         and t.applicable_input_types && v_required_types
    ) then
      raise exception using errcode = '22023', message = 'template is not available';
    end if;

    update public.user_preferences as p
       set default_text_template = case when p_setting = 'text_template'
             then v_template_key else p.default_text_template end,
           default_voice_template = case when p_setting = 'voice_template'
             then v_template_key else p.default_voice_template end,
           default_document_template = case when p_setting = 'document_template'
             then v_template_key else p.default_document_template end
     where p.user_id = p_user_id;
  else
    raise exception using errcode = '22023', message = 'unsupported preference setting';
  end if;

  return query
  select p.output_language, p.default_text_template, p.default_voice_template,
         p.default_document_template, p.privacy_mode
    from public.user_preferences as p where p.user_id = p_user_id;
end;
$$;

-- Display reads include the immutable source type so keyboards can list only
-- formats applicable to that note.
drop function public.find_note_for_display(uuid, uuid);

create or replace function public.find_note_for_display(p_user_id uuid, p_note_id uuid)
returns table (
  note_id uuid,
  rendered_text text,
  content_json jsonb,
  template_key text,
  is_saved boolean,
  source_type public.input_type
)
language sql
security definer
set search_path = ''
as $$
  select note.id, output.rendered_text, output.content_json, output.template_key,
         note.is_saved, note.source_type
    from public.notes as note
    join public.note_outputs as output on output.id = note.current_output_id
   where note.id = p_note_id
     and note.user_id = p_user_id
     and note.deleted_at is null;
$$;

comment on function public.find_note_for_display(uuid, uuid) is
  'Returns an owned note current output, display state, and source type, or no rows.';

revoke all on function public.find_template_for_generation(uuid, text, public.input_type)
  from public, anon, authenticated;
revoke all on function public.list_available_templates(uuid, public.input_type)
  from public, anon, authenticated;
revoke all on function public.create_custom_template(uuid, text, text, public.input_type[])
  from public, anon, authenticated;
revoke all on function public.archive_custom_template(uuid, text)
  from public, anon, authenticated;
revoke all on function public.update_user_preference(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.find_note_for_display(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.find_template_for_generation(uuid, text, public.input_type)
  to service_role;
grant execute on function public.list_available_templates(uuid, public.input_type)
  to service_role;
grant execute on function public.create_custom_template(uuid, text, text, public.input_type[])
  to service_role;
grant execute on function public.archive_custom_template(uuid, text)
  to service_role;
grant execute on function public.update_user_preference(uuid, text, text)
  to service_role;
grant execute on function public.find_note_for_display(uuid, uuid)
  to service_role;
