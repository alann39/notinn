import type { ServiceClient } from "../db/client.ts";
import { classifyPostgresError } from "./postgres-errors.ts";

export class AuthLinkRepository {
  readonly #client: ServiceClient;

  constructor(client: ServiceClient) {
    this.#client = client;
  }

  async createToken(userId: string, nonce: string, expiresAt: Date): Promise<void> {
    const { error } = await this.#client.rpc("create_auth_link_token", {
      p_user_id: userId,
      p_nonce: nonce,
      p_expires_at: expiresAt.toISOString(),
    });
    if (error !== null) throw classifyPostgresError(error);
  }
}
