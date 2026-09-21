import type {
  GroundedAnswerResult,
  GroundingEvidence,
  LibraryAnswerProvider,
} from "./library-ai.provider.ts";
import type {
  AudioGenerationRequest,
  AudioGenerationResult,
  ImageGenerationRequest,
  ImageGenerationResult,
  NoteAIProvider,
  NoteGenerationResult,
  PdfGenerationRequest,
  PdfGenerationResult,
  TextGenerationRequest,
} from "./note-ai.provider.ts";
import { isTransientProviderFailure } from "./provider-fallback.ts";

/** Runs the secondary provider only for transient upstream failures. */
export class FallbackNoteProvider implements NoteAIProvider, LibraryAnswerProvider {
  readonly #primary: NoteAIProvider & LibraryAnswerProvider;
  readonly #secondary: NoteAIProvider & LibraryAnswerProvider;

  constructor(
    primary: NoteAIProvider & LibraryAnswerProvider,
    secondary: NoteAIProvider & LibraryAnswerProvider,
  ) {
    this.#primary = primary;
    this.#secondary = secondary;
  }

  generateText(request: TextGenerationRequest): Promise<NoteGenerationResult> {
    return this.#withFallback(
      () => this.#primary.generateText(request),
      () => this.#secondary.generateText(request),
    );
  }

  generateAudio(request: AudioGenerationRequest): Promise<AudioGenerationResult> {
    return this.#withFallback(
      () => this.#primary.generateAudio(request),
      () => this.#secondary.generateAudio(request),
    );
  }

  generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    return this.#withFallback(
      () => this.#primary.generateImage(request),
      () => this.#secondary.generateImage(request),
    );
  }

  generatePdf(request: PdfGenerationRequest): Promise<PdfGenerationResult> {
    return this.#withFallback(
      () => this.#primary.generatePdf(request),
      () => this.#secondary.generatePdf(request),
    );
  }

  answerFromEvidence(
    question: string,
    evidence: readonly GroundingEvidence[],
  ): Promise<GroundedAnswerResult> {
    return this.#withFallback(
      () => this.#primary.answerFromEvidence(question, evidence),
      () => this.#secondary.answerFromEvidence(question, evidence),
    );
  }

  async #withFallback<T>(primary: () => Promise<T>, secondary: () => Promise<T>): Promise<T> {
    try {
      return await primary();
    } catch (thrown) {
      if (!isTransientProviderFailure(thrown)) throw thrown;
      return await secondary();
    }
  }
}
