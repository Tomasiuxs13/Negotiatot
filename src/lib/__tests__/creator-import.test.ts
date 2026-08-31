import { describe, expect, it } from "vitest";
import {
  candidateFromRow,
  detectImportSource,
  identityConflict,
  identityKeys,
  suggestHeaderMapping,
  type CreatorImportCandidate,
} from "../creator-import";

describe("creator import parsing", () => {
  it("recognises common provider exports and pre-fills their columns", () => {
    const headers = ["Influencer Name", "Business Email", "Profile URL", "Followers", "Average Views", "Engagement Rate", "Creator ID"];
    expect(detectImportSource(headers, "modash-list.csv")).toBe("modash");
    expect(suggestHeaderMapping(headers)).toMatchObject({
      name: "Influencer Name",
      email: "Business Email",
      profileUrl: "Profile URL",
      followers: "Followers",
      avgViews: "Average Views",
      engagementRate: "Engagement Rate",
      externalId: "Creator ID",
    });
    expect(detectImportSource(["AQS", "Influencer"], "export.csv")).toBe("hypeauditor");
  });

  it("normalises identity and parses provider-style audience numbers", () => {
    const candidate = candidateFromRow(
      2,
      {
        Creator: "Júlia Smith",
        Email: "JULIA@EXAMPLE.COM",
        URL: "https://www.instagram.com/JuliaSmith/?utm_source=export",
        Followers: "12,500",
        Views: "1.25M",
        Engagement: "3,4%",
        ID: "mod-42",
      },
      {
        name: "Creator",
        email: "Email",
        profileUrl: "URL",
        followers: "Followers",
        avgViews: "Views",
        engagementRate: "Engagement",
        externalId: "ID",
      },
      "modash"
    );
    expect(candidate).toMatchObject({
      email: "julia@example.com",
      profileUrl: "instagram.com/juliasmith",
      platform: "instagram",
      handle: "juliasmith",
      followers: 12_500,
      avgViews: 1_250_000,
      engagementRate: 3.4,
      sourceRecordId: "mod-42",
    });
  });

  it("keeps a partial manual record usable without inventing a platform", () => {
    const candidate = candidateFromRow(
      1,
      { Name: "Podcast host", Platform: "Spotify" },
      { name: "Name", platform: "Platform" },
      "manual"
    );
    expect(candidate.name).toBe("Podcast host");
    expect(candidate.platform).toBeNull();
  });
});

describe("identityConflict — the 88-of-90 import", () => {
  const emily = (over: Partial<CreatorImportCandidate> = {}) =>
    ({ email: null, handle: null, profileUrl: null, ...over }) as CreatorImportCandidate;

  it("separates two creators who share a first name and nothing else", () => {
    // Both rows were named "Emily"; every other signal said they were different people.
    expect(
      identityConflict(emily({ email: "emilysandiferphoto@gmail.com", handle: "emilysandiferphoto" }), {
        email: "cjellynyc@gmail.com",
        handles: ["chromejelly"],
        urls: [],
      })
    ).toBe(true);
  });

  it("does not separate the same creator re-imported", () => {
    expect(
      identityConflict(emily({ email: "Cjellynyc@Gmail.com ", handle: "@chromejelly" }), {
        email: "cjellynyc@gmail.com",
        handles: ["chromejelly"],
        urls: [],
      })
    ).toBe(false);
  });

  it("stays silent when one side carries no signal of that kind — that is ambiguity, not proof", () => {
    expect(identityConflict(emily({ email: "new@example.com" }), { email: null, handles: [], urls: [] })).toBe(false);
    expect(identityConflict(emily({}), { email: "held@example.com", handles: ["x"], urls: [] })).toBe(false);
  });

  it("catches a conflict on the profile URL alone", () => {
    expect(
      identityConflict(emily({ profileUrl: "https://instagram.com/jayuniversal94" }), {
        email: null,
        handles: [],
        urls: ["https://instagram.com/jaytravelsworld"],
      })
    ).toBe(true);
  });
});

describe("identityKeys", () => {
  const row = (over: Partial<CreatorImportCandidate>) =>
    ({
      source: "spreadsheet",
      sourceRecordId: null,
      email: null,
      handle: null,
      profileUrl: null,
      platform: "instagram",
      ...over,
    }) as CreatorImportCandidate;

  it("never keys on the name — sharing one must stop meaning 'already imported'", () => {
    expect(identityKeys(row({ name: "Emily" } as Partial<CreatorImportCandidate>))).toEqual([]);
  });

  it("keys on what actually identifies a creator", () => {
    const keys = identityKeys(row({ email: "A@Example.com", handle: "@Chromejelly" }));
    expect(keys).toContain("email:a@example.com");
    expect(keys).toContain("handle:instagram:chromejelly");
  });
});
