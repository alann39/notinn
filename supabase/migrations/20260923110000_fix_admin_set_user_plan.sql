-- Fix admin_set_user_plan to pass 'operator' as changed_by to satisfy
-- the plan_changes_changed_by check constraint ('operator', 'user_request', 'system').

create or replace function public.admin_set_user_plan(
  p_user_id uuid,
  p_plan_key text
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

  return public.change_user_plan(p_user_id, p_plan_key, 'operator', 'Updated via Admin Console');
end;
$$;

revoke all on function public.admin_set_user_plan(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_user_plan(uuid, text) to service_role, authenticated;
