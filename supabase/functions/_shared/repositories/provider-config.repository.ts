import type { ServiceClient } from "../db/client.ts";
import { type AiConfig, Secret } from "../config/env.ts";
import { z } from "zod";

const runtimeProviderSchema = z.array(z.object({
  provider: z.enum(["gemini", "openrouter"]),
  api_key: z.string().nullable(),
  selected_model: z.string().nullable(),
  is_active: z.boolean(),
}));

/** Read fresh configuration for each request so an admin change takes effect. */
export async function resolveProviderConfig(
  client: ServiceClient,
  fallback: AiConfig,
): Promise<AiConfig> {
  const { data, error } = await client.rpc("get_provider_runtime_config");
  if (error) throw error;
  const rows = runtimeProviderSchema.parse(data);
  const gemini = rows.find((row) => row.provider === "gemini");
  const openrouter = rows.find((row) => row.provider === "openrouter");

  return {
    ...fallback,
    apiKey: gemini?.is_active && gemini.api_key ? new Secret(gemini.api_key) : fallback.apiKey,
    model: gemini?.is_active && gemini.selected_model ? gemini.selected_model : fallback.model,
    openRouter: openrouter && !openrouter.is_active
      ? null
      : openrouter?.is_active && (openrouter.api_key || fallback.openRouter)
      ? {
        apiKey: openrouter.api_key ? new Secret(openrouter.api_key) : fallback.openRouter!.apiKey,
        model: openrouter.selected_model ?? fallback.openRouter?.model ?? "openrouter/free",
      }
      : fallback.openRouter,
  };
}
