import type {
  SourceReferenceKind,
  SystemTemplateKey,
} from "../../../supabase/functions/_shared/config/constants.ts";

/**
 * Synthetic structured-note fixtures.
 *
 * Every value here is invented. Nothing in this file was copied from a real note,
 * a real message or a real user, and the identifiers are visibly fake so that a
 * fixture that ever escaped into a database would be obvious rather than plausible.
 *
 * The builder is a starting point, not a golden file: a test that wants an invalid
 * note should override exactly the field it is about, so that the failure it
 * asserts is the failure it caused.
 */
export interface StructuredNoteFixture {
  title: string;
  language: string;
  template_key: string;
  summary: string;
  sections: { heading: string; content: string }[];
  key_points: string[];
  action_items: {
    task: string;
    owner: string | null;
    due_date_text: string | null;
    due_date_iso: string | null;
    confidence: number;
  }[];
  decisions: string[];
  tags: string[];
  uncertainties: string[];
  source_references: { type: SourceReferenceKind; value: string }[];
}

/** A valid note with every field populated, as a provider would return one. */
export function structuredNoteFixture(
  overrides: Partial<StructuredNoteFixture> = {},
): StructuredNoteFixture {
  return {
    title: "Synthetic weekly sync",
    language: "en",
    template_key: "clean_note",
    summary: "A synthetic note used by tests only.",
    sections: [
      { heading: "Context", content: "The synthetic team met to discuss nothing real." },
      { heading: "Outcome", content: "A synthetic decision was recorded." },
    ],
    key_points: [
      "Synthetic point one.",
      "Synthetic point two.",
    ],
    action_items: [
      {
        task: "Draft the synthetic document",
        owner: "Synthetic Owner",
        due_date_text: "Friday",
        due_date_iso: "2026-09-18",
        confidence: 0.8,
      },
      {
        task: "Confirm the synthetic schedule",
        owner: null,
        due_date_text: null,
        due_date_iso: null,
        confidence: 0.4,
      },
    ],
    decisions: ["The synthetic project continues."],
    tags: ["synthetic", "planning"],
    uncertainties: ["The synthetic timeline was stated twice with different dates."],
    source_references: [],
    ...overrides,
  };
}

/**
 * The same note, as each system template would return it.
 *
 * Blueprint 23.2 asks for "structured output fixtures for every template", and
 * blueprint 12.4 answers why they are all the same shape: templates vary the
 * instructions, not the contract. Deriving one from the other states that
 * relationship in code, so a fixture set that quietly grew a per-template shape
 * would be visible as a change to this function rather than as eleven files that
 * happen to agree.
 */
export function structuredNoteFixtureFor(
  templateKey: SystemTemplateKey,
): StructuredNoteFixture {
  return structuredNoteFixture({ template_key: templateKey });
}
