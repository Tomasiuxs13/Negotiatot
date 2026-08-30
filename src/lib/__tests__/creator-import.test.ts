import { describe, expect, it } from "vitest";
import {
  candidateFromRow,
  detectImportSource,
  suggestHeaderMapping,
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
