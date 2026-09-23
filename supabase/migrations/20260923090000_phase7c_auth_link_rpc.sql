-- Phase 7C: Add get_auth_link RPC to allow dashboard-auth to safely lookup existing auth links.

create or replace function public.get_auth_link(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select al.auth_user_id
    from public.auth_links as al
   where al.user_id = p_user_id
   limit 1;
$$;

revoke all on function public.get_auth_link(uuid) from public, anon, authenticated;
grant execute on function public.get_auth_link(uuid) to service_role;
