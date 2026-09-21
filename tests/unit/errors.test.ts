import { assert, assertEquals, assertNotEquals } from "@std/assert";
import {
  AppError,
  isAppError,
  toAppError,
} from "../../supabase/functions/_shared/errors/app-error.ts";
import {
  acceptedResponse,
  emptyResponse,
  errorResponse,
  httpStatusForError,
} from "../../supabase/functions/_shared/errors/http.ts";
import {
  allErrorCodes,
  definitionFor,
  ERROR_CODES,
} from "../../supabase/functions/_shared/errors/taxonomy.ts";

/**
 * The error taxonomy and its HTTP mapping.
 *
 * The property worth protecting is stated in one sentence: an internal detail
 * must not be able to reach a user or a log through any of the ordinary ways an
 * error gets handled. That is asserted here from several directions —
 * `.message`, template interpolation, and whole-object serialisation — because
 * each is a separate accident waiting to happen.
 */

/** A stand-in for the kind of detail a database error carries. */
const SENSITIVE_DETAIL =
  'duplicate key value violates unique constraint "notes_pkey" (source_text="SYNTHETIC USER CONTENT")';

// --- Taxonomy totality -----------------------------------------------------

Deno.test("every error code has a definition", () => {
  const codes = allErrorCodes();

  // Uniqueness, not a count. The count is a moving target that a legitimate new
  // code would have to update; two keys sharing a value is a real defect that
  // would silently make one of them unreachable.
  assertEquals(new Set(codes).size, codes.length, "two codes share a value");

  for (const code of codes) {
    const definition = definitionFor(code);
    assert(definition !== undefined, `${code} has no definition`);
    assertEquals(definition.publicMessage.length > 0, true, `${code} has no public message`);
  }
});

Deno.test("every public message is a plain sentence", () => {
  // These are shown to a user verbatim. A newline would break a Telegram reply,
  // and a long one would crowd out the note itself.
  for (const code of allErrorCodes()) {
    const { publicMessage } = definitionFor(code);
    assert(!publicMessage.includes("\n"), `${code} public message spans lines`);
    assert(publicMessage.length <= 160, `${code} public message is ${publicMessage.length} chars`);
  }
});

Deno.test("no public message names an implementation detail", () => {
  // A user should never be told which database, provider or framework failed.
  const forbidden = [
    "postgres",
    "supabase",
    "gemini",
    "postgrest",
    "sqlstate",
    "constraint",
    "null",
    "undefined",
    "http",
    "jwt",
    "token",
  ];

  for (const code of allErrorCodes()) {
    const lowered = definitionFor(code).publicMessage.toLowerCase();
    for (const term of forbidden) {
      assert(!lowered.includes(term), `${code} public message mentions "${term}"`);
    }
  }
});

Deno.test("retryability is distributed as the Blueprint's state machine needs", () => {
  // Blueprint 14 splits a failure into RETRYABLE_FAILED and FAILED. If nothing
  // were retryable there would be no retries; if everything were, a permanently
  // broken note would be retried forever.
  const retryable = allErrorCodes().filter((code) => definitionFor(code).retryable);
  const permanent = allErrorCodes().filter((code) => !definitionFor(code).retryable);

  assert(retryable.length > 0, "no error is retryable");
  assert(permanent.length > 0, "every error is retryable");
});

Deno.test("a caller's mistake is never retryable and an infrastructure fault always is", () => {
  assertEquals(definitionFor(ERROR_CODES.VALIDATION_FAILED).retryable, false);
  assertEquals(definitionFor(ERROR_CODES.UNAUTHORIZED).retryable, false);
  assertEquals(definitionFor(ERROR_CODES.UNSUPPORTED_INPUT).retryable, false);
  assertEquals(definitionFor(ERROR_CODES.DATABASE_ERROR).retryable, true);
  assertEquals(definitionFor(ERROR_CODES.STORAGE_ERROR).retryable, true);
  assertEquals(definitionFor(ERROR_CODES.PROVIDER_TIMEOUT).retryable, true);
});

// --- AppError: the detail never escapes ------------------------------------

Deno.test("the message of an AppError is its public sentence, never the detail", () => {
  const error = AppError.database(SENSITIVE_DETAIL);

  assertEquals(error.message, definitionFor(ERROR_CODES.DATABASE_ERROR).publicMessage);
  assert(!error.message.includes("SYNTHETIC USER CONTENT"));
  assertEquals(error.internalDetail, SENSITIVE_DETAIL);
});

