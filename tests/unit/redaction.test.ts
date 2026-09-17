import { assert, assertEquals } from "@std/assert";
import {
  digestForLogging,
  REDACTION_PATTERNS,
  redactText,
} from "../../supabase/functions/_shared/observability/redaction.ts";

/**
 * Redaction, rule by rule.
 *
 * Redaction is the backstop behind the logger's field allowlist, not the
 * strategy. It exists because a permitted field can still carry something it
 * should not: a `provider_status` field is innocuous by name and hostile in
 * content if an upstream error string is pasted into it. Each rule is asserted
 * separately here so that a regression names the rule it broke.
 *
 * All values are synthetic. None is a real credential, and none would work.
 *
 * Characters that are invisible or line-terminating — the Unicode separators,
 * the ellipsis in the truncation marker — are built from escape sequences or
 * code points rather than written literally. A literal one is unreadable in
 * review, and a literal line separator in the wrong position terminates the
 * line it appears on.
 */

const MASK = REDACTION_PATTERNS.MASK;
const ELLIPSIS = "…";

// --- Credentials -----------------------------------------------------------

Deno.test("a Telegram bot token is removed", () => {
  const result = redactText("calling with 123456789:AAFakeTokenValueThatIsLongEnoughToMatch");

  assertEquals(result, `calling with ${MASK}`);
  assert(!result.includes("123456789"));
  assert(!result.includes("AAFake"));
});

Deno.test("a Supabase secret key is removed", () => {
  assertEquals(redactText("key=sb_secret_abcdefghijklmnop"), `key=${MASK}`);
  assertEquals(redactText("key=sb_publishable_abcdefgh"), `key=${MASK}`);
});

Deno.test("a JSON Web Token is removed", () => {
  // The legacy Supabase service-role key is a JWT, so this rule covers both.
  const jwt =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlLXBsYWNlaG9sZGVy";
  assertEquals(redactText(`authorization failed for ${jwt}`), `authorization failed for ${MASK}`);
});

Deno.test("a bearer credential is removed along with its scheme", () => {
  assertEquals(redactText("Authorization: Bearer abcdefgh12345678"), `Authorization: ${MASK}`);
  assertEquals(
    redactText("authorization: basic QWxhZGRpbjpvcGVuIHNlc2FtZQ=="),
    `authorization: ${MASK}`,
  );
});

Deno.test("a private key block is removed whole, across its lines", () => {
  const block = [
    "-----BEGIN PRIVATE KEY-----",
    "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQ",
    "-----END PRIVATE KEY-----",
  ].join("\n");

  const result = redactText(`loaded ${block} ok`);

  assertEquals(result, `loaded ${MASK} ok`);
  assert(!result.includes("MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQ"));
});

Deno.test("a long opaque run is removed even when nothing identifies it", () => {
  // A value that looks like random data in a log field is far more likely to be
  // a key than a legitimate value.
  const run = "f3a9c1e0b7d2468851fa3c9e0d7b6a5f4e3d2c1b";
  assertEquals(redactText(`id ${run} seen`), `id ${MASK} seen`);
});

// --- Capability-bearing URLs -----------------------------------------------

Deno.test("a Telegram file URL loses its path, which carries the bot token", () => {
  // Blueprint 16.3: file download URLs contain the bot token and are secrets.
  const url =
    "https://api.telegram.org/file/bot123456789:AAFakeTokenValueThatIsLongEnoughToMatch/voice/file_1.oga";

  const result = redactText(`downloading ${url}`);

  assertEquals(result, `downloading https://api.telegram.org/${MASK}`);
  assert(!result.includes("AAFake"));
  assert(!result.includes("file_1.oga"));
});

Deno.test("a Supabase signed URL loses everything after the host", () => {
  // Possession of the URL is read access to the object.
  const url =
    "https://synthetic.supabase.co/storage/v1/object/sign/notes/report.pdf?token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.c2lnbmF0dXJl";

  const result = redactText(`stored at ${url}`);

  assertEquals(result, `stored at https://synthetic.supabase.co/${MASK}`);
  assert(!result.includes("report.pdf"));
});

Deno.test("the scheme and host survive so a failure is still diagnosable", () => {
  // Redaction that removed everything would make an upstream outage impossible
  // to diagnose, which is why the host is deliberately kept.
  const result = redactText("GET http://localhost:54321/rest/v1/notes failed");
  assert(result.includes("http://localhost:54321"));
});

Deno.test("a URL-shaped value that cannot be parsed is removed entirely", () => {
  // Exercises the fallback in redactUrl: `[not-a-url]` is not a valid IPv6 host,
  // so the URL constructor throws and the whole token goes.
  const result = redactText("see https://[not-a-url]/secret-path");

  assertEquals(result, "see [redacted-url]");
  assert(!result.includes("secret-path"));
});

