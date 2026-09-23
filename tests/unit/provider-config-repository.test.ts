import { assertEquals, assertRejects } from "@std/assert";
import { type AiConfig, Secret } from "../../supabase/functions/_shared/config/env.ts";
import { resolveProviderConfig } from "../../supabase/functions/_shared/repositories/provider-config.repository.ts";

const fallback: AiConfig = {
  provider: "gemini",
  apiKey: new Secret("env-gemini"),
  model: "gemini-env-model",
  fallbackModel: "gemini-fallback",
  embeddingModel: "gemini-embedding-001",
  openRouter: { apiKey: new Secret("env-openrouter"), model: "openrouter/free" },
};

function client(data: unknown, error: unknown = null) {
  return { rpc: (_name: string) => Promise.resolve({ data, error }) } as never;
}

Deno.test("vaulted keys and selected models override both provider env settings", async () => {
  const config = await resolveProviderConfig(
    client([
      {
        provider: "gemini",
        api_key: "vault-gemini",
        selected_model: "gemini-new",
        is_active: true,
      },
      {
        provider: "openrouter",
        api_key: "vault-openrouter",
        selected_model: "openrouter/free",
        is_active: true,
      },
    ]),
    fallback,
  );
  assertEquals(config.apiKey.reveal(), "vault-gemini");
  assertEquals(config.model, "gemini-new");
  assertEquals(config.openRouter?.apiKey.reveal(), "vault-openrouter");
  assertEquals(config.openRouter?.model, "openrouter/free");
  assertEquals(config.embeddingModel, fallback.embeddingModel);
});

Deno.test("unset vault keys use existing environment credentials", async () => {
  const config = await resolveProviderConfig(
    client([
      { provider: "gemini", api_key: null, selected_model: "gemini-new", is_active: true },
      { provider: "openrouter", api_key: null, selected_model: "openrouter/free", is_active: true },
    ]),
    fallback,
  );
  assertEquals(config.apiKey.reveal(), "env-gemini");
  assertEquals(config.openRouter?.apiKey.reveal(), "env-openrouter");
});

Deno.test("disabled OpenRouter cannot fall back to environment credentials", async () => {
  const config = await resolveProviderConfig(
    client([
      { provider: "openrouter", api_key: null, selected_model: null, is_active: false },
    ]),
    fallback,
  );
  assertEquals(config.openRouter, null);
});

Deno.test("configuration database failures and malformed rows fail closed", async () => {
  await assertRejects(() => resolveProviderConfig(client(null, new Error("db down")), fallback));
  await assertRejects(() =>
    resolveProviderConfig(client([{ provider: "gemini", api_key: 12 }]), fallback)
  );
});
