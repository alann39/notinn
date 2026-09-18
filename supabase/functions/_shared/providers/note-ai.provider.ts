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

export interface ImageGenerationRequest {
  /** Raw image held only for the lifetime of this call. Never persisted. */
  readonly image: Uint8Array;
  readonly mimeType: "image/jpeg" | "image/png" | "image/webp";
  readonly template: GenerationTemplate;
  readonly templateKey: SystemTemplateKey;
  readonly outputLanguage: string | null;
}

export interface PdfGenerationRequest {
  /** Raw PDF held only for the lifetime of this call. Never persisted. */
  readonly pdf: Uint8Array;
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

export interface ImageGenerationResult extends NoteGenerationResult {
  /** OCR/visual extraction retained as the normalized source; the image is discarded. */
  readonly extractedText: string;
}

export interface PdfGenerationResult extends NoteGenerationResult {
  /** Extracted document text retained as the normalized source; the PDF is discarded. */
  readonly extractedText: string;
  /** Provider-observed page count. Used only for usage telemetry, never authorization. */
  readonly documentPages: number | null;
}

/** Provider-neutral boundary for Phase 1 text generation. */
export interface NoteAIProvider {
  generateText(request: TextGenerationRequest): Promise<NoteGenerationResult>;
  generateAudio(request: AudioGenerationRequest): Promise<AudioGenerationResult>;
  generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
  generatePdf(request: PdfGenerationRequest): Promise<PdfGenerationResult>;
}