Deno.test("a URL-shaped value is removed only up to its first whitespace", () => {
  // A known limit, asserted rather than left implicit. The pattern cannot match
  // across whitespace, so a token crafted to contain a space leaves a tail
  // behind. This is acceptable because redaction is the backstop, not the
  // strategy: the field allowlist is what keeps content out of a loggable field
  // in the first place, and a value like this can only arrive through a field
  // that was already permitted and already free of user content.
  const result = redactText("see https://[not a url]/secret-path");

  assertEquals(result, "see [redacted-url] a url]/secret-path");
  assert(!result.includes("https://"));
});

// --- Line integrity --------------------------------------------------------

Deno.test("line breaks are collapsed so a value cannot forge a log entry", () => {
  // A log line is one line. A newline in a value would let a hostile payload
  // write entries that appear to come from the logger itself.
  assertEquals(redactText("first\nsecond"), "first second");
  assertEquals(redactText("a\r\nb"), "a b");
  assertEquals(redactText("a\t\tb"), "a b");
  assertEquals(redactText("trailing space   "), "trailing space");
});

Deno.test("the Unicode line and paragraph separators are collapsed too", () => {
  // These are line terminators to some parsers and invisible in an editor, so
  // they are built from code points rather than written literally.
  const lineSeparator = String.fromCharCode(0x2028);
  const paragraphSeparator = String.fromCharCode(0x2029);

  const result = redactText(`before${lineSeparator}after${paragraphSeparator}end`);

  assertEquals(result, "before after end");
  assert(!result.includes(lineSeparator));
  assert(!result.includes(paragraphSeparator));
});

// --- Truncation ------------------------------------------------------------

Deno.test("a long value is truncated and the omission is stated", () => {
  // 60 repetitions of an 11-character word: 660 characters, 659 once the
  // trailing space is trimmed.
  const input = "abcdefghij ".repeat(60);
  assertEquals(input.length, 660);

  const result = redactText(input);

  assertEquals(result, `${"abcdefghij ".repeat(50).slice(0, 500)}${ELLIPSIS}[truncated 159 chars]`);
  assertEquals(result.slice(0, 500).length, 500);
});

Deno.test("the truncation limit is configurable", () => {
  const result = redactText("abcdefghij ".repeat(60), { maxLength: 20 });
  assert(result.startsWith("abcdefghij abcdefghi"));
  assert(result.includes("[truncated 639 chars]"));
});

Deno.test("a value at the limit exactly is left alone", () => {
  // Built from short words so that no single run reaches the 40 characters that
  // would make it look like an opaque secret; this exercises the length rule in
  // isolation. A 500-character run of one letter would trip the opaque-run rule
  // instead and say nothing about the limit.
  const input = "abcdefghij ".repeat(46).slice(0, 500);
  assertEquals(input.length, 500);

  assertEquals(redactText(input, { maxLength: 500 }), input);
});

// --- Ordering and idempotence ----------------------------------------------

Deno.test("the mask itself is not redacted a second time", () => {
  // Redaction runs on every string field of every line. If the mask were itself
  // a match, a value could be mangled on a second pass.
  assertEquals(
    redactText(redactText("token 123456789:AAFakeTokenValueThatIsLongEnoughToMatch")),
    `token ${MASK}`,
  );
  assertEquals(redactText(MASK), MASK);
});

Deno.test("ordinary values pass through unchanged", () => {
  // Over-redaction is its own failure: an operator who cannot read the logs
  // cannot diagnose anything.
  for (
    const value of [
      "postgres",
      "unique_violation",
      "23505",
      "application/pdf",
      "clean_note",
      "queue is empty",
      "took 1200ms",
    ]
  ) {
    assertEquals(redactText(value), value, `${value} was altered`);
  }
});

Deno.test("an empty string stays empty", () => {
  assertEquals(redactText(""), "");
});

// --- Digests ---------------------------------------------------------------

Deno.test("a digest is short, stable and not the value", async () => {
  const value = "123456789:AAFakeTokenValueThatIsLongEnoughToMatch";

  const digest = await digestForLogging(value);

  assertEquals(digest.length, 12);
  assertEquals(digest, await digestForLogging(value));
  assert(!value.includes(digest));
  assertEquals(/^[0-9a-f]{12}$/.test(digest), true);
});

Deno.test("different values give different digests", async () => {
  const [first, second] = await Promise.all([
    digestForLogging("synthetic-secret-a"),
    digestForLogging("synthetic-secret-b"),
  ]);
  assert(first !== second);
});
