/**
 * The app's own login, so the deployment can stop relying on an HTTP basic-auth prompt.
 *
 * Basic auth has no session: the browser replays the credentials on every request and
 * re-prompts on any fresh 401 — which happens on every deploy, every browser restart, and
 * every moment the container is between versions. A signed cookie survives all three.
 *
 * One password, one session, because there is one manager. The secret is derived from the
 * password itself, so changing the password invalidates every session that was issued
 * under the old one — which is what you want the moment you change it.
 *
 * Signed, not encrypted: the cookie carries only an expiry, and the signature is what
 * makes it unforgeable. Nothing secret travels in it.
 */

const encoder = new TextEncoder();

export const SESSION_COOKIE = "counterpart_session";
export const SESSION_TTL_DAYS = 30;
const TOKEN_VERSION = "v1";

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(`counterpart.session.${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("base64url");
}

/** `v1.<expiryMs>.<signature>` — the expiry is signed, so it cannot be extended. */
export async function createSessionToken(
  secret: string,
  now: number = Date.now(),
  ttlDays: number = SESSION_TTL_DAYS
): Promise<string> {
  const expiresAt = now + ttlDays * 24 * 60 * 60 * 1000;
  const payload = `${TOKEN_VERSION}.${expiresAt}`;
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload));
  return `${payload}.${toBase64Url(signature)}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
  secret: string,
  now: number = Date.now()
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [version, expiryRaw, signature] = parts;
  if (version !== TOKEN_VERSION) return false;
  const expiresAt = Number(expiryRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;

  // crypto.subtle.verify compares in constant time; a manual string compare would not.
  // Copied into a plain ArrayBuffer: Node's Buffer may be a view over a SharedArrayBuffer,
  // which Web Crypto's types (rightly) refuse.
  let bytes: ArrayBuffer;
  try {
    const decoded = Buffer.from(signature, "base64url");
    const copy = new Uint8Array(decoded.byteLength);
    copy.set(decoded);
    bytes = copy.buffer;
  } catch {
    return false;
  }
  return crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    bytes,
    encoder.encode(`${version}.${expiresAt}`)
  );
}

/**
 * Compares a submitted password without leaking its length or content through timing:
 * both sides are signed first and the digests compared, which are always the same size.
 */
export async function passwordMatches(submitted: string, expected: string): Promise<boolean> {
  if (!expected) return false;
  const key = await hmacKey("counterpart.password.compare");
  const [a, b] = await Promise.all([
    crypto.subtle.sign("HMAC", key, encoder.encode(submitted)),
    crypto.subtle.sign("HMAC", key, encoder.encode(expected)),
  ]);
  return toBase64Url(a) === toBase64Url(b);
}

/**
 * The configured password, or null.
 *
 * Read at call time rather than module load so a restart is all it takes to set one — and
 * so the "not configured" state is a live fact the gate can act on rather than a snapshot.
 */
export function configuredPassword(): string | null {
  const value = process.env.COUNTERPART_PASSWORD;
  return value && value.trim() ? value : null;
}

/**
 * What the gate should do when no password is set.
 *
 * In production: refuse everything. This app is published on the open internet and holds
 * every deal, creator email and contract; an unset password must fail closed, never open.
 * In development it stays open, because a local instance on loopback is not the risk and
 * requiring a password to run the dev server would only get one committed to the repo.
 */
export function authRequired(): boolean {
  return process.env.NODE_ENV === "production";
}
