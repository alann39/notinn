import { assert, assertEquals, assertRejects } from "@std/assert";
import { Secret } from "../../supabase/functions/_shared/config/env.ts";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import { GeminiNoteProvider } from "../../supabase/functions/_shared/providers/gemini-note.provider.ts";
import type { GenerationTemplate } from "../../supabase/functions/_shared/repositories/templates.repository.ts";
import { structuredNoteFixture } from "../fixtures/notes/builders.ts";

const template: GenerationTemplate = {
  key: "clean_note",
  name: "Clean Note",
  instruction: "Correct and structure without unnecessary compression.",
  contract: "structured_note",
  schemaVersion: 1,
  responseJsonSchema: { type: "object", required: ["title"] },
};

function providerWith(
  response: Response,
  inspect?: (init: RequestInit, input: RequestInfo | URL) => void,
) {
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    inspect?.(init ?? {}, input);
    return Promise.resolve(response.clone());
  }) as typeof fetch;

  return new GeminiNoteProvider(
    {
      provider: "gemini",
      apiKey: new Secret("synthetic-api-key-never-a-credential"),
      model: "gemini-synthetic-flash",
    },
    { fetch: fetchImpl },
  );
}

function request() {
  return {
    sourceText: "Catatan campuran: ship the draft hari Jumat.",
    template,
    templateKey: "clean_note" as const,
    reason: "initial" as const,
    outputLanguage: null,
  };
}

function interactionResponse(
  value: unknown,
  options: { inputTokens?: number; outputTokens?: number } = {},
): Response {
  return Response.json({
    id: "synthetic-response-id",
    model: "gemini-synthetic-flash-001",
    status: "completed",
    steps: [{
      type: "model_output",
      content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }],
    }],
    usage: {
      total_input_tokens: options.inputTokens,
      total_output_tokens: options.outputTokens,
    },
  });
}

Deno.test("Gemini receives the stored JSON Schema and returns a validated note", async () => {
  let requestBody: Record<string, unknown> | null = null;
  let apiKey: string | null = null;
  let endpoint = "";
  const note = structuredNoteFixture({ language: "id", summary: "Ringkasan sintetis." });

  const provider = providerWith(
    interactionResponse(note, { inputTokens: 123, outputTokens: 45 }),
    (init, input) => {
      requestBody = JSON.parse(String(init.body)) as Record<string, unknown>;
      apiKey = new Headers(init.headers).get("x-goog-api-key");
      endpoint = String(input);
    },
  );

  const result = await provider.generateText(request());

  assertEquals(result.note.language, "id");
  assertEquals(result.inputTokens, 123);
  assertEquals(result.outputTokens, 45);
  assertEquals(result.providerRequestId, "synthetic-response-id");
  assertEquals(apiKey, "synthetic-api-key-never-a-credential");
  assertEquals(endpoint, "https://generativelanguage.googleapis.com/v1beta/interactions");

  assert(requestBody !== null);
  const captured = requestBody as unknown as Record<string, unknown>;
  const responseFormat = captured["response_format"] as Record<string, unknown>;
  assertEquals(responseFormat["mime_type"], "application/json");
  assertEquals(responseFormat["schema"], template.responseJsonSchema);
  assertEquals(captured["store"], false);
  assertEquals(captured["model"], "gemini-synthetic-flash");
  assert(!JSON.stringify(captured).includes("synthetic-api-key-never-a-credential"));
});

Deno.test("Gemini output with the wrong template key is rejected", async () => {
  const provider = providerWith(
    interactionResponse(structuredNoteFixture({ template_key: "key_points" })),
  );

  const error = await assertRejects(() => provider.generateText(request()), AppError);
  assertEquals(error.code, "output_validation_failed");
});

Deno.test("Gemini prose instead of JSON is rejected before persistence", async () => {
  const provider = providerWith(interactionResponse("Here is your note"));

  const error = await assertRejects(() => provider.generateText(request()), AppError);
  assertEquals(error.code, "output_validation_failed");
});

