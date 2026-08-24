import { createHash, timingSafeEqual } from "crypto";

/**
 * The API key check for programmatic endpoints (/api/deals/bulk).
 *
 * The rule is deliberately strict: no key configured means the API is OFF, not open.
 * The app itself has no login (single-user, local), which is fine for pages a browser
 * reaches — but an ingestion endpoint is what an external tool points at, and "worked
 * before anyone set it up" is how an endpoint ends up exposed by accident. Setup is one
 * click in Settings, so the cost of requiring it is nearly zero.
 *
 * Pure: header values and the stored key in, verdict out.
 */
export type ApiAuthResult = { ok: true } | { ok: false; status: 401 | 403; reason: string };

/** Hash both sides so timingSafeEqual gets equal-length buffers whatever the input. */
function matches(candidate: string, stored: string): boolean {
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(stored).digest();
  return timingSafeEqual(a, b);
}

export function checkApiKey(
  authorizationHeader: string | null,
  xApiKeyHeader: string | null,
  storedKey: string | null | undefined
): ApiAuthResult {
  if (!storedKey || !storedKey.trim()) {
    return {
      ok: false,
      status: 403,
      reason: "The API is not set up — generate an API key in Settings → API access.",
    };
  }

  const bearer = authorizationHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const candidate = bearer || xApiKeyHeader?.trim() || "";
  if (!candidate) {
    return {
      ok: false,
      status: 401,
      reason: "Missing API key — send it as 'Authorization: Bearer <key>' or 'x-api-key'.",
    };
  }
  if (!matches(candidate, storedKey.trim())) {
    return { ok: false, status: 401, reason: "Invalid API key." };
  }
  return { ok: true };
}

/** A new key: recognisable prefix, URL-safe, long enough that guessing is not a plan. */
export function generateApiKey(randomBytes: (n: number) => Buffer): string {
  return "cpk_" + randomBytes(24).toString("base64url");
}
