import { assert, assertEquals, assertRejects } from "@std/assert";
import { Secret } from "../../supabase/functions/_shared/config/env.ts";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import { downloadFile, sendDocument } from "../../supabase/functions/_shared/telegram/client.ts";

const TOKEN = "123456789:synthetic-token-that-is-not-a-credential";

function downloader(
  fileResponse: Response,
  inspect?: (url: string, init: RequestInit | undefined, call: number) => void,
) {
  let call = 0;
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    call += 1;
    inspect?.(String(input), init, call);
    if (call === 1) {
      return Promise.resolve(Response.json({
        ok: true,
        result: {
          file_id: "synthetic-file-id",
          file_unique_id: "synthetic-unique-id",
          file_size: 4,
          file_path: "voice/file_1.oga",
        },
      }));
    }
    return Promise.resolve(fileResponse.clone());
  }) as typeof fetch;

  return (maxBytes = 8) =>
    downloadFile(new Secret(TOKEN), "synthetic-file-id", maxBytes, { fetch: fetchImpl });
}

Deno.test("Telegram file retrieval keeps the token URL local and returns only bytes", async () => {
  const urls: string[] = [];
  const result = await downloader(
    new Response(new Uint8Array([1, 2, 3, 4]), {
      headers: { "content-length": "4" },
    }),
    (url) => urls.push(url),
  )();

  assertEquals(result, new Uint8Array([1, 2, 3, 4]));
  assertEquals(urls.length, 2);
  assert(urls[1]?.includes(`/file/bot${TOKEN}/voice/file_1.oga`));
  assert(!JSON.stringify(result).includes(TOKEN));
});

Deno.test("Telegram download refuses a declared body larger than the limit", async () => {
  const error = await assertRejects(
    downloader(new Response(new Uint8Array([1]), { headers: { "content-length": "99" } })),
    AppError,
  );
  assertEquals(error.code, "input_too_large");
});

Deno.test("Telegram download enforces the byte limit while streaming", async () => {
  const error = await assertRejects(
    () => downloader(new Response(new Uint8Array([1, 2, 3, 4, 5])))(4),
    AppError,
  );
  assertEquals(error.code, "input_too_large");
});

Deno.test("an expired Telegram file handle becomes a permanent resend request", async () => {
  const fetchImpl = (() =>
    Promise.resolve(Response.json({
      ok: false,
      error_code: 400,
      description: "Bad Request: wrong file identifier",
    }))) as typeof fetch;

  const error = await assertRejects(
    () =>
      downloadFile(new Secret(TOKEN), "expired-file-id", 8, {
        fetch: fetchImpl,
      }),
    AppError,
  );
  assertEquals(error.code, "file_unavailable");
  assertEquals(error.retryable, false);
  assert(!String(error.internalDetail).includes(TOKEN));
});

Deno.test("Telegram document upload uses multipart data with the requested filename", async () => {
  const capture: { received: FormData | null } = { received: null };
  const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => {
    capture.received = init?.body instanceof FormData ? init.body : null;
    return Promise.resolve(Response.json({ ok: true, result: { message_id: 77 } }));
  }) as typeof fetch;

  const result = await sendDocument(
    new Secret(TOKEN),
    900_000_001,
    new TextEncoder().encode("Synthetic export."),
    "synthetic-note.md",
    "text/markdown;charset=utf-8",
    { caption: "Markdown export from Notinn.", fetch: fetchImpl },
  );

  assertEquals(result, { messageId: 77 });
  assert(capture.received !== null);
  const received = capture.received;
  assertEquals(received.get("chat_id"), "900000001");
  assertEquals(received.get("caption"), "Markdown export from Notinn.");
  const file = received.get("document");
  assert(file instanceof File);
  assertEquals(file.name, "synthetic-note.md");
  assertEquals(file.type, "text/markdown;charset=utf-8");
  assertEquals(await file.text(), "Synthetic export.");
});

Deno.test("Telegram document upload rejects an unsafe filename before network access", async () => {
  let called = false;
  const fetchImpl = (() => {
    called = true;
    return Promise.reject(new Error("must not run"));
  }) as typeof fetch;

  const error = await assertRejects(
    () =>
      sendDocument(
        new Secret(TOKEN),
        900_000_001,
        new Uint8Array([1]),
        "../unsafe.txt",
        "text/plain",
        { fetch: fetchImpl },
      ),
    AppError,
  );
  assertEquals(error.code, "validation_failed");
  assertEquals(called, false);
});
