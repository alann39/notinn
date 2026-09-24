-- Fix admin job actions (cancel, requeue) and correct default Gemini model
--
-- 1. cancel_processing_job:
--    Ensure completed_at is populated when transitioning to CANCELLED,
--    satisfying processing_jobs_terminal_state_has_completed_at check constraint.
--
-- 2. requeue_processing_job:
--    Fix casting bug with enum array in condition.
--    Add optional p_allow_no_note boolean to allow intentional admin/operator
--    requeues of failed jobs whose note_id has not yet been generated.
--    Ensure completed_at is reset to null upon transition to QUEUED.
--
-- 3. admin_requeue_job:
--    Allow confirmed admins to requeue failed jobs even if note_id is null.
--
-- 4. system_provider_keys:
--    Correct invalid model 'gemini-2.5-flash' to production standard 'gemini-3.8-flash'.

-- ── 1. Fix cancel_processing_job() ─────────────────────────────────────────

create or replace function public.cancel_processing_job(
  p_job_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.processing_jobs%rowtype;
begin
  select j.* into v_job
    from public.processing_jobs as j
   where j.id = p_job_id
   for update;

  if not found then
    return 'not_found';
  end if;

  if v_job.state::text = 'CANCELLED' then
    return 'already_terminal';
  end if;

  update public.processing_jobs
     set state = 'CANCELLED'::public.job_state,
         completed_at = coalesce(completed_at, now())
   where id = p_job_id;

  return 'cancelled';
end;
$$;

revoke all on function public.cancel_processing_job(uuid) from public, anon, authenticated;
grant execute on function public.cancel_processing_job(uuid) to service_role;

-- ── 2. Fix requeue_processing_job() ────────────────────────────────────────

drop function if exists public.requeue_processing_job(uuid);

create or replace function public.requeue_processing_job(
  p_job_id uuid,
  p_allow_no_note boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.processing_jobs%rowtype;
begin
  select j.* into v_job
    from public.processing_jobs as j
   where j.id = p_job_id
   for update;

  if not found then
    return 'not_found';
  end if;

  if v_job.state::text = any (array['COMPLETED', 'FAILED', 'REJECTED', 'EXPIRED', 'CANCELLED']) then
    return 'terminal';
  end if;

  if v_job.note_id is null and not coalesce(p_allow_no_note, false) then
    return 'no_note_yet';
  end if;

  update public.processing_jobs
     set state = 'QUEUED'::public.job_state,
         attempt_count = 0,
         last_error_code = null,
         last_error_detail = null,
         next_attempt_at = null,
         started_at = null,
         completed_at = null
   where id = p_job_id;

  return 'requeued';
end;
$$;

revoke all on function public.requeue_processing_job(uuid, boolean) from public, anon, authenticated;
grant execute on function public.requeue_processing_job(uuid, boolean) to service_role;

-- ── 3. Update admin_requeue_job() ──────────────────────────────────────────

create or replace function public.admin_requeue_job(
  p_job_id uuid
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

  return public.requeue_processing_job(p_job_id, true);
end;
$$;

revoke all on function public.admin_requeue_job(uuid) from public, anon, authenticated;
grant execute on function public.admin_requeue_job(uuid) to service_role, authenticated;

-- ── 4. Update admin_cancel_job() ───────────────────────────────────────────

create or replace function public.admin_cancel_job(
  p_job_id uuid
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

  return public.cancel_processing_job(p_job_id);
end;
$$;

revoke all on function public.admin_cancel_job(uuid) from public, anon, authenticated;
grant execute on function public.admin_cancel_job(uuid) to service_role, authenticated;

-- ── 5. Fix Gemini model selection and vault bootstrap ───────────────────────

update public.system_provider_keys
   set selected_model = 'gemini-3.8-flash'
 where provider = 'gemini'
   and selected_model in ('gemini-2.5-flash', 'gemini-2.5-flash-lite');

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

  v_secret_id := vault.create_secret(v_key);

  insert into public.system_provider_keys (
    provider, vault_secret_id, is_active,
    selected_model, test_status, test_latency_ms, test_error, updated_at
  ) values (
    p_provider, v_secret_id, true,
    case when p_provider = 'gemini' then 'gemini-3.8-flash' else 'openrouter/free' end,
    p_test_status, p_latency_ms, p_test_error, now()
  )
  on conflict (provider) do update set
    vault_secret_id = excluded.vault_secret_id,
    is_active = true,
    selected_model = coalesce(
      case
        when system_provider_keys.selected_model in ('gemini-2.5-flash', 'gemini-2.5-flash-lite')
          then 'gemini-3.8-flash'
        else system_provider_keys.selected_model
      end,
      excluded.selected_model
    ),
    test_status = excluded.test_status,
    test_latency_ms = excluded.test_latency_ms,
    test_error = excluded.test_error,
    updated_at = now();

  return 'saved';
end;
$$;

revoke all on function public.admin_set_provider_key(text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.admin_set_provider_key(text, text, text, integer, text) to service_role, authenticated;
