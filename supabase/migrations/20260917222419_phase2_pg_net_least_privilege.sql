-- pg_net is installed only so the postgres-owned recovery Cron can invoke the
-- private worker. Extension objects receive PUBLIC privileges by default, but
-- Notinn has no client-side use for the net schema. Keep that capability out
-- of every API-facing role; the extension owner/postgres retains access.

revoke all on schema net from public, anon, authenticated, service_role;
revoke all on all functions in schema net from public, anon, authenticated, service_role;
revoke all on all tables in schema net from public, anon, authenticated, service_role;
revoke all on all sequences in schema net from public, anon, authenticated, service_role;
