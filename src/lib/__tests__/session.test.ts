import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  passwordMatches,
  SESSION_TTL_DAYS,
  verifySessionToken,
} from "../session";

const SECRET = "correct horse battery staple";
const NOW = 1_800_000_000_000;

describe("session tokens", () => {
  it("accepts a token it just issued", async () => {
    const token = await createSessionToken(SECRET, NOW);
    expect(await verifySessionToken(token, SECRET, NOW + 1000)).toBe(true);
  });

  it("expires — a session is not forever", async () => {
    const token = await createSessionToken(SECRET, NOW, 30);
    const justBefore = NOW + 30 * 24 * 60 * 60 * 1000 - 1;
    expect(await verifySessionToken(token, SECRET, justBefore)).toBe(true);
    expect(await verifySessionToken(token, SECRET, justBefore + 2)).toBe(false);
  });

  it("cannot have its expiry extended — the expiry is signed", async () => {
    const token = await createSessionToken(SECRET, NOW);
    const [version, expiry, signature] = token.split(".");
    const forged = `${version}.${Number(expiry) + 86_400_000}.${signature}`;
    expect(await verifySessionToken(forged, SECRET, NOW)).toBe(false);
  });

  it("dies when the password changes — the secret is derived from it", async () => {
    const token = await createSessionToken(SECRET, NOW);
    expect(await verifySessionToken(token, "a new password", NOW)).toBe(false);
  });

  it("refuses junk rather than throwing", async () => {
    for (const bad of ["", "nonsense", "v1.notanumber.sig", "v2.123.sig", undefined, null]) {
      expect(await verifySessionToken(bad as string, SECRET, NOW)).toBe(false);
    }
  });

  it("keeps a session for a month, so a deploy does not log you out", () => {
    expect(SESSION_TTL_DAYS).toBe(30);
  });
});

describe("passwordMatches", () => {
  it("accepts the password and rejects near misses", async () => {
    expect(await passwordMatches("hunter2", "hunter2")).toBe(true);
    expect(await passwordMatches("hunter3", "hunter2")).toBe(false);
    expect(await passwordMatches("hunter2 ", "hunter2")).toBe(false);
  });

  it("never accepts anything when no password is configured", async () => {
    expect(await passwordMatches("", "")).toBe(false);
    expect(await passwordMatches("anything", "")).toBe(false);
  });
});
