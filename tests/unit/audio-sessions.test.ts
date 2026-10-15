import { assertEquals, assertRejects } from "@std/assert";
import { createClient } from "@supabase/supabase-js";
import type { ServiceClient } from "../../supabase/functions/_shared/db/client.ts";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import {
  AudioSessionsRepository,
  type AudioSessionRow,
  type AudioSessionPartRow,
} from "../../supabase/functions/_shared/repositories/audio-sessions.repository.ts";

const SUPABASE_URL = "https://synthetic.supabase.co";
const SERVICE_ROLE_KEY = "synthetic_service_role_key_abcdefghijklmnop";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const PART_ID_1 = "33333333-3333-4333-8333-333333333331";
const PART_ID_2 = "33333333-3333-4333-8333-333333333332";
const NOTE_ID = "44444444-4444-4444-8444-444444444444";

interface Stub {
  readonly calls: string[];
  readonly lastBody: () => Record<string, unknown>;
}

function stubClient(body: unknown, status = 200): { client: ServiceClient; stub: Stub } {
  const calls: string[] = [];
  let last = "";

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        );

        calls.push(url.pathname);
        if (typeof init?.body === "string") last = init.body;

        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json" },
          }),
        );
      },
    },
  });

  return { client, stub: { calls, lastBody: () => (last ? JSON.parse(last) as Record<string, unknown> : {}) } };
}

Deno.test("AudioSessionsRepository.getSession returns parsed session when found", async () => {
  const sampleSession: AudioSessionRow = {
    id: SESSION_ID,
    user_id: USER_ID,
    template_key: "clean_note",
    output_language: "mirror",
    total_parts: 2,
    total_duration_seconds: 3600,
    total_size_bytes: 80000000,
    status: "recording",
    final_note_id: null,
    error_message: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { client, stub } = stubClient(sampleSession);
  const repo = new AudioSessionsRepository(client);

  const result = await repo.getSession(SESSION_ID);
  assertEquals(stub.calls.length, 1);
  assertEquals(result?.id, SESSION_ID);
  assertEquals(result?.total_parts, 2);
  assertEquals(result?.status, "recording");
});

Deno.test("AudioSessionsRepository.getSession returns null when not found", async () => {
  const { client } = stubClient(null);
  const repo = new AudioSessionsRepository(client);

  const result = await repo.getSession(SESSION_ID);
  assertEquals(result, null);
});

Deno.test("AudioSessionsRepository.getSession throws AppError on corrupt row shape", async () => {
  const corruptSession = {
    id: "not-a-uuid",
    user_id: USER_ID,
  };

  const { client } = stubClient(corruptSession);
  const repo = new AudioSessionsRepository(client);

  const error = await assertRejects(
    async () => {
      await repo.getSession(SESSION_ID);
    },
    AppError,
  );
  assertEquals(error.code, "internal_error");
});

Deno.test("AudioSessionsRepository.getParts returns ordered parts list", async () => {
  const sampleParts: AudioSessionPartRow[] = [
    {
      id: PART_ID_1,
      session_id: SESSION_ID,
      part_number: 1,
      storage_path: `${USER_ID}/${SESSION_ID}_part1.webm`,
      mime_type: "audio/webm",
      size_bytes: 42000000,
      duration_seconds: 1800,
      transcript: "Transcript of part 1.",
      status: "completed",
      error_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: PART_ID_2,
      session_id: SESSION_ID,
      part_number: 2,
      storage_path: `${USER_ID}/${SESSION_ID}_part2.webm`,
      mime_type: "audio/webm",
      size_bytes: 38000000,
      duration_seconds: 1800,
      transcript: null,
      status: "transcribing",
      error_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const { client } = stubClient(sampleParts);
  const repo = new AudioSessionsRepository(client);

  const parts = await repo.getParts(SESSION_ID);
  assertEquals(parts.length, 2);
  assertEquals(parts[0]!.part_number, 1);
  assertEquals(parts[1]!.status, "transcribing");
});

Deno.test("AudioSessionsRepository.updatePartTranscript updates transcript and status", async () => {
  const { client, stub } = stubClient(null);
  const repo = new AudioSessionsRepository(client);

  await repo.updatePartTranscript(PART_ID_1, "New transcript", "completed");
  assertEquals(stub.calls.length, 1);
  const body = stub.lastBody();
  assertEquals(body.transcript, "New transcript");
  assertEquals(body.status, "completed");
});

Deno.test("AudioSessionsRepository.updateSessionStatus updates session with final note ID", async () => {
  const { client, stub } = stubClient(null);
  const repo = new AudioSessionsRepository(client);

  await repo.updateSessionStatus(SESSION_ID, "completed", NOTE_ID);
  assertEquals(stub.calls.length, 1);
  const body = stub.lastBody();
  assertEquals(body.status, "completed");
  assertEquals(body.final_note_id, NOTE_ID);
});

Deno.test("AudioSessionsRepository.isSessionReadyForSynthesis correctly detects completion", async () => {
  const completedParts: AudioSessionPartRow[] = [
    {
      id: PART_ID_1,
      session_id: SESSION_ID,
      part_number: 1,
      storage_path: `${USER_ID}/${SESSION_ID}_part1.webm`,
      mime_type: "audio/webm",
      size_bytes: 40000000,
      duration_seconds: 1800,
      transcript: "Part 1 speech.",
      status: "completed",
      error_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: PART_ID_2,
      session_id: SESSION_ID,
      part_number: 2,
      storage_path: `${USER_ID}/${SESSION_ID}_part2.webm`,
      mime_type: "audio/webm",
      size_bytes: 40000000,
      duration_seconds: 1800,
      transcript: "Part 2 speech.",
      status: "completed",
      error_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const { client } = stubClient(completedParts);
  const repo = new AudioSessionsRepository(client);

  const readiness = await repo.isSessionReadyForSynthesis(SESSION_ID);
  assertEquals(readiness.ready, true);
  assertEquals(readiness.totalParts, 2);
  assertEquals(readiness.completedParts, 2);
  assertEquals(readiness.transcripts, ["Part 1 speech.", "Part 2 speech."]);
});
