# ADR 0014: Reserve plan quota before provider work

- **Status:** accepted
- **Date:** 2026-09-20

## Context

Phase 6 introduces Free and Pro entitlements. A read-then-write limit check in an
Edge Function is not sufficient: concurrent jobs could both observe the last
available unit and start paid provider work. Holding a database transaction open
while calling Gemini would avoid that race but would create long-lived locks and
couple PostgreSQL availability to provider latency.

Provider token counts remain useful for cost analysis, but they arrive after the
operation. Admission control needs a small logical unit known before the call.

## Decision

Notinn meters three monthly logical operations: new-note generation,
regeneration, and semantic answers. Plan limits are rows in `plan_entitlements`,
so an operator can change them without an Edge Function deployment.

Before provider work, `reserve_plan_quota` locks the user's metric/month bucket,
reclaims expired reservations, checks `used + reserved + requested <= limit`,
and inserts an idempotent reservation. The transaction ends before any provider
request. Once provider work starts, the caller consumes the reservation even if
the provider fails; a failure before provider work releases it. Reservations
that are never reconciled expire after twenty minutes and are reclaimed by the
next reservation for that bucket.

All quota writers lock the bucket before the reservation to keep one lock order.
Quota RPCs are `SECURITY DEFINER` with an empty `search_path`, executable only by
`service_role`. Tables have RLS with no client policies and no direct
`service_role` table privilege. Reservation keys contain only generated update,
callback, job, and attempt identifiers—never note content.

## Consequences

- Concurrent operations cannot overspend the same remaining logical allowance.
- A transient provider retry uses a new job-attempt key and consumes another unit
  because another paid provider operation begins.
- Delivery retries reuse the staged note and consume no additional unit.
- Token, page, and audio telemetry stays in immutable `usage_events`; logical
  admission counters serve a different purpose.
- Initial Alpha, Free, and Pro values remain operator-editable product
  configuration. The Phase 6A release values are Alpha 500/200/200, Free
  50/50/50, and Pro 1,000/300/300 for new notes/regenerations/semantic answers.
