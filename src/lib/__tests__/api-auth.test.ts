import { describe, it, expect } from "vitest";
import { randomBytes } from "crypto";
import { checkApiKey, generateApiKey } from "../api-auth";

describe("checkApiKey", () => {
  it("is OFF, not open, when no key is configured", () => {
    // "Worked before anyone set it up" is how an endpoint ends up exposed by accident.
    const r = checkApiKey("Bearer anything", null, null);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
      expect(r.reason).toContain("Settings");
    }
  });

  it("accepts the key as a Bearer token", () => {
    expect(checkApiKey("Bearer cpk_abc", null, "cpk_abc").ok).toBe(true);
    // Scheme is case-insensitive per RFC 7235.
    expect(checkApiKey("bearer cpk_abc", null, "cpk_abc").ok).toBe(true);
  });

  it("accepts the key as x-api-key", () => {
    expect(checkApiKey(null, "cpk_abc", "cpk_abc").ok).toBe(true);
  });

  it("prefers the Bearer header when both are sent", () => {
    expect(checkApiKey("Bearer wrong", "cpk_abc", "cpk_abc").ok).toBe(false);
  });

  it("rejects a missing key with guidance and a wrong key without detail", () => {
    const missing = checkApiKey(null, null, "cpk_abc");
    expect(!missing.ok && missing.status).toBe(401);
    expect(!missing.ok && missing.reason).toContain("Authorization: Bearer");
    const wrong = checkApiKey("Bearer nope", null, "cpk_abc");
    expect(!wrong.ok && wrong.status).toBe(401);
    expect(!wrong.ok && wrong.reason).toBe("Invalid API key.");
  });

  it("survives length mismatches — the comparison must never throw", () => {
    expect(checkApiKey("Bearer a", null, "cpk_a_much_longer_stored_key").ok).toBe(false);
  });

  it("treats whitespace-only stored keys as not configured", () => {
    const r = checkApiKey("Bearer x", null, "   ");
    expect(!r.ok && r.status).toBe(403);
  });
});

describe("generateApiKey", () => {
  it("makes recognisable, URL-safe, sufficiently long keys", () => {
    const key = generateApiKey(randomBytes);
    expect(key).toMatch(/^cpk_[A-Za-z0-9_-]{30,}$/);
    expect(generateApiKey(randomBytes)).not.toBe(key);
  });
});
