import { z } from "zod";
import { PRIVACY_MODES, TEMPLATE_KEY_PATTERN } from "../config/constants.ts";
import type { PrivacyMode, TemplateKey } from "../config/constants.ts";
import type { ServiceClient } from "../db/client.ts";
import { AppError } from "../errors/app-error.ts";
import { classifyPostgresError, toDatabaseError } from "./postgres-errors.ts";

export const OUTPUT_LANGUAGES = ["mirror", "id", "en"] as const;
export type OutputLanguage = (typeof OUTPUT_LANGUAGES)[number];

export const PREFERENCE_SETTINGS = [
  "language",
  "privacy",
  "text_template",
  "voice_template",
  "document_template",
] as const;
export type PreferenceSetting = (typeof PREFERENCE_SETTINGS)[number];

const PreferencesRowSchema = z.object({
  output_language: z.enum(OUTPUT_LANGUAGES),
  default_text_template: z.string().regex(TEMPLATE_KEY_PATTERN).nullable(),
  default_voice_template: z.string().regex(TEMPLATE_KEY_PATTERN).nullable(),
  default_document_template: z.string().regex(TEMPLATE_KEY_PATTERN).nullable(),
  privacy_mode: z.enum(PRIVACY_MODES),
});

export interface UserPreferences {
  readonly outputLanguage: OutputLanguage;
  readonly defaultTextTemplate: TemplateKey | null;
  readonly defaultVoiceTemplate: TemplateKey | null;
  readonly defaultDocumentTemplate: TemplateKey | null;
  readonly privacyMode: PrivacyMode;
}

function parsePreferences(data: unknown, functionName: string): UserPreferences {
  const rows = Array.isArray(data) ? data : [data];
  const parsed = PreferencesRowSchema.safeParse(rows[0]);
  if (!parsed.success) {
    throw AppError.internal(`${functionName} returned an unexpected row shape`);
  }
  return {
    outputLanguage: parsed.data.output_language,
    defaultTextTemplate: parsed.data.default_text_template,
    defaultVoiceTemplate: parsed.data.default_voice_template,
    defaultDocumentTemplate: parsed.data.default_document_template,
    privacyMode: parsed.data.privacy_mode,
  };
}

export class UserPreferencesRepository {
  readonly #client: ServiceClient;

  constructor(client: ServiceClient) {
    this.#client = client;
  }

  async get(userId: string): Promise<UserPreferences> {
    try {
      const { data, error } = await this.#client.rpc("get_user_preferences", {
        p_user_id: userId,
      });
      if (error !== null) throw classifyPostgresError(error);
      return parsePreferences(data, "get_user_preferences");
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  async update(
    userId: string,
    setting: PreferenceSetting,
    value: string,
  ): Promise<UserPreferences> {
    try {
      const { data, error } = await this.#client.rpc("update_user_preference", {
        p_user_id: userId,
        p_setting: setting,
        p_value: value,
      });
      if (error !== null) throw classifyPostgresError(error);
      return parsePreferences(data, "update_user_preference");
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }
}
