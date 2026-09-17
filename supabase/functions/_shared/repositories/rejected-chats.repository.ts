import { z } from "zod";
import type { ServiceClient } from "../db/client.ts";
import { AppError } from "../errors/app-error.ts";
import { classifyPostgresError, toDatabaseError } from "./postgres-errors.ts";

export class RejectedChatsRepository {
  readonly #client: ServiceClient;

  constructor(client: ServiceClient) {
    this.#client = client;
  }

  async claimReply(chatId: number): Promise<boolean> {
    try {
      const { data, error } = await this.#client.rpc("claim_rejected_chat_reply", {
        p_chat_id: chatId,
      });
      if (error !== null) throw classifyPostgresError(error);

      const parsed = z.boolean().safeParse(data);
      if (!parsed.success) {
        throw AppError.internal("claim_rejected_chat_reply did not return a boolean");
      }
      return parsed.data;
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }
}
