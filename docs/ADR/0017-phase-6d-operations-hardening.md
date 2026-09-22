# ADR 0017: operations hardening and production monitoring

- Status: accepted
- Date: 2026-09-22

## Decision

Notinn gains operator CLI scripts, a monitoring Edge Function with Telegram alerts, and database indexes optimised for operational queries. All operator tooling refuses to run against `NOTINN_ENV=production` and verifies `NOTINN_PROJECT_REF` matches the deployment target.

A single migration creates four monitoring indexes and five `SECURITY DEFINER` RPC functions. The ops scripts call these RPCs through a new repository, following the established RPC-first pattern.

The `ops-monitor` Edge Function runs on a cron schedule, queries health metrics, and sends alerts to a configurable Telegram chat. Alert deduplication is in-memory and best-effort, acceptable at Free-tier scale.

## Why

A Free-tier Supabase project has no automatic backups, no built-in alerting, and no operations dashboard. Without operator tooling, incident response depends on ad-hoc database queries. Without monitoring, queue stalls and failed jobs go unnoticed until users report missing notes.

The project-ref guard prevents the most costly operational mistake: running a development tool against a production database, or vice versa. The existing `NOTINN_ENV=production` guard prevents destructive commands; the ref guard prevents data-plane mismatches.

## Consequences

- Operator commands are development-only. Production operations go through the Supabase dashboard or approved migration paths.
- The `ops-monitor` function carries its own Telegram chat target for alerts, separate from user-facing delivery channels.
- New database functions follow the existing `SECURITY DEFINER` pattern with pinned `search_path` and service-role-only grants.
- Backup and rotation procedures are documented as runbooks rather than automated, because the Free tier lacks scheduled backups and most rotation requires manual dashboard access.
- The ops scripts are readable and auditable: each subcommand maps to one RPC call and one formatting function, with no hidden state.
