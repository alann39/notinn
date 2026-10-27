-- Public note counter for the marketing landing page.
--
-- The landing page shows "N notes captured" in the hero. That number must be a
-- real count, never a placeholder, and an anonymous visitor cannot read
-- public.notes: RLS is enabled and anon/authenticated have all grants revoked
-- (see phase0_notes.sql). So the count is exposed through a single
-- SECURITY DEFINER function that returns one integer and nothing else.
--
-- Design constraints:
--
--   * Only an aggregate leaves the function. No row, no title, no user_id.
--   * Soft-deleted notes are excluded, matching what a signed-in user sees.
--   * No user scoping: this is a global product counter, which is the whole
--     point of the badge. It is intentionally not per-user data.
--   * `stable` + `security definer` + a pinned search_path so the function
--     cannot be redirected through a caller-controlled schema.
--   * The result is not cached, so it is accurate on every call. At this table
--     size the count is a cheap index-only scan; if it ever gets expensive,
--     replace the body with a materialized counter rather than caching here.

create or replace function public.get_public_note_count()
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(*)::bigint
  from public.notes
  where deleted_at is null;
$$;

comment on function public.get_public_note_count() is
  'Global count of non-deleted notes for the public landing page badge. Aggregate only: returns no rows and no per-user data.';

-- Supabase grants execute to PUBLIC by default on new functions, so revoke
-- first and then grant the two roles that need it. anon is deliberate: the
-- landing page is public.
revoke all on function public.get_public_note_count() from public;
grant execute on function public.get_public_note_count() to anon, authenticated, service_role;
