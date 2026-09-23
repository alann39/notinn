# ADR 0020 — Phase 7 admin and provider credential correction

- Status: accepted
- Date: 2026-09-23

## Decision

The Phase 7D `initial_seed` grant applied to every existing user. The corrective
migration preserves the confirmed development operator (`@iarchii`) as an
explicit migration grant and removes every other automatic grant. Explicit CLI
grants survive. Future operators must be granted by Telegram numeric user ID
through `deno task admin add <telegram-user-id>`.

Provider keys are migrated from plaintext `system_provider_keys.api_key` into
Supabase Vault. The public table retains only a secret UUID and masked hint.
An authenticated admin can rotate a key through a restricted RPC; only a
service-role RPC returns decrypted keys to Edge Functions. Existing environment
keys remain a bootstrap fallback; `GEMINI_API_KEY` remains required by the
current startup validator. No credential is returned to a browser.

Both the webhook and worker read the current provider configuration on each
request. Vaulted credentials and selected models take priority over environment
defaults. A disabled OpenRouter row disables its environment fallback. The
default OpenRouter model remains `openrouter/free` so a migration cannot silently
switch to a potentially paid automatic route.

Both candidate and saved-key connection tests run in the admin Edge Function.
Candidate keys travel from the admin browser to that function over HTTPS; the
browser never contacts the model provider directly. Saved-key test results are
written using the caller's authenticated session so the admin check succeeds.

## Rollout

Apply migration `20260923140000_fix_admin_provider_vault.sql` before deploying
the updated webhook, worker, and admin test function. Audit the retained admin
grant, then verify the intended operator login. Never deploy only the original
Phase 7D migration to a live environment: its broad seed remains in historical
migration history and is revoked by this corrective migration.

The old plaintext column is dropped, but older database backups may still contain
previous key values. Rotate credentials that were stored there after rollout.
