# ADR 0019 — Web dashboard authentication and account linking

- Status: accepted
- Date: 2026-09-22

## Context

Phases 0 through 6E established a Telegram-only product. The sole identity is a
Telegram user ID mapped to an internal `users.id` UUID. There is no Supabase Auth
usage, no browser client, no RLS policies, and no table grants to `anon` or
`authenticated`. ADR 0005 documents this posture and names the conditions for
widening it.

Phase 7 introduces a **read-first web dashboard** that lets users view their notes,
search, see usage, and check settings through a browser. This requires a web
identity system, database access policies for authenticated browser sessions, and
a bridge between existing Telegram identities and Supabase Auth.

## Decision

### 1. Magic link via Telegram bot

The user sends `/web` in Telegram. The bot generates a time-limited,
single-use HMAC-signed token containing the internal `users.id` and a nonce. The
bot replies with a clickable link to the dashboard's auth callback page.

When the user clicks the link, the dashboard calls a `dashboard-auth` Edge
Function, which:

1. Validates the HMAC signature and expiry.
2. Marks the nonce as used (preventing replay).
3. Creates or retrieves a Supabase Auth user (`auth.users`) linked to the
   internal user via `auth_links`.
4. Returns `access_token` and `refresh_token` for the browser session.

The Telegram identity remains authoritative. The dashboard session is a
read-only view of data the Telegram bot creates.

### 2. Account linking table

`public.auth_links` maps `auth.users.id` one-to-one with `public.users.id`.
A Supabase Auth session resolves to an internal user through this table. A
helper function `get_linked_user_id()` centralises the lookup.

### 3. RLS policies for authenticated role

Tables that the dashboard reads gain `SELECT` policies for `authenticated`,
scoped through `get_linked_user_id()`. Tables that only the bot writes
(`telegram_updates`, `processing_jobs`, `plan_changes`) receive no new
policies; they remain service-role-only.

### 4. Web-specific RPCs

New `web_*` RPC functions serve the dashboard. They are `SECURITY DEFINER`,
pin `search_path = ''`, and resolve the caller via `auth.uid()` →
`auth_links`. They are granted to `authenticated` only — not to `anon`, and
not as replacements for the existing service-role RPCs the bot uses.

### 5. Token security

- `DASHBOARD_LINK_SECRET` is a new secret, distinct from all others.
- Tokens expire after 10 minutes.
- Tokens are single-use: a `used_at` timestamp on `auth_link_tokens` prevents
  replay.
- The token payload contains only the user UUID and a random nonce — no
  Telegram identity, no content.
- The Edge Function sets `verify_jwt = false` and validates its own token,
  following the same pattern as `telegram-webhook` and `process-job`.

### 6. Dashboard hosting

The dashboard is a Vite + React SPA deployed to Vercel. It uses
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (publishable, not secret).
The `anon` key can create sessions through the `dashboard-auth` Edge Function
but cannot read any table directly because `anon` has zero grants and zero
policies.

## Why

- **Magic link via bot** keeps Telegram as the identity anchor. No email,
  no password, no OAuth provider, no Telegram Login Widget. The user's existing
  relationship with the bot is the authentication factor.
- **Separate `auth_links` table** avoids adding nullable `auth_user_id` to
  `public.users`, which would change the table's shape for a feature that most
  Telegram-only users may never use.
- **`web_*` RPCs** keep the bot's service-role RPCs untouched. The dashboard
  has its own query interface with its own grants, so changes to one cannot
  break the other.

## Consequences

- ADR 0005 is amended. The `authenticated` role now has `SELECT` on tables
  the dashboard reads, plus `EXECUTE` on `web_*` RPCs. `anon` remains fully
  denied. The zero-policy posture on bot-only tables is preserved.
- A new secret (`DASHBOARD_LINK_SECRET`) must be configured in the Supabase
  project before the `/web` command works.
- A new non-secret (`DASHBOARD_URL`) must be configured so the bot knows where
  to send the user.
- The dashboard cannot create, edit, or delete notes in the first slice. Those
  actions require the bot's service-role RPCs and are not exposed to the
  `authenticated` role.
