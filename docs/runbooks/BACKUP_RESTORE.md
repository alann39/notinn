# Backup and restore procedures

## Current limitations

The Notinn development project uses the Supabase Free plan. Free-tier projects do not receive automatic daily backups or point-in-time recovery. These procedures rely on manual `pg_dump` operations.

## Creating a backup

1. Open the Supabase dashboard and navigate to the SQL Editor.
2. Run the following to verify the schema is healthy before backup:

```sql
select count(*) from information_schema.tables
 where table_schema = 'public' and table_type = 'BASE TABLE';
```

Expected: 13 or more tables (the exact count grows with each phase).

3. From the local repository, run:

```bash
pg_dump \
  "postgresql://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres" \
  --schema=public \
  --no-owner \
  --no-privileges \
  -Fc \
  -f "notinn-backup-$(date +%Y%m%d).dump"
```

4. Store the `.dump` file in a secure location outside the repository.
5. The backup contains schema definitions, seed data, and application rows. It does not contain Edge Function source code (which lives in the repository) or Supabase secrets (which live in the dashboard).

## Restoring to a new project

1. Create a new Supabase project in the target organisation.
2. Apply all migrations in order from `supabase/migrations/` before restoring the dump, or use `pg_restore` with `--schema=public`.
3. Deploy Edge Functions from the repository.
4. Set all required secrets in the new project's dashboard.
5. Register the Telegram webhook.
6. Run `deno task verify-env` to confirm configuration.
7. Run `deno task smoke` to confirm end-to-end health.

## Recommended backup schedule

- Weekly manual backup via the procedure above.
- Additional backup before any migration applied to a project with user data.
- Backups are retained for 30 days minimum.

## Verification after restore

```sql
-- Table counts
select tablename, pg_size_pretty(pg_total_relation_size('public.' || tablename))
  from pg_tables where schemaname = 'public' order by tablename;

-- Migration ledger
select version, name from supabase_migrations.schema_migrations order by version;

-- Template seed
select count(*) from public.templates;

-- No orphaned queue messages
select count(*) from pgmq.messages('notinn_jobs');
```
