-- Fix requeue quota cleanup:
-- When a failed job whose note_id is null is requeued, delete prior quota reservations
-- and restore used units to the user's quota bucket. This prevents reservation key collisions
-- (e.g. 'job:<id>:attempt:0') and avoids charging users for failed attempts.

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
  v_consumed record;
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

  -- Clean up previous quota reservations for this uncompleted job and refund used units
  if v_job.note_id is null then
    for v_consumed in
      delete from public.quota_reservations
       where job_id = p_job_id
       returning user_id, metric, period_start, actual_units
    loop
      if v_consumed.actual_units is not null and v_consumed.actual_units > 0 then
        update public.quota_buckets
           set used_units = greatest(0, used_units - v_consumed.actual_units),
               updated_at = now()
         where user_id = v_consumed.user_id
           and metric = v_consumed.metric
           and period_start = v_consumed.period_start;
      end if;
    end loop;
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
