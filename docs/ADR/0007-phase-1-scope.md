# ADR 0007 — Phase 1 text-note scope

**Status:** Accepted for Phase 1; inline initial processing and delivery completion
semantics superseded by [ADR 0008](0008-phase-2-durable-worker.md)\
**Date:** 2026-09-17

## Context

Phase 0 stopped after durable Telegram ingestion. Phase 1 has to turn private-chat
text into a validated note, return it to Telegram, and make the first note actions
usable without pulling Phase 2 voice processing or Phase 3 document processing
forward.

The product decision is one configurable AI model and one API key for the MVP.
The configured model is not hard-coded; changing it is an environment change.

## Decisions

1. **Gemini is the only Phase 1 provider.** `NoteAIProvider` is the seam and
   `GeminiNoteProvider` is its only implementation. The webhook reads
   `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, and `GEMINI_MODEL`. No AgentRouter,
   Groq, or Apps Script sits in the request path.
2. **Structured output uses the Gemini REST API directly.** The adapter sends
   `responseMimeType=application/json` and `responseJsonSchema`, then validates
   the returned object again with Zod. Provider conformance cannot replace
   application validation.
3. **Phase 1 processes accepted text inline.** It advances the durable job through
   `QUEUED → ACQUIRING → EXTRACTING → GENERATING → DELIVERING`; `persist_note`
   completes the job atomically with note creation. Queue workers and automatic
   retry execution remain Phase 2.
4. **The webhook now holds the Telegram bot token and Gemini key.** This is a real
   increase in blast radius compared with Phase 0. It is accepted because the
   webhook now performs delivery and generation. Both values remain wrapped by
   `Secret`, and neither is loggable.
5. **Callback queries are a first-class update kind.** Phase 1 supports Save,
   Unsave, Shorter, More detailed, Change format, Delete, and Show. Ownership is
   checked in the same owner-scoped database statement that reads or changes the
   note. Callback payload encoding is not treated as authorisation.
6. **`/recent` lists saved notes only.** Every other command receives one short
   sentence describing the current surface. Commands are never ingested as note
   text.
7. **A non-private chat receives the fixed refusal at most once.** The reply slot
   is claimed atomically in `claim_rejected_chat_reply`; a failed send is not
   reclaimed, preferring silence to repeated group messages.
8. **Regeneration is append-only.** A new output is inserted, delivered, and only
   then made current. A delivery failure therefore leaves the previous output
   current.
9. **Raw upload retention does not change in Phase 1.** Text is stored as the
   normalised source according to the current privacy mode. Voice, images, and
   documents are ingested but not acquired or processed yet; no raw file is copied
   into Supabase Storage.

## Consequences

- Telegram webhook registration must include both `message` and `callback_query`.
- Phase 1 adds four unapplied migrations: rejected-chat guarding, concrete
  template schemas, owner-scoped note functions, and inline pipeline helpers.
- A provider failure moves the job to `RETRYABLE_FAILED` and sends the fixed public
  error sentence. Phase 2 owns the worker that will consume `next_attempt_at`.
- A note is complete in the database immediately before Telegram delivery. A
  delivery failure is therefore observable as a completed note the user may not
  have seen; the `DELIVERY_FAILED` taxonomy entry exists for that reconciliation.
- Voice, image, PDF, DOCX, TXT, and Markdown updates remain durable queued jobs but
  receive no Phase 1 processing response.

## Rejected alternatives

- **One provider per modality.** Rejected for the MVP because it multiplies keys,
  configuration, failure modes, and usage reconciliation before any modality
  beyond text ships.
- **Apps Script as the webhook or orchestrator.** Rejected because the existing
  Supabase Edge Function already provides the authenticated, testable,
  owner-scoped boundary the product needs.
- **Update the current output before delivery.** Rejected because a failed send
  would make an unseen generation the note's preferred output.
