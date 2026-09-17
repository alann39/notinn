import type { ServiceClient } from "../db/client.ts";
import { classifyPostgresError, toDatabaseError } from "./postgres-errors.ts";

export interface GenerationUsage {
  readonly userId: string;
  readonly jobId: string | null;
  readonly provider: string;
  readonly model: string;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly audioSeconds?: number | null;
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
        operation: "generation",
        input_tokens: input.inputTokens,
        output_tokens: input.outputTokens,
        audio_seconds: input.audioSeconds ?? null,
        provider_request_id: input.providerRequestId,
      });
      if (error !== null) throw classifyPostgresError(error);
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }
}
