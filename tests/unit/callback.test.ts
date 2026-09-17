import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  actionToken,
  CALLBACK_ACTIONS,
  decodeCallbackPayload,
  encodeCallbackPayload,
  tryDecodeCallbackPayload,
} from "../../supabase/functions/_shared/schemas/callback.ts";
import {
  SYSTEM_TEMPLATE_KEYS,
  TELEGRAM_MAX_CALLBACK_DATA_BYTES,
} from "../../supabase/functions/_shared/config/constants.ts";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import { ERROR_CODES } from "../../supabase/functions/_shared/errors/taxonomy.ts";

/**
 * The callback codec (blueprint 17.4).
 *
 * Two properties are worth protecting, and they pull in opposite directions.
 *
 * The first is that a payload round-trips: what a button carries is what the
 * handler acts on. A codec that is almost right acts on the wrong note, which is
 * the failure mode with the worst blast radius in the whole system.
 *
 * The second is that a payload that did not come from this codec is refused. The
 * decoder is reachable by any user who can press a button, and callback_data is
 * attacker-controlled in the ordinary sense that a client can send whatever it
 * likes. Every rejection path is asserted here rather than assumed, because a
 * decoder that silently falls back to a default action is a decoder that turns a
 * malformed payload into a database write.
 */

const NOTE_ID = "8f4c1e2a-1234-4abc-89de-0123456789ab";

// --- Round trips ------------------------------------------------------------

Deno.test("every simple action round-trips", () => {
  for (const kind of CALLBACK_ACTIONS) {
    const encoded = encodeCallbackPayload({ action: { kind }, resourceId: NOTE_ID, revision: 0 });
    const decoded = decodeCallbackPayload(encoded);

    assertEquals(decoded.resourceId, NOTE_ID);
    assertEquals(decoded.revision, 0);
    assertEquals(decoded.action, { kind });
  }
});

Deno.test("every template action round-trips", () => {
  // Every system key, not a sample: the longest one is the one that threatens the
  // byte budget, and it is also the one a sample would have missed.
  for (const templateKey of SYSTEM_TEMPLATE_KEYS) {
    const encoded = encodeCallbackPayload({
      action: { kind: "format", templateKey },
      resourceId: NOTE_ID,
      revision: 0,
    });

    assertEquals(decodeCallbackPayload(encoded).action, { kind: "format", templateKey });
  }
});

Deno.test("the payload has blueprint 17.4's shape", () => {
  const encoded = encodeCallbackPayload({
    action: { kind: "save" },
    resourceId: NOTE_ID,
    revision: 7,
  });
  const segments = encoded.split(":");

  assertEquals(segments.length, 4);
  assertEquals(segments[0], "v1");
  assertEquals(segments[1], "save");
  assertEquals(segments[3], "7");
  // The resource is opaque on the wire: the internal id is not written out.
  assert(!encoded.includes(NOTE_ID), "the payload contains the raw note id");
  assertEquals(segments[2]?.length, 22);
});

Deno.test("the resource id survives a UUID in any hex case", () => {
  const upper = NOTE_ID.toUpperCase();
  const encoded = encodeCallbackPayload({
    action: { kind: "show" },
    resourceId: upper,
    revision: 0,
  });

  // Canonical lower-case form out, whichever case went in: the database compares
  // uuids by value, but a mixed-case comparison elsewhere would be a bug waiting.
  assertEquals(decodeCallbackPayload(encoded).resourceId, NOTE_ID);
});

// --- The byte budget --------------------------------------------------------

Deno.test("every payload fits Telegram's 64-byte limit", () => {
  // The reason the resource id is encoded rather than written out. If a future
  // action name or template key breaks this, the failure belongs here and not in
  // a Bot API error at delivery time.
  const actions = [
    ...CALLBACK_ACTIONS.map((kind) => ({ kind }) as const),
    ...SYSTEM_TEMPLATE_KEYS.map((templateKey) => ({ kind: "format", templateKey }) as const),
  ];

  for (const action of actions) {
    const encoded = encodeCallbackPayload({
      action,
      resourceId: NOTE_ID,
      revision: 999_999,
    });

    const bytes = new TextEncoder().encode(encoded).length;
    assert(
      bytes <= TELEGRAM_MAX_CALLBACK_DATA_BYTES,
      `${actionToken(action)} is ${bytes} bytes`,
    );
  }
});

Deno.test("a payload that would not fit is refused rather than truncated", () => {
  // Truncation is the one failure that is worse than an error: a shortened payload
  // can still decode, to a different resource.
  const error = assertThrows(
    () =>
      encodeCallbackPayload({
        action: { kind: "format", templateKey: "extract_and_summarize" },
        resourceId: NOTE_ID,
        // A revision far longer than the decoder accepts, to push past the limit.
        revision: 99_999_999_999,
      }),
    AppError,
  );

  assertEquals(error.code, ERROR_CODES.INTERNAL_ERROR);
});

// --- Rejections -------------------------------------------------------------

