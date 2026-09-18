import type { ServiceClient } from "../db/client.ts";
import type { UsageOperation } from "../config/constants.ts";
import { classifyPostgresError, toDatabaseError } from "./postgres-errors.ts";

export interface GenerationUsage {
  readonly userId: string;
  readonly jobId: string | null;
  readonly provider: string;
  readonly model: string;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly audioSeconds?: number | null;
  readonly documentPages?: number | null;
  readonly operation?: Extract<UsageOperation, "generation" | "vision">;
  readonly providerRequestId: string | null;
}

export class UsageRepository {
  readonly #client: ServiceClient;

  constructor(client: ServiceClient) {
    this.#client = client;
  }

  async recordGeneration(input: GenerationUsage): Promise<void> {
    try {
      const { error } = await this.#client.from("usage_events").insert({
        user_id: input.userId,
        job_id: input.jobId,
        provider: input.provider,
        model: input.model,
        operation: input.operation ?? "generation",
        input_tokens: input.inputTokens,
        output_tokens: input.outputTokens,
        audio_seconds: input.audioSeconds ?? null,
        document_pages: input.documentPages ?? null,
        provider_request_id: input.providerRequestId,
      });
      if (error !== null) throw classifyPostgresError(error);
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  async recordEmbedding(input: {
    readonly userId: string;
    readonly provider: string;
    readonly model: string;
  }): Promise<void> {
    try {
      const { error } = await this.#client.from("usage_events").insert({
        user_id: input.userId,
        job_id: null,
        provider: input.provider,
        model: input.model,
        operation: "embedding",
        input_tokens: null,
        output_tokens: null,
        provider_request_id: null,
      });
      if (error !== null) throw classifyPostgresError(error);
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }
}