Deno.test("interpolating an AppError produces the public sentence", () => {
  // `"failed: " + err` and `` `failed: ${err}` `` are the two commonest ways a
  // detail reaches a log by accident.
  const error = AppError.database(SENSITIVE_DETAIL);

  assert(!`${error}`.includes("SYNTHETIC USER CONTENT"));
  assert(!String(error).includes("SYNTHETIC USER CONTENT"));
  assert(!("" + error).includes("SYNTHETIC USER CONTENT"));
});

Deno.test("serialising an AppError as a whole does not carry the detail", () => {
  // `JSON.stringify(error)` and `{ ...error }` walk enumerable own properties.
  // Both are plausible in a crash reporter or a catch-all log line, and both
  // would otherwise publish a PostgreSQL message that may quote user content.
  const error = AppError.database(SENSITIVE_DETAIL);

  const serialised = JSON.stringify(error);
  assert(!serialised.includes("SYNTHETIC USER CONTENT"), serialised);
  assert(!JSON.stringify({ ...error }).includes("SYNTHETIC USER CONTENT"));

  // The safe fields survive, because they are what makes the error useful.
  assertEquals(JSON.parse(serialised).code, ERROR_CODES.DATABASE_ERROR);
  assertEquals(JSON.parse(serialised).retryable, true);
});

Deno.test("the detail survives the round trip when it is asked for by name", () => {
  // The protection above must not have cost the operator the ability to debug.
  const error = AppError.database(SENSITIVE_DETAIL);
  assertEquals(error.internalDetail, SENSITIVE_DETAIL);
  assertEquals(Object.getOwnPropertyDescriptor(error, "internalDetail")?.enumerable, false);
});

Deno.test("an AppError with no detail has an undefined one, not an empty string", () => {
  assertEquals(AppError.internal().internalDetail, undefined);
});

Deno.test("the cause is preserved for the operator without being enumerable", () => {
  const original = new Error("synthetic upstream failure");
  const error = AppError.database("wrapped", original);

  assertEquals(error.cause, original);
  assert(!JSON.stringify(error).includes("synthetic upstream failure"));
});

Deno.test("an AppError is an Error and reports its own name", () => {
  const error = AppError.validation("bad payload");

  assertEquals(error instanceof Error, true);
  assertEquals(error.name, "AppError");
  assertEquals(isAppError(error), true);
  assertEquals(isAppError(new Error("plain")), false);
  assertEquals(isAppError("a string"), false);
  assertEquals(isAppError(null), false);
});

Deno.test("each factory sets the code it is named for", () => {
  assertEquals(AppError.validation().code, ERROR_CODES.VALIDATION_FAILED);
  assertEquals(AppError.unsupportedInput().code, ERROR_CODES.UNSUPPORTED_INPUT);
  assertEquals(AppError.inputTooLarge().code, ERROR_CODES.INPUT_TOO_LARGE);
  assertEquals(AppError.inputTooLong().code, ERROR_CODES.INPUT_TOO_LONG);
  assertEquals(AppError.fileUnavailable().code, ERROR_CODES.FILE_UNAVAILABLE);
  assertEquals(AppError.unauthorized().code, ERROR_CODES.UNAUTHORIZED);
  assertEquals(AppError.userNotActive().code, ERROR_CODES.USER_NOT_ACTIVE);
  assertEquals(AppError.quotaExceeded().code, ERROR_CODES.QUOTA_EXCEEDED);
  assertEquals(AppError.dailyQuotaExceeded().code, ERROR_CODES.DAILY_QUOTA_EXCEEDED);
  assertEquals(AppError.retriesExhausted().code, ERROR_CODES.RETRIES_EXHAUSTED);
  assertEquals(AppError.providerError().code, ERROR_CODES.PROVIDER_ERROR);
  assertEquals(AppError.providerTimeout().code, ERROR_CODES.PROVIDER_TIMEOUT);
  assertEquals(AppError.providerRateLimited().code, ERROR_CODES.PROVIDER_RATE_LIMITED);
  assertEquals(AppError.telegramError().code, ERROR_CODES.TELEGRAM_ERROR);
  assertEquals(AppError.generationFailed().code, ERROR_CODES.GENERATION_FAILED);
  assertEquals(AppError.outputValidationFailed().code, ERROR_CODES.OUTPUT_VALIDATION_FAILED);
  assertEquals(AppError.deliveryFailed().code, ERROR_CODES.DELIVERY_FAILED);
  assertEquals(AppError.configuration("x").code, ERROR_CODES.CONFIGURATION_ERROR);
  assertEquals(AppError.database().code, ERROR_CODES.DATABASE_ERROR);
  assertEquals(AppError.internal().code, ERROR_CODES.INTERNAL_ERROR);
});

