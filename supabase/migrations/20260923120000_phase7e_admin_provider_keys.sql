-- Phase 7E: Admin AI Provider Key Management
-- Stores Google Gemini and OpenRouter API keys securely on the server.
-- Plaintext credentials NEVER leave the server: client RPCs only read masked hints and health metrics.

create table if not exists public.system_provider_keys (
  provider text primary key check (provider in ('gemini', 'openrouter')),
  api_key text not null,
  key_hint text not null,
  is_active boolean not null default true,
  last_tested_at timestamptz,
  last_test_status text check (last_test_status in ('healthy', 'unhealthy', 'untested')) default 'untested',
  last_test_latency_ms integer,
  last_test_error text,
  updated_at timestamptz not null default now()
);

alter table public.system_provider_keys enable row level security;
revoke all on table public.system_provider_keys from public, anon, authenticated;
grant select, insert, update, delete on table public.system_provider_keys to service_role;

-- Seed default rows if they don't exist
insert into public.system_provider_keys (provider, api_key, key_hint, is_active, last_test_status)
values
  ('gemini', 'configured_via_env', 'EnvVar…Default', true, 'untested'),
  ('openrouter', 'configured_via_env', 'EnvVar…Default', true, 'untested')
on conflict (provider) do nothing;

-- --- 1. RPC: List provider keys with masked hints (NO plaintext api_key) -------

create or replace function public.admin_list_provider_keys()
returns table (
  provider text,
  key_hint text,
  is_active boolean,
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

-- --- 2. RPC: Set provider key with masked hint and optional test result -------

create or replace function public.admin_set_provider_key(
  p_provider text,
  p_api_key text,
  p_test_status text default 'untested',
  p_latency_ms integer default null,
  p_test_error text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clean_key text;
  v_hint text;
  v_status text;
begin
  if not public.is_current_user_admin() then
    raise exception 'Access denied: caller is not an admin' using errcode = '42501';
  end if;

  if p_provider not in ('gemini', 'openrouter') then
    raise exception 'Invalid provider' using errcode = '22023';
  end if;

  v_clean_key := trim(p_api_key);
  if length(v_clean_key) < 8 then
    raise exception 'API key is too short' using errcode = '22023';
  end if;

  -- Compute safe masked hint: first 6 chars ... last 4 chars
  v_hint := substr(v_clean_key, 1, 6) || '…' || substr(v_clean_key, length(v_clean_key) - 3, 4);

  v_status := case
    when p_test_status in ('healthy', 'unhealthy') then p_test_status
    else 'untested'
  end;

  insert into public.system_provider_keys (
    provider, api_key, key_hint, is_active, last_tested_at, last_test_status, last_test_latency_ms, last_test_error, updated_at
  )
  values (
    p_provider,
    v_clean_key,
    v_hint,
    true,
    case when v_status != 'untested' then now() else null end,
    v_status,
    p_latency_ms,
    p_test_error,
    now()
  )
  on conflict (provider) do update
    set api_key = excluded.api_key,
        key_hint = excluded.key_hint,
        is_active = true,
        last_tested_at = excluded.last_tested_at,
        last_test_status = excluded.last_test_status,
        last_test_latency_ms = excluded.last_test_latency_ms,
        last_test_error = excluded.last_test_error,
        updated_at = now();

  return 'saved';
end;
$$;

revoke all on function public.admin_set_provider_key(text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.admin_set_provider_key(text, text, text, integer, text) to service_role, authenticated;

-- --- 3. RPC: Record test result for provider key ------------------------------

create or replace function public.admin_record_provider_test(
  p_provider text,
  p_status text,
  p_latency_ms integer,
  p_error text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'Access denied: caller is not an admin' using errcode = '42501';
  end if;

  if p_provider not in ('gemini', 'openrouter') then
    raise exception 'Invalid provider' using errcode = '22023';
  end if;

  update public.system_provider_keys
     set last_tested_at = now(),
         last_test_status = case when p_status = 'healthy' then 'healthy' else 'unhealthy' end,
         last_test_latency_ms = p_latency_ms,
         last_test_error = p_error,
         updated_at = now()
   where provider = p_provider;

  return 'recorded';
end;
$$;

revoke all on function public.admin_record_provider_test(text, text, integer, text) from public, anon, authenticated;
grant execute on function public.admin_record_provider_test(text, text, integer, text) to service_role, authenticated;
