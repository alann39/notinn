-- Phase 1 / template schemas
-- The concrete structured-note JSON Schema on public.templates.
--
-- Migration 3 promised this: "Phase 0 records which contract and version applies;
-- Phase 1 replaces this with the concrete JSON Schema used for structured-output
-- validation." See docs/ADR/0002-phase-0-scope.md.
--
-- Why every template carries the same schema. Blueprint 12.4 defines one
-- structured note contract, and blueprint 6.1's templates vary the *instructions*,
-- not the *shape*: a Key Points note and a Meeting Notes note are the same object
-- with different content in it. A per-template schema would be eleven copies of
-- one document, and eleven places for them to drift apart.
--
-- What this value is for, and what it is not:
--
--   * It is the provider-facing output contract. The Gemini adapter passes
--     `schema` to the model as responseJsonSchema, so the model is constrained at
--     generation time rather than corrected afterwards.
--
--   * It is NOT the validation authority. Validation is the Zod schema in
--     supabase/functions/_shared/schemas/structured-note.ts, which is what
--     blueprint 12.4's five "required schema rules" and blueprint 25's "every
--     persisted output passes the schema" are enforced by. A contract test
--     asserts the two agree on the required key set.
--
--   * It is stored per template rather than hard-coded because blueprint 6.2
--     has a custom template supply its own "JSON output schema". Phase 1 has no
--     custom templates; keeping the schema on the row is what lets Phase 5 add
--     them without moving anything.
--
-- The dialect is the JSON Schema subset Gemini accepts. Keywords outside the
-- subset used here (pattern, minLength, maxLength)
-- are deliberately absent: Gemini rejects an unrecognised keyword, and a schema
-- the provider refuses is a schema that cannot do its job. Those constraints are
-- enforced by Zod instead, which is where they were always going to be believed.

update public.templates
   set schema_json = $json${
  "contract": "structured_note",
  "version": 1,
  "schema": {
    "type": "object",
    "description": "A structured note. Unknown values are null, never fabricated.",
    "properties": {
      "title": {
        "type": "string",
        "description": "A short specific title. Do not invent one if the source has no subject; use a plain description of the content instead."
      },
      "language": {
        "type": "string",
        "description": "BCP-47 tag of the language this note is written in, for example id or en. Follow the requested output language."
      },
      "template_key": {
        "type": "string",
        "description": "The template key this note was generated for."
      },
      "summary": {
        "type": "string",
        "description": "The TL;DR. Empty string only if the source genuinely has no substance."
      },
      "sections": {
        "type": "array",
        "description": "The body of the note, split at the template's own headings. Use an empty array when the template produces no sections.",
        "items": {
          "type": "object",
          "properties": {
            "heading": { "type": "string", "description": "Section heading, short and without trailing punctuation." },
            "content": { "type": "string", "description": "The section body as plain prose. May contain newlines; must not contain markup." }
          },
          "required": ["heading", "content"]
        }
      },
      "key_points": {
        "type": "array",
        "description": "One idea per item, stated as a standalone sentence. Empty array if there are none.",
        "items": { "type": "string" }
      },
      "action_items": {
        "type": "array",
        "description": "Tasks the source actually states or clearly implies. Do not invent tasks to fill this array.",
        "items": {
          "type": "object",
          "properties": {
            "task": { "type": "string", "description": "What must be done, as an imperative phrase." },
            "owner": { "type": ["string", "null"], "description": "Who owns it, only when the source names them. Never inferred." },
            "due_date_text": { "type": ["string", "null"], "description": "The deadline exactly as the source phrased it, for example \"Friday\" or \"end of month\"." },
            "due_date_iso": { "type": ["string", "null"], "description": "YYYY-MM-DD, only when the source is clear enough to normalize without guessing. Otherwise null, even when due_date_text is set." },
            "confidence": { "type": "number", "description": "0.0 to 1.0. A product signal about how sure this item is an action item, not a statement of fact." }
          },
          "required": ["task", "owner", "due_date_text", "due_date_iso", "confidence"]
        }
      },
      "decisions": {
        "type": "array",
        "description": "Decisions the source records, with their rationale when stated. Empty array if the source records none.",
        "items": { "type": "string" }
      },
      "tags": {
        "type": "array",
        "description": "Lowercase topical tags of one to two words each, taken from the content rather than from the template. At most 12, and prefer 3 to 6. Empty array if nothing is distinctive.",
        "maxItems": 12,
        "items": { "type": "string" }
      },
      "uncertainties": {
        "type": "array",
        "description": "Anything unreadable, ambiguous or unclear in the source, stated plainly. This array is the correct place for doubt; the other fields must not hedge.",
        "items": { "type": "string" }
      },
      "source_references": {
        "type": "array",
        "description": "Where in the source a claim comes from, when the source is addressable. Empty array for plain pasted text, which has no pages, timestamps or segments.",
        "items": {
          "type": "object",
          "properties": {
            "type": { "type": "string", "enum": ["page", "timestamp", "segment"], "description": "What kind of address this is." },
            "value": { "type": "string", "description": "The address itself, for example \"4\" or \"00:12:30\"." }
          },
          "required": ["type", "value"]
        }
      }
    },
    "required": [
      "title",
      "language",
      "template_key",
      "summary",
      "sections",
      "key_points",
      "action_items",
      "decisions",
      "tags",
      "uncertainties",
      "source_references"
    ]
  }
}$json$::jsonb
 where owner_user_id is null;

comment on column public.templates.schema_json is
  'The output contract this template targets, as {contract, version, schema}. `schema` is the concrete JSON Schema handed to Gemini as responseJsonSchema. Validation is not done against this value — it is done by the Zod schema in _shared/schemas/structured-note.ts, and a contract test asserts the two agree. A custom template (blueprint 6.2, Phase 5) supplies its own schema for this column.';