// --- toAppError ------------------------------------------------------------

Deno.test("toAppError passes a classified error through untouched", () => {
  const original = AppError.unauthorized("bad secret");
  assertEquals(toAppError(original), original);
});

Deno.test("toAppError keeps an unexpected Error's text as internal detail only", () => {
  const original = new TypeError("Cannot read properties of undefined (reading 'x')");
  const converted = toAppError(original);

  assertEquals(converted.code, ERROR_CODES.INTERNAL_ERROR);
  assertEquals(converted.message, definitionFor(ERROR_CODES.INTERNAL_ERROR).publicMessage);
  assertEquals(converted.internalDetail, `TypeError: ${original.message}`);
  assertEquals(converted.cause, original);
  assert(!JSON.stringify(converted).includes("Cannot read properties"));
});

Deno.test("toAppError classifies the non-Error values JavaScript can throw", () => {
  // `throw "something"` and `throw undefined` are legal, and a webhook that only
  // handled Error would crash on the way to reporting the crash.
  assertEquals(toAppError("synthetic thrown string").code, ERROR_CODES.INTERNAL_ERROR);
  assertEquals(toAppError(undefined).code, ERROR_CODES.INTERNAL_ERROR);
  assertEquals(toAppError(null).code, ERROR_CODES.INTERNAL_ERROR);
  assertEquals(toAppError({ odd: true }).code, ERROR_CODES.INTERNAL_ERROR);
  assertEquals(
    toAppError("synthetic thrown string").internalDetail,
    "non-error thrown: synthetic thrown string",
  );
});

// --- HTTP mapping ----------------------------------------------------------

Deno.test("an unauthenticated request is answered 401", () => {
  assertEquals(httpStatusForError(AppError.unauthorized()), 401);
});

Deno.test("a retryable error is answered 5xx so Telegram redelivers", () => {
  // Redelivery is safe because update_id deduplication makes it a no-op. This is
  // what turns a transient database failure into a late note rather than a lost
  // one, so it is worth pinning.
  assertEquals(httpStatusForError(AppError.database()), 500);
  assertEquals(
    httpStatusForError(new AppError(ERROR_CODES.PROVIDER_RATE_LIMITED)),
    500,
  );
});

Deno.test("a non-retryable error is answered 200 so Telegram stops retrying", () => {
  // The payload will not parse better on a second attempt. The error is logged
  // at error level, which is the actual alerting path.
  assertEquals(httpStatusForError(AppError.validation()), 200);
  assertEquals(httpStatusForError(AppError.unsupportedInput()), 200);
  assertEquals(httpStatusForError(AppError.configuration("x")), 200);
});

Deno.test("the status Telegram receives is not the taxonomy's HTTP status", () => {
  // validation_failed declares 400 because that is what it means over HTTP in
  // general. Telegram's retry semantics override it at this boundary. Asserting
  // the difference keeps a future "simplification" from conflating the two.
  assertEquals(definitionFor(ERROR_CODES.VALIDATION_FAILED).httpStatus, 400);
  assertNotEquals(httpStatusForError(AppError.validation()), 400);
});

Deno.test("no error response carries a body", () => {
  // Blueprint 17.1: the endpoint must never expose job internals or provider
  // errors to the caller. An empty body cannot.
  for (const code of allErrorCodes()) {
    const response = errorResponse(new AppError(code));
    assertEquals(response.body, null, `${code} produced a body`);
  }
});

Deno.test("the acknowledgement reveals nothing but acceptance", async () => {
  const response = acceptedResponse();

  assertEquals(response.status, 200);
  assertEquals(await response.text(), '{"ok":true}');
  assertEquals(response.headers.get("content-type"), "application/json; charset=utf-8");
});

Deno.test("webhook responses are never cached", () => {
  // A cached acknowledgement would let a redelivery be answered from a proxy
  // without ever reaching the function.
  assertEquals(acceptedResponse().headers.get("cache-control"), "no-store");
  assertEquals(emptyResponse(500).headers.get("cache-control"), "no-store");
});
