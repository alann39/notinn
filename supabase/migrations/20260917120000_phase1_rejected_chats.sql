-- Phase 1 / migration 1 of 2
-- public.rejected_chats and the once-per-chat reply guard.
--
-- Blueprint 16.4 requires groups and channels to be "rejected with a fixed
-- response". Phase 0 ignored them silently, because it had no outbound messaging
-- at all, and recorded the deviation in docs/ADR/0001-blueprint-deviations.md §3.
-- That ADR scheduled the reply for Phase 1 and made it **once per chat** rather
-- than once per message, so that a bot with nothing to do with a group does not
-- post into it repeatedly. This table is that guard.
--
-- Why a table rather than a column on something that already exists.
-- telegram_updates is keyed by update_id, which is one row per message; its
-- primary key cannot answer "has this chat already been told". The unit of the
-- decision is the chat, so the chat is the key.
--
-- Retention is 30 days, enforced by the cleanup function scheduled for a later
-- phase. The number is written here rather than mirrored as a constant, because
-- nothing in Phase 1 reads it: the purge is a scheduled SQL job and will carry
-- its own interval. A constant no code consumes is a claim about the future, not
-- a value, and Phase 0 already accumulated one of those. The cost of a purge is
-- bounded by design: deleting a row re-arms the reply, so the worst case is one
-- extra polite refusal per chat per window.

create table public.rejected_chats (
  -- Telegram chat id. Negative for groups, supergroups and channels, which is
  -- why this is a bigint and not an integer.
  chat_id bigint primary key,

  -- When this chat was first seen. The retention anchor: rows older than the
  -- window are purged.
  first_seen_at timestamptz not null default now(),

  -- When the fixed response was sent. Non-null means the chat has been told, and
  -- is what makes the reply once-per-chat: see claim_rejected_chat_reply below.
  --
  -- The claim is taken *before* the send rather than after it. That ordering is
  -- deliberate. Claiming after a successful send would need a second call and a
  -- second round trip, and two concurrent messages from the same chat could both
  -- observe an unclaimed row and both reply — which is precisely the spam this
  -- table exists to prevent. Claiming first makes the failure mode "the group is
  -- not told" instead of "the group is told twice", and that failure is
  -- indistinguishable from Phase 0's behaviour, which blueprint 25 shipped.
  notified_at timestamptz
);

comment on table public.rejected_chats is
  'One row per non-private chat seen, used to send blueprint 16.4''s fixed refusal exactly once per chat. Purely a notification guard: it stores no message content, no user identity and no update id, and is never consulted to decide whether to process anything.';

comment on column public.rejected_chats.first_seen_at is
  'Retention anchor: rows older than 30 days are purged by a scheduled cleanup, which re-arms the reply for that chat.';

comment on column public.rejected_chats.notified_at is
  'Set when the reply slot is claimed, before sendMessage is attempted. A send that fails leaves the row claimed and the chat silent until the retention window closes. That is a known, bounded loss — see the header comment in 20260917120000_phase1_rejected_chats.sql.';

-- Makes the future purge a range scan rather than a sequential scan. The table
-- is small, but the purge runs on a schedule and the index costs almost nothing.
create index rejected_chats_first_seen_at_idx on public.rejected_chats (first_seen_at);

-- ---------------------------------------------------------------------------
-- claim_rejected_chat_reply
-- ---------------------------------------------------------------------------
--
-- Records a non-private chat if it has not been seen, and reports whether this
-- caller holds the once-per-chat reply slot.
--
-- Returns true for exactly one caller per chat per retention window, and false
-- for every other message the chat sends. The atomicity is the whole point:
-- checking "has this chat been told?" in TypeScript and then inserting would be
-- two round trips with a race between them, and the race decides whether a group
-- receives one refusal or several.

create or replace function public.claim_rejected_chat_reply(p_chat_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed boolean;
begin
  insert into public.rejected_chats (chat_id, notified_at)
  values (p_chat_id, now())
  on conflict (chat_id) do nothing;

  -- Set by the INSERT above: true when a row was inserted, false when the
  -- conflict clause skipped it. Exactly one concurrent caller can observe true,
  -- because the primary key on chat_id admits one row.
  v_claimed := found;

  return v_claimed;
end;
$$;

comment on function public.claim_rejected_chat_reply(bigint) is
  'Records a non-private chat and returns true only for the caller that should send the fixed response. At most one caller per chat per retention window receives true.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.rejected_chats enable row level security;

revoke all on table public.rejected_chats from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
--
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default, and Supabase
-- additionally grants it to anon and authenticated. A SECURITY DEFINER function
-- that writes on behalf of the server must not be reachable by an unauthenticated
-- caller, so EXECUTE is revoked from all three and granted only to service_role.
-- See docs/ADR/0005-access-model.md.

revoke all on function public.claim_rejected_chat_reply(bigint)
  from public, anon, authenticated;

grant execute on function public.claim_rejected_chat_reply(bigint)
  to service_role;
