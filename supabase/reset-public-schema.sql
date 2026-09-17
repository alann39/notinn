-- Resets schema `public` to the state of a freshly created Supabase project, so
-- that the migration set in ./migrations can be replayed from scratch.
--
-- WHY THIS FILE EXISTS
--
--   `supabase db reset --linked` is the tool built for this and cannot be used
--   on this project: it is not linked, and linking requires either an access
--   token or the database password. This is the same operation, written down and
--   reviewable, rather than a command that existed only in a chat message.
--
-- DESTRUCTIVE
--
--   Drops every object in `public` and clears the migration ledger. Run it only
--   against a development project, and only when the data is expendable.
--   `scripts/clear-test-data.ts` refuses to run with NOTINN_ENV=production; this
--   script carries no such guard, because it is pasted into a SQL editor by
--   someone who has already read this paragraph.
--
-- WHY THE DEFAULT PRIVILEGES BELOW ARE THE WHOLE POINT
--
--   They are the reason this is a real test rather than a rehearsal. Supabase
--   grants EXECUTE on every newly created FUNCTION to `anon` and `authenticated`,
--   and PostgreSQL grants it to PUBLIC. Those defaults are what put a client-role
--   EXECUTE grant on three trigger functions in Phase 0, which the migrations
--   then REVOKE.
--
--   Replaying against a schema where those defaults had not been restored would
--   prove only that a REVOKE is a no-op when there is nothing to revoke. The
--   defaults must be back in place BEFORE the migrations run, or the replay
--   tests nothing at all. Do not remove them to make the outcome look cleaner.
--
-- FIDELITY NOTES
--
--   * The migrations run as `postgres`. The `supabase_admin`-owned default
--     privileges cannot be reproduced here — `postgres` is not a member of
--     `supabase_admin` — but they apply only to objects created BY
--     `supabase_admin`, and no migration creates one.
--   * A fresh project's `public` schema is owned by `pg_database_owner`. On this
--     project that resolves to `postgres`, which is what CREATE SCHEMA assigns,
--     so the two are equivalent.
--   * Verified before running: schema `public` contained only this project's own
--     objects (8 tables, 5 functions, 27 indexes, 30 types, all owned by
--     `postgres`), nothing in another schema depended on them, and the ledger
--     held exactly this project's nine migrations.

drop schema if exists public cascade;

create schema public;

-- The namespace grants a fresh project carries. PUBLIC's USAGE is PostgreSQL's
-- own default for a new schema; the named roles are Supabase's addition.
grant usage on schema public to postgres, anon, authenticated, service_role;
grant usage on schema public to public;

-- The function grant is the one that produced the divergence this replay exists
-- to resolve.
alter default privileges for role postgres in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;

-- Mirrors `supabase db reset`, which truncates the ledger: an empty ledger is
-- what makes the replay a first apply rather than a silent no-op.
delete from supabase_migrations.schema_migrations;

-- ---------------------------------------------------------------------------
-- AFTER REPLAYING, RECONCILE THE LEDGER
-- ---------------------------------------------------------------------------
--
-- Only needed when the migrations are applied through the MCP `apply_migration`
-- tool rather than `supabase db push`. That tool stamps each row with the time it
-- ran — 20260916235300 — and puts the whole filename in `name`. `db push`, by
-- contrast, records the filename's own version prefix.
--
-- Left uncorrected, a later `db push` compares the ledger against the filenames,
-- finds none of them, and tries to apply all nine a second time against objects
-- that already exist. Both fields are recoverable from what `apply_migration`
-- wrote, so the correction is exact rather than a retype:
--
--   update supabase_migrations.schema_migrations
--   set version = split_part(name, '_', 1),
--       name    = substring(name from position('_' in name) + 1);
--
