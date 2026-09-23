/**
 * Magic Link Token generation and verification.
 *
 * Used for Telegram → Web Dashboard account linking.
 * Token format: base64url(JSON({ user_id, nonce, exp })) + "." + hex(HMAC-SHA256)
 */

export interface MagicTokenPayload {
  readonly user_id: string;
  readonly nonce: string;
  readonly exp: number;
}

export interface GeneratedMagicToken {
  readonly token: string;
  readonly nonce: string;
  readonly expiresAt: Date;
}

function base64UrlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  return atob(base64);
}

async function hmacSignHex(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createMagicToken(
  userId: string,
  secret: string,
  ttlMs = 10 * 60 * 1000,
): Promise<GeneratedMagicToken> {
  const nonce = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttlMs);
  const payload: MagicTokenPayload = {
    user_id: userId,
    nonce,
    exp: expiresAt.getTime(),
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signatureHex = await hmacSignHex(secret, payloadB64);
  const token = `${payloadB64}.${signatureHex}`;

  return { token, nonce, expiresAt };
}

export async function verifyMagicToken(
  token: string,
  secret: string,
): Promise<MagicTokenPayload | null> {
  const dotIndex = token.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const payloadB64 = token.slice(0, dotIndex);
  const signatureHex = token.slice(dotIndex + 1);

  const expectedSig = await hmacSignHex(secret, payloadB64);
  if (signatureHex.length !== expectedSig.length) return null;

  let diff = 0;
  for (let i = 0; i < signatureHex.length; i++) {
    diff |= signatureHex.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  if (diff !== 0) return null;

  try {
    const json = base64UrlDecode(payloadB64);
    const parsed = JSON.parse(json);
    if (
      typeof parsed.user_id !== "string" ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    if (Date.now() > parsed.exp) return null;
    return parsed as MagicTokenPayload;
  } catch {
    return null;
  }
}