Deno.test("a payload with the wrong number of segments is refused", () => {
  for (const value of ["", "v1", "v1:save", "v1:save:abc", "v1:save:abc:0:extra"]) {
    const error = assertThrows(() => decodeCallbackPayload(value), AppError);
    assertEquals(error.code, ERROR_CODES.VALIDATION_FAILED, `${value} was accepted`);
  }
});

Deno.test("an unsupported version is refused rather than reinterpreted", () => {
  // The whole point of carrying a version. A v2 payload must not be read as v1.
  for (const version of ["v2", "V1", "1", ""]) {
    const error = assertThrows(
      () => decodeCallbackPayload(`${version}:save:${base64Resource(NOTE_ID)}:0`),
      AppError,
    );
    assertEquals(error.code, ERROR_CODES.VALIDATION_FAILED, `${version} was accepted`);
  }
});

Deno.test("an action outside the vocabulary is refused", () => {
  // Including the Phase 1 deferred actions: decode must refuse what it cannot
  // serve rather than accept a click and do nothing.
  const notPhaseOne = ["retry", "report", "transcript", "format", "format.custom_key", "Save", ""];

  for (const action of notPhaseOne) {
    const error = assertThrows(
      () => decodeCallbackPayload(`v1:${action}:${base64Resource(NOTE_ID)}:0`),
      AppError,
    );
    assertEquals(error.code, ERROR_CODES.VALIDATION_FAILED, `${action} was accepted`);
  }
});

Deno.test("a resource id that is not a 16-byte UUID is refused", () => {
  const malformed = [
    "not-base64!!",
    "", // 0 bytes
    "AAAA", // 3 bytes
    "AAAAAAAAAAAAAAAAAAAAAAAA", // 18 bytes
  ];

  for (const resource of malformed) {
    const error = assertThrows(
      () => decodeCallbackPayload(`v1:save:${resource}:0`),
      AppError,
    );
    assertEquals(error.code, ERROR_CODES.VALIDATION_FAILED, `${resource} was accepted`);
  }
});

Deno.test("a revision that is not a small integer is refused", () => {
  for (const revision of ["", "-1", "1.5", "abc", "9999999", "1e3"]) {
    const error = assertThrows(
      () => decodeCallbackPayload(`v1:save:${base64Resource(NOTE_ID)}:${revision}`),
      AppError,
    );
    assertEquals(error.code, ERROR_CODES.VALIDATION_FAILED, `${revision} was accepted`);
  }
});

Deno.test("a rejection names the field but never echoes the whole payload", () => {
  // internalDetail reaches a log. A callback payload is not user content, but it is
  // attacker-supplied text, so the rejection says which field failed and not what
  // was in it. Both rejection branches are exercised: a token that is not base64 at
  // all, and one that is valid base64 of the wrong length — the second is the
  // interesting case, because a plausible-looking token gets further along.
  const cases: readonly [string, string][] = [
    ["not*base64!!", "base64url"],
    ["MALICIOUS-OVERSIZED-RESOURCE-TOKEN", "16 bytes"],
  ];

  for (const [resource, expected] of cases) {
    const error = assertThrows(
      () => decodeCallbackPayload(`v1:save:${resource}:0`),
      AppError,
    );

    assertEquals(error.code, ERROR_CODES.VALIDATION_FAILED);
    assert((error.internalDetail ?? "").includes(expected), `${resource}: ${error.internalDetail}`);
    assert(
      !(error.internalDetail ?? "").includes(resource),
      `${resource} was echoed into the error detail`,
    );
  }
});

Deno.test("the non-throwing form returns null instead of a partial payload", () => {
  assertEquals(tryDecodeCallbackPayload("nonsense"), null);
  assertEquals(tryDecodeCallbackPayload(""), null);

  const ok = tryDecodeCallbackPayload(
    encodeCallbackPayload({ action: { kind: "delete" }, resourceId: NOTE_ID, revision: 0 }),
  );
  assertEquals(ok?.action, { kind: "delete" });
});

// --- Logging safety ---------------------------------------------------------

Deno.test("the logged action token is drawn from the closed vocabulary", () => {
  // `callback_action` is on the logger's allowlist, which is only defensible if no
  // user-supplied string can reach it. Every token here is application-owned.
  const tokens = [
    ...CALLBACK_ACTIONS.map((kind) => actionToken({ kind })),
    ...SYSTEM_TEMPLATE_KEYS.map((templateKey) => actionToken({ kind: "format", templateKey })),
  ];

  for (const token of tokens) {
    assert(/^[a-z][a-z0-9_.]*$/.test(token), `${token} is not a plain token`);
  }
  assertEquals(tokens.includes("save"), true);
  assertEquals(tokens.includes("format.short_summary"), true);
});

// --- Helpers ----------------------------------------------------------------

/** The resource segment as the codec writes it, for hand-built payloads. */
function base64Resource(uuid: string): string {
  const encoded = encodeCallbackPayload({
    action: { kind: "show" },
    resourceId: uuid,
    revision: 0,
  });
  return encoded.split(":")[2] as string;
}
