# ADR 0012 — Semantic Library indexes saved current outputs lazily

**Status:** Accepted
**Date:** 2026-09-18

## Context

Library Search established the owner and Save boundaries with deterministic
full-text search. Semantic retrieval now needs vectors without duplicating raw
uploads, silently indexing unsaved previews, or making Save callbacks wait on a
provider call. Gemini's current embedding choices also differ operationally:
`gemini-embedding-001` can batch independent text documents and accepts retrieval
task types, while Embedding 2 aggregates multiple inputs into one embedding.

## Decision

1. `/ask <question>` is the semantic surface. It considers only explicitly saved,
   undeleted notes owned by the requesting internal user.
2. The MVP embeds each note's current validated structured output as one document.
   It does not re-upload raw Telegram media and does not embed historical outputs.
3. Indexing is lazy: the first `/ask` batches at most twenty missing or stale saved
   outputs. Save stays deterministic and fast. Later asks reuse stored vectors.
4. `gemini-embedding-001` produces 768-dimensional embeddings using
   `RETRIEVAL_DOCUMENT` for notes and `QUESTION_ANSWERING` for questions. The
   truncated vectors are normalized before cosine comparison. It uses the existing
   `GEMINI_API_KEY`; `GEMINI_EMBEDDING_MODEL` names the non-secret model.
5. `note_embeddings` stores only owner/output references, model, SHA-256 content
   hash, and vector. It does not duplicate note text. Evidence is joined from the
   owned current `note_outputs` row after matching.
6. Unsave, current-output changes, and note deletion invalidate vectors in the
   database. A provider result is written only if owner, Save state, output id, and
   content hash still agree in the same statement.
7. The vector table and three RPCs are inaccessible to client roles. Every RPC is
   `SECURITY DEFINER`, pins an empty search path, and contains the owner predicate.
8. Answers use the existing primary/fallback generation models, receive only the
   top five owned matches, must declare whether evidence is sufficient, and must
   return valid evidence indexes. Telegram shows cited titles with opaque Open
   buttons.

## Consequences

- Ordinary note generation, `/recent`, and `/search` remain available when the
  embedding model variable is absent or the embedding API is unavailable.
- The first `/ask` after saving or regenerating notes costs one batched document
  embedding request plus one query embedding request; later asks need only the
  query embedding and grounded generation.
- One vector per current note is a deliberate MVP recall tradeoff. Chunk-level and
  hybrid rank fusion remain possible later without changing the owner boundary.
- A library larger than twenty newly unindexed notes is warmed over multiple asks;
  the request budget stays bounded instead of turning one webhook into an
  unbounded indexing job.

## Rejected alternatives

- **Embed on Save.** Rejected because callback acknowledgement would depend on a
  provider and no durable embedding retry queue exists yet.
- **Store content beside vectors.** Rejected because it duplicates user-derived
  text and expands deletion and breach surface without improving retrieval.
- **Use Embedding 2 immediately.** Rejected for this text-only MVP because multiple
  inputs are aggregated rather than returned as independent embeddings, increasing
  request count for library warm-up.
