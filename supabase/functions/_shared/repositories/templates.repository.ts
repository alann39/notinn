import { z } from "zod";
import type { InputType, TemplateKey } from "../config/constants.ts";
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

const AvailableTemplateRowSchema = z.object({
  template_key: z.string(),
  template_name: z.string(),
  is_custom: z.boolean(),
  applicable_input_types: z.array(z.string()),
});

export interface GenerationTemplate {
  readonly key: TemplateKey;
  readonly name: string;
  readonly instruction: string;
  readonly contract: string;
  readonly schemaVersion: number;
  readonly responseJsonSchema: Readonly<Record<string, unknown>>;
}

export interface AvailableTemplate {
  readonly key: TemplateKey;
  readonly name: string;
  readonly isCustom: boolean;
  readonly applicableInputTypes: readonly InputType[];
}

export type ArchiveTemplateOutcome = "archived" | "not_found" | "in_use";

export class TemplatesRepository {
  readonly #client: ServiceClient;

  constructor(client: ServiceClient) {
    this.#client = client;
  }

  async findForGeneration(
    userId: string,
    templateKey: TemplateKey,
    inputType: InputType,
  ): Promise<GenerationTemplate> {
    try {
      const { data, error } = await this.#client.rpc("find_template_for_generation", {
        p_user_id: userId,
        p_template_key: templateKey,
        p_input_type: inputType,
      });
      if (error !== null) throw classifyPostgresError(error);

      const rows = Array.isArray(data) ? data : [data];
      const parsed = TemplateRowSchema.safeParse(rows[0]);
      if (!parsed.success) {
        throw AppError.internal("find_template_for_generation returned no usable template");
      }

      return {
        key: parsed.data.template_key,
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

  async listAvailable(
    userId: string,
    inputType: InputType | null = null,
  ): Promise<readonly AvailableTemplate[]> {
    try {
      const { data, error } = await this.#client.rpc("list_available_templates", {
        p_user_id: userId,
        p_input_type: inputType,
      });
      if (error !== null) throw classifyPostgresError(error);

      const rows = z.array(AvailableTemplateRowSchema).safeParse(data ?? []);
      if (!rows.success) {
        throw AppError.internal("list_available_templates returned an unexpected row shape");
      }
      return rows.data.map((row) => ({
        key: row.template_key,
        name: row.template_name,
        isCustom: row.is_custom,
        applicableInputTypes: row.applicable_input_types as InputType[],
      }));
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  async listLabels(
    userId: string,
    inputType: InputType | null = null,
  ): Promise<ReadonlyMap<string, string>> {
    const templates = await this.listAvailable(userId, inputType);
    return new Map(templates.map((template) => [template.key, template.name]));
  }

  async createCustom(
    userId: string,
    name: string,
    instruction: string,
    inputTypes: readonly InputType[],
  ): Promise<AvailableTemplate> {
    try {
      const { data, error } = await this.#client.rpc("create_custom_template", {
        p_user_id: userId,
        p_name: name,
        p_instruction_text: instruction,
        p_input_types: [...inputTypes],
      });
      if (error !== null) throw classifyPostgresError(error);
      const rows = Array.isArray(data) ? data : [data];
      const parsed = AvailableTemplateRowSchema.safeParse(rows[0]);
      if (!parsed.success) {
        throw AppError.internal("create_custom_template returned no usable template");
      }
      return {
        key: parsed.data.template_key,
        name: parsed.data.template_name,
        isCustom: parsed.data.is_custom,
        applicableInputTypes: parsed.data.applicable_input_types as InputType[],
      };
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  async archiveCustom(userId: string, templateKey: string): Promise<ArchiveTemplateOutcome> {
    try {
      const { data, error } = await this.#client.rpc("archive_custom_template", {
        p_user_id: userId,
        p_template_key: templateKey,
      });
      if (error !== null) throw classifyPostgresError(error);
      const parsed = z.enum(["archived", "not_found", "in_use"]).safeParse(data);
      if (!parsed.success) {
        throw AppError.internal("archive_custom_template returned an unexpected outcome");
      }
      return parsed.data;
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }
}
