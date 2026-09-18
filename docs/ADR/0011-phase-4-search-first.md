# ADR 0011 — Phase 4 starts with deterministic full-text search

**Status:** Accepted
**Date:** 2026-09-18

## Context

Phase 4 adds a personal knowledge library. Its final surface includes keyword
search, semantic retrieval, and questions across saved notes. The blueprint also
sets an ordering constraint: PostgreSQL full-text search comes before vectors.

Shipping embeddings first would make relevance, ownership bugs, model quality,
and provider failures indistinguishable. A deterministic lexical baseline gives
the product a useful search command and gives later semantic retrieval something
measurable to improve rather than replace blindly.

## Decision

1. Phase 4 ships in two vertical slices: Library Search, then Semantic Library.
2. Library Search exposes `/search <keywords>` and searches only explicitly saved,
   undeleted notes owned by the requesting internal `user_id`.
3. Search covers the note title, retained normalized source, validated tags, and
   the current rendered output. Historical outputs do not produce duplicate hits.
4. PostgreSQL stores weighted `tsvector` columns and GIN indexes. Titles and tags
   carry the highest weight, current output the middle weight, and retained source
   the lowest weight.
5. User text is parsed with `websearch_to_tsquery`, capped at 200 characters, and
   results are capped at ten. Ranking ties resolve by latest update and note id.
6. The search RPC is `SECURITY DEFINER`, pins an empty `search_path`, contains the
   owner predicate in the query itself, and is executable only by `service_role`.
7. Search results return opaque Open callbacks. Query text is never put in logs or
   callback payloads.
8. Semantic Library will add chunks, embeddings, hybrid retrieval, and `/ask`
   only after this slice passes live owner-scope and relevance tests.

## Consequences

- Search works without another model call, API key, or usage charge.
- Unsaved notes do not appear in the knowledge library.
- Tags already validated in the structured-note contract become searchable
  without introducing a second tag source of truth.
- Minimal privacy mode may reduce source-text coverage, but title, tags, and the
  current generated output remain searchable.
- A later embedding implementation can compare semantic and hybrid recall against
  the same command and saved-note corpus.

## Rejected alternatives

- **Embeddings first.** Rejected because it adds provider cost and opaque relevance
  before the ownership and interaction contract has a deterministic baseline.
- **Search every generated output.** Rejected because old formats would duplicate
  one note and make stale text outrank the user's current preferred output.
- **Search all generated notes automatically.** Rejected because `/recent` and the
  library already define Save as the explicit retention action.
