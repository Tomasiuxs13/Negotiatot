import { describe, expect, it } from "vitest";
import {
  handleFromProfileUrl,
  normalizeCreatorName,
  normalizeEmail,
  normalizeProfileUrl,
  platformFromValue,
} from "../creator-identity";

describe("creator identity keys", () => {
  it("normalises emails and profile URLs without treating display text as an identity", () => {
    expect(normalizeEmail(" Creator@Example.COM ")).toBe("creator@example.com");
    expect(normalizeEmail("not an email")).toBeNull();
    expect(normalizeProfileUrl("https://www.instagram.com/Creator/?utm_source=list")).toBe("instagram.com/creator");
    expect(normalizeProfileUrl("instagram.com/Creator/")).toBe("instagram.com/creator");
    expect(normalizeProfileUrl("not a profile url")).toBeNull();
  });

  it("derives supported social platforms from provider labels and profile URLs", () => {
    expect(platformFromValue("IG")).toBe("instagram");
    expect(platformFromValue("https://www.youtube.com/@Creator")).toBe("youtube");
    expect(platformFromValue("Twitch")).toBeNull();
    expect(handleFromProfileUrl("https://tiktok.com/@Creator")).toBe("creator");
  });

  it("uses name normalisation only for a clearly labelled possible match", () => {
    expect(normalizeCreatorName("Júlia  Smith!")).toBe("julia smith");
  });
});
