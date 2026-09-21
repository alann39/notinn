import { assert, assertEquals, assertRejects } from "@std/assert";
import { Secret } from "../../supabase/functions/_shared/config/env.ts";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import { FallbackNoteProvider } from "../../supabase/functions/_shared/providers/fallback-note.provider.ts";
import type { LibraryAnswerProvider } from "../../supabase/functions/_shared/providers/library-ai.provider.ts";
import type {
  NoteAIProvider,
  NoteGenerationResult,
} from "../../supabase/functions/_shared/providers/note-ai.provider.ts";
import { OpenRouterNoteProvider } from "../../supabase/functions/_shared/providers/openrouter-note.provider.ts";
import type { GenerationTemplate } from "../../supabase/functions/_shared/repositories/templates.repository.ts";
import { structuredNoteFixture } from "../fixtures/notes/builders.ts";

const template: GenerationTemplate = {
  key: "clean_note",
  name: "Clean Note",
  instruction: "Structure the note.",
  contract: "structured_note",
  schemaVersion: 1,
  responseJsonSchema: { type: "object", required: ["title"] },
};

const request = {
  sourceText: "Ship the draft Friday.",
  template,
  templateKey: "clean_note" as const,
  reason: "initial" as const,
  outputLanguage: null,
};

function openRouterResponse(value: unknown): Response {
  return Response.json({
    id: "or-request-1",
    model: "meta-llama/llama-3.3-70b-instruct:free",
    choices: [{ message: { role: "assistant", content: JSON.stringify(value) } }],
    usage: { prompt_tokens: 17, completion_tokens: 8, total_tokens: 25 },
  });
}

Deno.test("OpenRouter uses the free router with strict structured output and privacy filtering", async () => {
  let body: Record<string, unknown> | null = null;
  let authorization: string | null = null;
  const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    authorization = new Headers(init?.headers).get("authorization");
    return Promise.resolve(openRouterResponse(structuredNoteFixture()));
  }) as typeof fetch;
  const provider = new OpenRouterNoteProvider({
    apiKey: new Secret("synthetic-openrouter-key"),
    model: "openrouter/free",
  }, { fetch: fetchImpl });

  const result = await provider.generateText(request);

  assertEquals(result.provider, "openrouter");
  assertEquals(result.model, "meta-llama/llama-3.3-70b-instruct:free");
  assertEquals(result.providerRequestId, "or-request-1");
  assertEquals(result.inputTokens, 17);
  assertEquals(result.outputTokens, 8);
  assertEquals(authorization, "Bearer synthetic-openrouter-key");
  assert(body !== null);
  assertEquals(body["model"], "openrouter/free");
  assertEquals(body["provider"], { require_parameters: true, data_collection: "deny" });
  const format = body["response_format"] as Record<string, unknown>;
  assertEquals(format["type"], "json_schema");
  const jsonSchema = format["json_schema"] as Record<string, unknown>;
  assertEquals(jsonSchema["strict"], true);
  assert(!JSON.stringify(body).includes("synthetic-openrouter-key"));
});

Deno.test("OpenRouter maps rate limits without exposing the response body", async () => {
  const provider = new OpenRouterNoteProvider({
    apiKey: new Secret("synthetic-openrouter-key"),
    model: "openrouter/free",
  }, { fetch: () => Promise.resolve(new Response("sensitive upstream body", { status: 429 })) });

  const error = await assertRejects(() => provider.generateText(request), AppError);
  assertEquals(error.code, "provider_rate_limited");
  assert(!(error.internalDetail ?? "").includes("sensitive"));
});

type CompleteProvider = NoteAIProvider & LibraryAnswerProvider;

function providerWithText(generateText: () => Promise<NoteGenerationResult>): CompleteProvider {
  const unused = () => Promise.reject(new Error("unused provider method"));
  return {
    generateText,
    generateAudio: unused,
    generateImage: unused,
    generatePdf: unused,
    answerFromEvidence: unused,
  } as CompleteProvider;
}

function result(provider: string): NoteGenerationResult {
  return {
    note: structuredNoteFixture(),
    provider,
    model: `${provider}-model`,
    providerRequestId: null,
    inputTokens: null,
    outputTokens: null,
  };
}

Deno.test("cross-provider fallback runs once after a transient primary failure", async () => {
  let secondaryCalls = 0;
  const provider = new FallbackNoteProvider(
    providerWithText(() => Promise.reject(AppError.providerError("gemini returned 503"))),
    providerWithText(() => {
      secondaryCalls += 1;
      return Promise.resolve(result("openrouter"));
    }),
  );

  const generated = await provider.generateText(request);
  assertEquals(generated.provider, "openrouter");
  assertEquals(secondaryCalls, 1);
});

Deno.test("cross-provider fallback does not hide validation or permanent provider errors", async () => {
  for (
    const primaryError of [
      AppError.outputValidationFailed("malformed candidate"),
      AppError.providerError("gemini returned 400"),
    ]
  ) {
    let secondaryCalls = 0;
    const provider = new FallbackNoteProvider(
      providerWithText(() => Promise.reject(primaryError)),
      providerWithText(() => {
        secondaryCalls += 1;
        return Promise.resolve(result("openrouter"));
      }),
    );

    const error = await assertRejects(() => provider.generateText(request), AppError);
    assertEquals(error, primaryError);
    assertEquals(secondaryCalls, 0);
  }
});
