-- Phase 2 / recovery scheduler prerequisites (deployed migration version).
--
-- The schedule itself is environment-specific and is installed as an
-- operational deployment step after `notinn_project_url` and
-- `notinn_worker_secret` exist in Vault. Keeping only the extensions in this
-- migration preserves clean replay in local, branch and production projects.

create extension if not exists pg_cron;
create extension if not exists pg_net;
