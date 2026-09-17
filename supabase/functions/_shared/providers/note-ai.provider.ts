import type { SystemTemplateKey } from "../config/constants.ts";
import type { GenerationTemplate } from "../repositories/templates.repository.ts";
import type { StructuredNote } from "../schemas/structured-note.ts";

export interface TextGenerationRequest {
  readonly sourceText: string;
  readonly template: GenerationTemplate;
  readonly templateKey: SystemTemplateKey;
  readonly reason: "initial" | "regenerate" | "shorter" | "detailed" | "custom";
  readonly outputLanguage: string | null;
}

export interface AudioGenerationRequest {
  /** Raw audio held only for the lifetime of this call. Never persisted. */
  readonly audio: Uint8Array;
  readonly mimeType: string;
  readonly template: GenerationTemplate;
  readonly templateKey: SystemTemplateKey;
  readonly outputLanguage: string | null;
}

export interface NoteGenerationResult {
  readonly note: StructuredNote;
  readonly provider: string;
  readonly model: string;
  readonly providerRequestId: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
}

export interface AudioGenerationResult extends NoteGenerationResult {
  /** Provider transcript, schema-validated before persistence or delivery. */
  readonly transcript: string;
}

/** Provider-neutral boundary for Phase 1 text generation. */
export interface NoteAIProvider {
  generateText(request: TextGenerationRequest): Promise<NoteGenerationResult>;
  generateAudio(request: AudioGenerationRequest): Promise<AudioGenerationResult>;
}
