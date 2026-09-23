-- Phase 7E: Admin Provider Model Selection
-- Allows administrators to configure active models for Gemini and OpenRouter.

alter table public.system_provider_keys
  add column if not exists selected_model text;

-- Set sensible defaults for existing rows
update public.system_provider_keys
   set selected_model = 'gemini-2.5-flash'
 where provider = 'gemini' and (selected_model is null or selected_model = '');

update public.system_provider_keys
   set selected_model = 'openrouter/auto'
 where provider = 'openrouter' and (selected_model is null or selected_model = '');

-- --- 1. RPC: List provider keys with selected_model --------------------------

drop function if exists public.admin_list_provider_keys();

create or replace function public.admin_list_provider_keys()
returns table (
  provider text,
  key_hint text,
  is_active boolean,
  selected_model text,
  last_tested_at timestamptz,
  last_test_status text,
  last_test_latency_ms integer,
  last_test_error text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'Access denied: caller is not an admin' using errcode = '42501';
  end if;

  return query
    select
      k.provider,
      k.key_hint,
      k.is_active,
      coalesce(k.selected_model, case when k.provider = 'gemini' then 'gemini-2.5-flash' else 'openrouter/auto' end) as selected_model,
      k.last_tested_at,
      k.last_test_status,
      k.last_test_latency_ms,
      k.last_test_error,
      k.updated_at
    from public.system_provider_keys as k
    order by case when k.provider = 'gemini' then 1 else 2 end;
end;
$$;

revoke all on function public.admin_list_provider_keys() from public, anon, authenticated;
grant execute on function public.admin_list_provider_keys() to service_role, authenticated;

-- --- 2. RPC: Set provider active model ---------------------------------------

create or replace function public.admin_set_provider_model(
  p_provider text,
  p_model text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clean_model text;
begin
  if not public.is_current_user_admin() then
    raise exception 'Access denied: caller is not an admin' using errcode = '42501';
  end if;

  if p_provider not in ('gemini', 'openrouter') then
    raise exception 'Invalid provider' using errcode = '22023';
  end if;

  v_clean_model := trim(p_model);
  if length(v_clean_model) < 2 then
    raise exception 'Model name is too short' using errcode = '22023';
  end if;

  update public.system_provider_keys
     set selected_model = v_clean_model,
         updated_at = now()
   where provider = p_provider;

  return 'saved';
end;
$$;

revoke all on function public.admin_set_provider_model(text, text) from public, anon, authenticated;
grant execute on function public.admin_set_provider_model(text, text) to service_role, authenticated;
