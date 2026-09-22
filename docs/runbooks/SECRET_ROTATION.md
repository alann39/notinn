# Secret rotation procedures

## Order of operations

Rotate secrets in this order to minimise downtime. Each step includes a verification command.

### 1. `SUPABASE_SERVICE_ROLE_KEY`

This key authenticates all server-side database and Edge Function operations.

1. Navigate to Supabase Dashboard → Settings → API → Service role key.
2. Generate a new key.
3. Update the secret in Supabase Dashboard → Edge Functions → Secrets.
4. Update `.env` locally and in any deployment environment.
5. Verify: `deno task verify-env` reports `service_role_key` as present and valid.

### 2. `TELEGRAM_BOT_TOKEN`

1. Open Telegram and message @BotFather.
2. Send `/revoke-token` and select the Notinn bot.
3. Generate a new token via `/token`.
4. Update the secret in Supabase Dashboard → Edge Functions → Secrets.
5. Update `.env` locally.
6. Re-register the webhook: `deno task webhook:set`.
7. Verify: `deno task webhook:info` shows the correct URL and allowed updates.

### 3. `TELEGRAM_WEBHOOK_SECRET`

1. Generate a new 32-character random string: `openssl rand -hex 16`.
2. Update the secret in Supabase Dashboard → Edge Functions → Secrets.
3. Update `.env` locally.
4. Re-register the webhook: `deno task webhook:set`.
5. Verify: `deno task webhook:info` shows the registered URL.

### 4. `INTERNAL_WORKER_SECRET`

1. Generate a new 32-character random string: `openssl rand -hex 16`.
2. Update the secret in Supabase Dashboard → Edge Functions → Secrets.
3. Update `.env` locally.
4. Trigger a recovery cron manually and confirm HTTP 200.
5. Verify: `deno task ops health` returns valid metrics.

### 5. `GEMINI_API_KEY`

1. Navigate to Google AI Studio → API Keys.
2. Create a new key. Optionally revoke the old one.
3. Update the secret in Supabase Dashboard → Edge Functions → Secrets.
4. Update `.env` locally.
5. Process a test note through Telegram and confirm generation succeeds.

### 6. `OPENROUTER_API_KEY` (optional)

1. Navigate to OpenRouter Dashboard → Keys.
2. Create a new key.
3. Update the secret in Supabase Dashboard → Edge Functions → Secrets.
4. Update `.env` locally.
5. This key is only used as a cross-provider fallback; rotation failure does not block primary generation.

### 7. `OPS_ALERT_CHAT_ID`

This is a Telegram chat ID, not a credential. However, updating it:

1. Update the secret in Supabase Dashboard → Edge Functions → Secrets.
2. Trigger `ops-monitor` manually and confirm the alert reaches the new chat.

## Post-rotation verification checklist

- [ ] `deno task verify-env` passes.
- [ ] `deno task webhook:info` shows correct registration.
- [ ] `deno task ops health` returns valid metrics.
- [ ] A test text note processes successfully.
- [ ] A test voice note processes successfully (if voice testing is available).
- [ ] Alerts from `ops-monitor` reach the correct Telegram chat.
- [ ] No old credentials remain in `.env`, Supabase secrets, or git history.
