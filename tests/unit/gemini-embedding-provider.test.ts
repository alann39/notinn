import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import { Secret } from "../../supabase/functions/_shared/config/env.ts";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import { GeminiEmbeddingProvider } from "../../supabase/functions/_shared/providers/gemini-embedding.provider.ts";

const vector = Array.from(
  { length: 768 },
  (_unused, index) => index === 0 ? 3 : index === 1 ? 4 : 0,
);

function providerWith(
  responder: (input: RequestInfo | URL, init?: RequestInit) => Response,
  embeddingModel: string | null = "gemini-embedding-001",
) {
  return new GeminiEmbeddingProvider({
    provider: "gemini",
    apiKey: new Secret("synthetic-api-key-never-a-credential"),
    model: "gemini-synthetic-flash",
    fallbackModel: null,
    embeddingModel,
    openRouter: null,
  }, {
    fetch: ((input, init) => Promise.resolve(responder(input, init))) as typeof fetch,
  });
}

Deno.test("Gemini batches retrieval documents and normalizes 768-dimensional vectors", async () => {
  let endpoint = "";
  let request: Record<string, unknown> = {};
  const provider = providerWith((input, init) => {
    endpoint = String(input);
    request = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ embeddings: [{ values: vector }, { values: vector }] });
  });

  const result = await provider.embedDocuments([
    { title: "One", text: "First note" },
    { title: "Two", text: "Second note" },
  ]);

  assert(endpoint.endsWith("gemini-embedding-001:batchEmbedContents"));
  assertEquals(result.vectors.length, 2);
  assertEquals(result.vectors[0]?.[0], 0.6);
  assertEquals(result.vectors[0]?.[1], 0.8);
  const requests = request["requests"] as Record<string, unknown>[];
  assertEquals(requests[0]?.["taskType"], "RETRIEVAL_DOCUMENT");
  assertEquals(requests[0]?.["outputDimensionality"], 768);
});

Deno.test("Gemini embeds a question with the question-answering task", async () => {
  let request: Record<string, unknown> = {};
  const provider = providerWith((_input, init) => {
    request = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ embedding: { values: vector } });
  });

  const result = await provider.embedQuestion("What did we decide?");

  assertEquals(request["taskType"], "QUESTION_ANSWERING");
  assertEquals(result.vectors[0]?.[0], 0.6);
});

Deno.test("semantic provider refuses a missing or incompatible configured model", () => {
  for (const model of [null, "gemini-embedding-2"]) {
    assertThrows(() => providerWith(() => Response.json({}), model), AppError);
  }
});

Deno.test("embedding rate limits use the shared provider taxonomy", async () => {
  const provider = providerWith(() => new Response("", { status: 429 }));
  const error = await assertRejects(
    () => provider.embedQuestion("Question"),
    AppError,
  );
  assertEquals(error.code, "provider_rate_limited");
});
