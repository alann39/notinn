# ADR 0010 — Controlled same-provider Gemini fallback

**Status:** Accepted
**Date:** 2026-09-18

## Context

Live document processing exposed free-tier rate limits on the configured Gemini
model. Retrying the same model later remains useful, but a temporary limit or
provider outage should not make the entire bot unavailable when another Gemini
model supports the same text, image, audio, PDF, and structured-output contract.

The MVP still benefits from one provider and one API key. A modality-specific
model graph or an additional provider would add credentials, contracts, privacy
review, metering, and failure modes that are not justified yet.

## Decision

1. `GEMINI_MODEL` remains the primary model and `GEMINI_FALLBACK_MODEL` names one
   optional fallback. Production configures `gemini-3.8-flash` followed by
   `gemini-3.5-flash-lite`; both use the same `GEMINI_API_KEY`.
2. The adapter retries the complete request on the fallback at most once, and
   only when the primary returns HTTP 429, times out, or returns HTTP 5xx.
3. HTTP 4xx other than 429, unreachable-network errors, malformed provider
   responses, safety/output failures, and schema-validation failures do not
   trigger fallback. Repeating those calls would hide defects or waste quota.
4. The fallback response passes through the same Zod validation and persistence
   path as the primary response. The model actually used is stored in generated
   output and usage telemetry.
5. `store: false`, content redaction, raw-file ephemerality, and the existing
   retry queue apply identically to both model attempts.

## Consequences

- Transient primary-model limits can recover immediately without another
  Telegram upload and without adding a credential.
- One job may consume quota for two provider calls. The second call is bounded
  to one attempt inside the adapter; normal durable job retries remain outside it.
- Removing `GEMINI_FALLBACK_MODEL` safely disables immediate fallback without a
  code change. Setting it equal to the primary is rejected at startup.
- If both models fail transiently, the existing durable retry policy and user
  status message remain authoritative.

## Rejected alternatives

- **Fallback for every error.** Rejected because invalid requests and invalid
  structured output are not availability failures.
- **A second provider or key.** Rejected for the MVP because it expands security,
  privacy, billing, and contract surface without being necessary for this limit.
- **Different models per modality.** Rejected because the selected fallback
  already supports every currently shipped input modality.
