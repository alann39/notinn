-- Correct Phase 7 admin bootstrap and move provider credentials into Supabase Vault.
-- Previously auto-seeded users are not an authorisation decision. Preserve the
-- explicitly confirmed development operator, then revoke every other implicit
-- grant. Future operators must still be added through the admin CLI.
update public.admin_users as a
   set created_by = 'migration_operator'
  from public.users as u
 where a.user_id = u.id
   and a.created_by = 'initial_seed'
   and lower(u.telegram_username) = 'iarchii';

delete from public.admin_users where created_by = 'initial_seed';

create schema if not exists vault;
create extension if not exists supabase_vault with schema vault;

alter table public.system_provider_keys add column if not exists vault_secret_id uuid;

do $$
declare
  v_row record;
begin
  for v_row in
    select provider, api_key from public.system_provider_keys
    where api_key is not null and api_key <> 'configured_via_env'
  loop
    update public.system_provider_keys
       set vault_secret_id = vault.create_secret(v_row.api_key)
     where provider = v_row.provider;
  end loop;
end;
$$;

alter table public.system_provider_keys drop column api_key;

-- Preserve the previous free-router fallback unless an operator explicitly
-- selects a different model later.
update public.system_provider_keys
   set selected_model = 'openrouter/free'
 where provider = 'openrouter' and selected_model = 'openrouter/auto';

create or replace function public.admin_set_provider_key(
  p_provider text,
  p_api_key text,
  p_test_status text default 'untested',
  p_latency_ms integer default null,
  p_test_error text default null
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_key text := trim(p_api_key);
  v_secret_id uuid;
begin
  if not public.is_current_user_admin() then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  if p_provider not in ('gemini', 'openrouter') or length(v_key) < 8
     or length(v_key) > 4096 then
    raise exception 'Invalid provider or API key' using errcode = '22023';
  end if;

  select vault_secret_id into v_secret_id from public.system_provider_keys
   where provider = p_provider for update;
  if v_secret_id is null then
    v_secret_id := vault.create_secret(v_key);
  else
    perform vault.update_secret(v_secret_id, v_key);
  end if;

  insert into public.system_provider_keys (
    provider, vault_secret_id, key_hint, is_active, selected_model,
    last_tested_at, last_test_status, last_test_latency_ms, last_test_error, updated_at
  ) values (
    p_provider, v_secret_id,
    left(v_key, 6) || '…' || right(v_key, 4), true,
    case when p_provider = 'gemini' then 'gemini-2.5-flash' else 'openrouter/free' end,
    case when p_test_status in ('healthy', 'unhealthy') then now() end,
    case when p_test_status in ('healthy', 'unhealthy') then p_test_status else 'untested' end,
    p_latency_ms, left(p_test_error, 500), now()
  ) on conflict (provider) do update set
    vault_secret_id = excluded.vault_secret_id,
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
revoke all on function public.admin_set_provider_key(text, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_provider_key(text, text, text, integer, text)
  to service_role, authenticated;

-- Only trusted server code with a service key may read decrypted provider keys.
create function public.get_provider_runtime_config()
returns table (provider text, api_key text, selected_model text, is_active boolean)
language sql stable security definer set search_path = '' as $$
  select k.provider, s.decrypted_secret, k.selected_model, k.is_active
    from public.system_provider_keys k
    left join vault.decrypted_secrets s on s.id = k.vault_secret_id;
$$;
revoke all on function public.get_provider_runtime_config() from public, anon, authenticated;
grant execute on function public.get_provider_runtime_config() to service_role;
