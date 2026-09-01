import { describe, expect, it } from "vitest";
import {
  filterExtensionDealOptions,
  latestExtensionRecommendation,
  resolveExtensionIdentity,
  type ExtensionPartnerCandidate,
} from "../extension-context";

describe("filterExtensionDealOptions", () => {
  const deals = [
    {
      id: 12,
      creator: "Jay Abarca",
      partnerName: "Jay",
      partnerId: 1,
      campaign: "Ryoko Travel",
      stage: "negotiating" as const,
    },
    {
      id: 13,
      creator: "Marta Creates",
      partnerName: "Marta",
      partnerId: 2,
      campaign: "Summer Launch",
      stage: "contacted" as const,
    },
  ];

  it("matches every search term across creator, campaign, and stage", () => {
    expect(filterExtensionDealOptions(deals, "jay travel")).toEqual([deals[0]]);
    expect(filterExtensionDealOptions(deals, "marta contacted")).toEqual([deals[1]]);
  });

  it("keeps current deal order and enforces the result limit", () => {
    expect(filterExtensionDealOptions(deals, "", 1)).toEqual([deals[0]]);
  });
});

const partner = (
  partnerId: number,
  liveDeals: ExtensionPartnerCandidate["liveDeals"] = []
): ExtensionPartnerCandidate => ({
  partnerId,
  name: `Creator ${partnerId}`,
  email: `creator${partnerId}@example.com`,
  liveDeals,
});

describe("resolveExtensionIdentity", () => {
  it("refuses to invent a creator when no exact contact matches", () => {
    expect(resolveExtensionIdentity([])).toEqual({ status: "unmatched" });
  });

  it("deduplicates a primary and agency address that belong to the same partner", () => {
    const candidate = partner(1, [{ id: 12, creator: "Creator 1", stage: "negotiating" }]);
    const result = resolveExtensionIdentity([candidate, candidate]);
    expect(result.status).toBe("matched");
    if (result.status === "matched") expect(result.deal.id).toBe(12);
  });

  it("returns the known partner without attaching mail when there is no live deal", () => {
    const result = resolveExtensionIdentity([partner(1)]);
    expect(result.status).toBe("partner_only");
  });

  it("refuses several matched partners or several live deals", () => {
    expect(resolveExtensionIdentity([partner(1), partner(2)]).status).toBe("ambiguous");
    expect(
      resolveExtensionIdentity([
        partner(1, [
          { id: 12, creator: "Creator 1", stage: "negotiating" },
          { id: 13, creator: "Creator 1", stage: "agreed" },
        ]),
      ]).status
    ).toBe("ambiguous");
  });
});

describe("latestExtensionRecommendation", () => {
  it("returns the newest valid Copilot draft and ignores broken historical metadata", () => {
    const valid = JSON.stringify({
      round: 2,
      headline: "Counter inside the guardrail",
      proposedOffer: 2400,
      pills: [],
      reasoning: [],
      drafts: { balanced: "Balanced", warm: "Warm", firm: "Firm" },
    });
    const result = latestExtensionRecommendation([
      { id: 1, sender: "copilot", meta: valid },
      { id: 2, sender: "them", meta: null },
      { id: 3, sender: "copilot", meta: "{broken" },
    ]);
    expect(result).toEqual({
      messageId: 1,
      headline: "Counter inside the guardrail",
      proposedOffer: 2400,
      drafts: { balanced: "Balanced", warm: "Warm", firm: "Firm" },
    });
  });
});