Deno.test("Gemini rate limiting maps to the retryable provider code", async () => {
  const provider = providerWith(new Response("", { status: 429 }));

  const error = await assertRejects(() => provider.generateText(request()), AppError);
  assertEquals(error.code, "provider_rate_limited");
  assertEquals(error.retryable, true);
});

Deno.test("Gemini receives audio inline and returns transcript plus one validated note", async () => {
  let requestBody: Record<string, unknown> | null = null;
  const note = structuredNoteFixture({ language: "id", summary: "Hasil rapat sintetis." });
  const provider = providerWith(
    interactionResponse({ transcript: "Kita kirim Jumat.", note }, {
      inputTokens: 20,
      outputTokens: 30,
    }),
    (init) => {
      requestBody = JSON.parse(String(init.body)) as Record<string, unknown>;
    },
  );

  const result = await provider.generateAudio({
    audio: new Uint8Array([1, 2, 3, 4]),
    mimeType: "audio/ogg",
    template,
    templateKey: "clean_note",
    outputLanguage: null,
  });

  assertEquals(result.transcript, "Kita kirim Jumat.");
  assertEquals(result.note.summary, "Hasil rapat sintetis.");
  assertEquals(result.inputTokens, 20);
  assertEquals(result.outputTokens, 30);

  assert(requestBody !== null);
  const input = requestBody["input"] as Record<string, unknown>[];
  const inline = input[1] as Record<string, unknown>;
  assertEquals(inline["type"], "audio");
  assertEquals(inline["mime_type"], "audio/ogg");
  assertEquals(inline["data"], "AQIDBA==");
  assert(!JSON.stringify(requestBody).includes("telegram"));
});

Deno.test("Gemini audio output without a transcript is rejected", async () => {
  const provider = providerWith(
    interactionResponse({ note: structuredNoteFixture() }),
  );

  const error = await assertRejects(() =>
    provider.generateAudio({
      audio: new Uint8Array([1]),
      mimeType: "audio/ogg",
      template,
      templateKey: "clean_note",
      outputLanguage: null,
    }), AppError);
  assertEquals(error.code, "output_validation_failed");
});

Deno.test("Gemini receives an image inline and returns extracted source text", async () => {
  let requestBody: Record<string, unknown> | null = null;
  const note = structuredNoteFixture({ summary: "Image summary." });
  const provider = providerWith(
    interactionResponse({ extracted_text: "Visible text", note }),
    (init) => requestBody = JSON.parse(String(init.body)) as Record<string, unknown>,
  );

  const result = await provider.generateImage({
    image: new Uint8Array([1, 2, 3, 4]),
    mimeType: "image/png",
    template,
    templateKey: "clean_note",
    outputLanguage: null,
  });

  assertEquals(result.extractedText, "Visible text");
  assert(requestBody !== null);
  const input = requestBody["input"] as Record<string, unknown>[];
  assertEquals(input[1], {
    type: "image",
    mime_type: "image/png",
    data: "AQIDBA==",
  });
  assertEquals(requestBody["store"], false);
});

Deno.test("Gemini receives a PDF as a document and reports its page count", async () => {
  let requestBody: Record<string, unknown> | null = null;
  const note = structuredNoteFixture({ summary: "PDF summary." });
  const provider = providerWith(
    interactionResponse({ extracted_text: "Document text", page_count: 3, note }),
    (init) => requestBody = JSON.parse(String(init.body)) as Record<string, unknown>,
  );

  const result = await provider.generatePdf({
    pdf: new Uint8Array([1, 2, 3, 4]),
    template,
    templateKey: "clean_note",
    outputLanguage: null,
  });

  assertEquals(result.extractedText, "Document text");
  assertEquals(result.documentPages, 3);
  assert(requestBody !== null);
  const input = requestBody["input"] as Record<string, unknown>[];
  assertEquals(input[0], {
    type: "document",
    mime_type: "application/pdf",
    data: "AQIDBA==",
  });
  assertEquals(requestBody["store"], false);
});
