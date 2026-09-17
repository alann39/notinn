# ADR 0005 — The access model

**Status:** Accepted, Phase 0
**Date:** 2026-09-16

## Context

Notinn holds users' notes, their Telegram identifiers, the text they sent, and
file identifiers that resolve — given the bot token — to their documents. There is
no end-user login and no browser client in Phase 0. The only caller is Telegram, by
way of one Edge Function, and the only identity that function uses is the service
role.

That is a narrow surface, and the risk is that it stays narrow only by accident. A
key gets added to a client bundle, a policy gets written to make a query work, an
endpoint gets exposed because it was convenient — and the access model quietly
becomes whatever the code happens to do.

This ADR fixes the posture before there is anything to expose, so that widening it
is a deliberate act with a document to point at.

## Decision

### 1. Row level security is enabled on every table, with no policies

All eight tables have `ENABLE ROW LEVEL SECURITY` and **zero policies**. The
contract test asserts both — that RLS is enabled, and that no `CREATE POLICY`
appears anywhere in the migration set.

The effect is deny-by-default for every role that is subject to RLS. A client-role
key (`anon`, `authenticated`) reading `users` gets no rows and no error — an empty
set, because a policy-less table with RLS on is not an error condition, it is a
table with nothing visible in it.

Policies arrive with the login system, and each one will be a deliberate
statement about who may see what. Writing them now would mean writing them for a
caller that does not exist.

### 2. No table is granted to a client role

`REVOKE ALL ON TABLE ... FROM anon, authenticated` on every table. RLS and grants
are two different gates and both are closed. Grants are revoked explicitly rather
than relied on being absent, because PostgreSQL's `PUBLIC` default grants are the
kind of thing that reappears after a `DROP`/`CREATE` in a later migration.

`tests/contract/migration-constants.test.ts` asserts no table grant names a client
role, so this cannot be undone by accident.

### 3. Every function pins `search_path`

Every function in the migration set declares `SET search_path = ''` and fully
qualifies what it references (`public.users`, not `users`).

Without this, a `SECURITY DEFINER` function is exploitable by `search_path`
manipulation: a caller who can create objects can shadow a table the function
references, and the function — running with the definer's rights — reads theirs
instead. Pinning `search_path` to empty and qualifying everything removes the
attack rather than mitigating it.

### 4. Every function is either `SECURITY DEFINER` or a trigger function

Two categories, and the distinction is the whole point:

- **`SECURITY DEFINER`** — `ensure_telegram_user`, `accept_telegram_update`. These
  are the RPC surface, and they need definer rights precisely _because_ RLS is on
  with no policies: they are the only way in.

- **Trigger functions** — `set_updated_at`, `enforce_processing_job_transition`,
  `protect_usage_event_immutability`. These run with the invoking user's rights
  and need no elevation, because the trigger machinery runs them at the moment a
  write the caller has already been authorised for is happening.

  A trigger function cannot be invoked directly by a client: `returns trigger`
  cannot be exposed as a PostgREST RPC, and PostgreSQL refuses to call one outside
  trigger context. That is a property of the return type rather than a control,
  which is exactly why it is not relied on — see point 5.

### 5. Trigger functions are explicitly revoked from client roles

PostgreSQL grants `EXECUTE` on a new function to `PUBLIC` by default. Left alone,
all three trigger functions carried that grant.

They were not reachable, and this is still revoked — because "not reachable today"
is a statement about three return types rather than about this schema's security
posture, and because a surface that exists by accident of a return type is not a
control:

```sql
revoke all on function public.set_updated_at() from public, anon, authenticated;
```

Revoking costs nothing operationally. **Firing a trigger does not check the
invoking role's `EXECUTE` privilege on the trigger function**, so the `BEFORE
UPDATE` triggers that use these are unaffected — which is the fact that makes this
free rather than a trade-off. `tests/contract/migration-constants.test.ts` asserts
the revoke is present on every trigger function and that it precedes any grant.

### 6. `SECURITY DEFINER` functions are granted to `service_role` only

`REVOKE ... FROM public, anon, authenticated` followed by
`GRANT EXECUTE ... TO service_role`. The contract test asserts both the absence of
a client-role grant and the presence of the service-role one, so a function cannot
end up unreachable as easily as it can end up over-exposed.

### 7. Supabase JWT verification is disabled for the webhook, deliberately

`supabase/config.toml`:

```toml
[functions.telegram-webhook]
verify_jwt = false
```

Edge Functions verify a JWT on every request by default. Telegram cannot present
one — it is not a Supabase client and has no way to obtain a token — so leaving
verification on would reject every genuine delivery with a `401` and the bot would
appear completely dead, with a symptom indistinguishable from a wrong secret.

Disabling it does not leave the endpoint unauthenticated. Requests are
authenticated by the secret Telegram echoes in
`X-Telegram-Bot-Api-Secret-Token`, compared in constant time
(`security/webhook-secret.ts`, SHA-256 then XOR over the digest) before any other
work — before the body is read, before the database is touched. A request with a
missing or wrong secret is refused with an empty `401` and produces zero database
calls, which is asserted for five variants in `tests/security/webhook-auth.test.ts`
and over the wire in `tests/e2e/webhook.test.ts`.

### 8. The service-role key never leaves the server

It is read by the Edge Function and by the development scripts. It is never sent
to Telegram, never placed in a response, never logged, and never committed.
`.gitignore` excludes `.env*` with an exception for `.env.example`, which contains
names and descriptions and no values. `scripts/verify-env.ts` reports the key's
**role and length** and never its value, so it is safe to run in a shared terminal
or paste into an incident channel.

## Consequences

- Adding a client-facing surface requires writing a policy, granting a table, and
  amending this ADR. Each is visible in review.
- `tests/integration/state-machine.test.ts` proves the denial against a real
  database with a publishable key, for both reads and function calls, and skips
  explicitly — rather than passing vacuously — when no publishable key is
  configured.
- The `verify_jwt = false` setting is load-bearing and invisible to every test
  that does not make a real HTTP request, which is the reason
  `tests/e2e/webhook.test.ts` exists.
- The dev project diverged from the repository for a period: three migration files
  were edited after being applied, adding a `REVOKE` on three trigger functions, so
  the deployed project kept the older ACLs. **Resolved** — the from-scratch replay
  of 2026-09-17 rebuilt the schema with Supabase's default privileges live, so the
  revokes described here were genuinely exercised rather than trivially satisfied.
  See [The replay](../IMPLEMENTATION_STATUS.md#the-replay).

## Alternatives considered

**Write policies now for a future login system.** Rejected: they would be written
for an imagined caller, and the first real one would rewrite them.

**Rely on RLS alone, without revoking table grants.** Rejected: two gates, both
closed, costs one line per table.

**Rely on `returns trigger` to protect the trigger functions.** Rejected: it is a
property of a return type, not a control. See point 5.
