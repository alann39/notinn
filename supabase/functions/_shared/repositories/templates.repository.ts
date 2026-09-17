import { z } from "zod";
import type { SystemTemplateKey } from "../config/constants.ts";
import type { ServiceClient } from "../db/client.ts";
import { AppError } from "../errors/app-error.ts";
import { classifyPostgresError, toDatabaseError } from "./postgres-errors.ts";

const TemplateRowSchema = z.object({
  template_key: z.string(),
  template_name: z.string(),
  instruction_text: z.string(),
  schema_json: z.object({
    contract: z.string(),
    version: z.number().int().positive(),
    schema: z.record(z.string(), z.unknown()),
  }),
});

export interface GenerationTemplate {
  readonly key: SystemTemplateKey;
  readonly name: string;
  readonly instruction: string;
  readonly contract: string;
  readonly schemaVersion: number;
  readonly responseJsonSchema: Readonly<Record<string, unknown>>;
}

export class TemplatesRepository {
  readonly #client: ServiceClient;

  constructor(client: ServiceClient) {
    this.#client = client;
  }

  async findForGeneration(
    userId: string,
    templateKey: SystemTemplateKey,
  ): Promise<GenerationTemplate> {
    try {
      const { data, error } = await this.#client.rpc("find_template_for_generation", {
        p_user_id: userId,
        p_template_key: templateKey,
      });
      if (error !== null) throw classifyPostgresError(error);

      const rows = Array.isArray(data) ? data : [data];
      const parsed = TemplateRowSchema.safeParse(rows[0]);
      if (!parsed.success) {
        throw AppError.internal("find_template_for_generation returned no usable template");
      }

      return {
        key: parsed.data.template_key as SystemTemplateKey,
        name: parsed.data.template_name,
        instruction: parsed.data.instruction_text,
        contract: parsed.data.schema_json.contract,
        schemaVersion: parsed.data.schema_json.version,
        responseJsonSchema: parsed.data.schema_json.schema,
      };
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  async listSystemLabels(): Promise<ReadonlyMap<string, string>> {
    try {
      const { data, error } = await this.#client
        .from("templates")
        .select("key,name")
        .is("owner_user_id", null)
        .eq("status", "active");
      if (error !== null) throw classifyPostgresError(error);

      const rows = z.array(z.object({ key: z.string(), name: z.string() })).safeParse(data);
      if (!rows.success) {
        throw AppError.internal("templates label query returned an unexpected row shape");
      }
      return new Map(rows.data.map((row) => [row.key, row.name]));
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }
}
