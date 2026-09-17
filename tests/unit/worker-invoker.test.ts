import { assert, assertEquals, assertRejects } from "@std/assert";
import { Secret } from "../../supabase/functions/_shared/config/env.ts";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import { invokeWorker } from "../../supabase/functions/_shared/worker/invoker.ts";

const SECRET = "synthetic-worker-secret-at-least-32-characters";
const JOB_ID = "22222222-2222-4222-8222-222222222222";

Deno.test("the background worker invocation carries only an opaque job id", async () => {
  let url = "";
  let init: RequestInit | undefined;
  const fetchImpl = ((input: RequestInfo | URL, inputInit?: RequestInit) => {
    url = String(input);
    init = inputInit;
    return Promise.resolve(Response.json({ accepted: true }));
  }) as typeof fetch;

  await invokeWorker(
    "https://synthetic.supabase.co",
    new Secret(SECRET),
    JOB_ID,
    fetchImpl,
  );

  assertEquals(url, "https://synthetic.supabase.co/functions/v1/process-job");
  assert(init !== undefined);
  assertEquals(new Headers(init.headers).get("X-Notinn-Worker-Secret"), SECRET);
  assertEquals(JSON.parse(String(init.body)), { job_id: JOB_ID, trigger: "immediate" });
  assertEquals(String(init.body).includes("file"), false);
  assertEquals(String(init.body).includes("source"), false);
});

Deno.test("a refused background worker invocation is visible to recovery logic", async () => {
  const fetchImpl = (() => Promise.resolve(new Response(null, { status: 503 }))) as typeof fetch;

  const error = await assertRejects(
    () =>
      invokeWorker(
        "https://synthetic.supabase.co",
        new Secret(SECRET),
        JOB_ID,
        fetchImpl,
      ),
    AppError,
  );
  assertEquals(error.code, "internal_error");
  assertEquals(error.internalDetail, "background worker invocation returned 503");
  assert(!String(error.internalDetail).includes(SECRET));
});
