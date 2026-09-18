import { z } from "zod";
import type { AiConfig } from "../config/env.ts";
import { AppError } from "../errors/app-error.ts";
import type {
  EmbeddingDocument,
  EmbeddingProvider,
  EmbeddingResult,
} from "./library-ai.provider.ts";

const EMBEDDING_DIMENSIONS = 768;
const DEFAULT_TIMEOUT_MS = 30_000;
const SUPPORTED_MODEL = "gemini-embedding-001";

const SingleEmbeddingSchema = z.object({
  values: z.array(z.number().finite()).length(EMBEDDING_DIMENSIONS),
});

const BatchResponseSchema = z.object({
  embeddings: z.array(SingleEmbeddingSchema),
});

const SingleResponseSchema = z.object({ embedding: SingleEmbeddingSchema });

function normalize(values: readonly number[]): number[] {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw AppError.generationFailed("gemini embedding had zero or invalid magnitude");
  }
  return values.map((value) => value / magnitude);
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly #config: AiConfig;
  readonly #model: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;
  readonly model: string;

  constructor(
    config: AiConfig,
    options: { timeoutMs?: number; fetch?: typeof fetch } = {},
  ) {
    if (config.embeddingModel === null) {
      throw AppError.configuration(
        "GEMINI_EMBEDDING_MODEL is not set: /ask semantic search is unavailable.",
      );
    }
    if (config.embeddingModel !== SUPPORTED_MODEL) {
      throw AppError.configuration(
        `GEMINI_EMBEDDING_MODEL must be ${SUPPORTED_MODEL} for the current batched index format.`,
      );
    }
    this.#config = config;
    this.#model = config.embeddingModel;
    this.model = config.embeddingModel;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#fetch = options.fetch ?? fetch;
  }

  async embedDocuments(documents: readonly EmbeddingDocument[]): Promise<EmbeddingResult> {
    if (documents.length === 0 || documents.length > 20) {
      throw AppError.validation("embedding document batch must contain between 1 and 20 items");
    }

    const body = await this.#request(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.#model}:batchEmbedContents`,
      {
        requests: documents.map((document) => ({
          model: `models/${this.#model}`,
          content: { parts: [{ text: document.text }] },
          taskType: "RETRIEVAL_DOCUMENT",
          title: document.title,
          outputDimensionality: EMBEDDING_DIMENSIONS,
        })),
      },
    );
    const parsed = BatchResponseSchema.safeParse(body);
    if (!parsed.success || parsed.data.embeddings.length !== documents.length) {
      throw AppError.generationFailed("gemini returned an invalid embedding batch");
    }
    return {
      vectors: parsed.data.embeddings.map((item) => normalize(item.values)),
      provider: this.#config.provider,
      model: this.#model,
    };
  }

  async embedQuestion(question: string): Promise<EmbeddingResult> {
    const body = await this.#request(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.#model}:embedContent`,
      {
        model: `models/${this.#model}`,
        content: { parts: [{ text: question }] },
        taskType: "QUESTION_ANSWERING",
        outputDimensionality: EMBEDDING_DIMENSIONS,
      },
    );
    const parsed = SingleResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw AppError.generationFailed("gemini returned an invalid question embedding");
    }
    return {
      vectors: [normalize(parsed.data.embedding.values)],
      provider: this.#config.provider,
      model: this.#model,
    };
  }

  async #request(endpoint: string, body: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await this.#fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.#config.apiKey.reveal(),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (thrown) {
      if (thrown instanceof DOMException && thrown.name === "TimeoutError") {
        throw AppError.providerTimeout("gemini embedding timed out", thrown);
      }
      throw AppError.providerError("gemini embedding was unreachable", thrown);
    }
    if (response.status === 429) {
      throw AppError.providerRateLimited("gemini embedding returned 429");
    }
    if (!response.ok) {
      throw AppError.providerError(`gemini embedding returned ${response.status}`);
    }
    try {
      return await response.json();
    } catch (thrown) {
      throw AppError.generationFailed("gemini embedding response was not JSON", thrown);
    }
  }
}
