import { describe, expect, it } from "vitest";
import {
  fixedFeeCeiling,
  quantitativeEvidenceRisk,
  recommendationGuardError,
  recommendationProjectionGuardError,
  recommendationReadyLabel,
} from "../recommendation-guard";

describe("fixed-fee recommendation guard", () => {
  it("uses the tighter of walk-away and breakeven", () => {
    expect(fixedFeeCeiling({ walkaway: 5000, breakeven: 2600 })).toBe(2600);
    expect(fixedFeeCeiling({ walkaway: 1800, breakeven: 2600 })).toBe(1800);
  });

  it("treats a known zero breakeven as a no-cash ceiling", () => {
    expect(recommendationGuardError({ proposedOffer: 1, walkaway: 5000, breakeven: 0 })).toContain(
      "$0"
    );
  });

  it("allows an offer at or under the ceiling", () => {
    expect(recommendationGuardError({ proposedOffer: 2600, walkaway: 5000, breakeven: 2600 })).toBeNull();
  });
});

describe("quantitative evidence guard", () => {
  it("uses the structured confidence emitted by new analyses", () => {
    expect(
      quantitativeEvidenceRisk({
        evidenceConfidence: "mixed",
        evidenceNotes: "YouTube is confirmed; Instagram reach is missing.",
      })
    ).toContain("Instagram reach is missing");
    expect(quantitativeEvidenceRisk({ evidenceConfidence: "confirmed" })).toBeNull();
  });

  it("recognises platform/source warnings on legacy analyses", () => {
    expect(
      quantitativeEvidenceRisk({
        redFlags: [
          {
            title: "Report/platform mismatch",
            detail: "The report is YouTube data but the deal is priced as Instagram.",
            severity: "crit",
          },
        ],
      })
    ).toContain("Report/platform mismatch");
  });

  it("blocks projected orders and total commission but allows offer terms", () => {
    const risk = "Instagram reach is missing.";
    expect(
      recommendationProjectionGuardError({
        evidenceRisk: risk,
        draft: "We expect 77 orders and about $3,082 in commission.",
      })
    ).toContain("quantitative performance promise");
    expect(
      recommendationProjectionGuardError({
        evidenceRisk: risk,
        draft: "We can offer a $1,700 fee plus $40 per sale.",
      })
    ).toBeNull();
  });

  it("replaces the drafting label after opening and later-round recommendations", () => {
    expect(recommendationReadyLabel(0, true)).toBe("Opening offer ready");
    expect(recommendationReadyLabel(3, false)).toBe("Round 3 · Recommendation ready");
  });
});
