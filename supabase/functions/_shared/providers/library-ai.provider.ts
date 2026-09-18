export interface EmbeddingDocument {
  readonly title: string;
  readonly text: string;
}

export interface EmbeddingResult {
  readonly vectors: readonly (readonly number[])[];
  readonly provider: string;
  readonly model: string;
}

export interface EmbeddingProvider {
  readonly model: string;
  embedDocuments(documents: readonly EmbeddingDocument[]): Promise<EmbeddingResult>;
  embedQuestion(question: string): Promise<EmbeddingResult>;
}

export interface GroundingEvidence {
  readonly index: number;
  readonly title: string;
  readonly content: string;
  readonly updatedAt: string;
}

export interface GroundedAnswerResult {
  readonly answer: string;
  readonly citationIndexes: readonly number[];
  readonly sufficient: boolean;
  readonly provider: string;
  readonly model: string;
  readonly providerRequestId: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
}

export interface LibraryAnswerProvider {
  answerFromEvidence(
    question: string,
    evidence: readonly GroundingEvidence[],
  ): Promise<GroundedAnswerResult>;
}
