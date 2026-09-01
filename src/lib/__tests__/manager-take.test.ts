import { describe, expect, it } from "vitest";
import { normalizeTake, parseTakeAmount, takeGuardWarning } from "../manager-take";

describe("parseTakeAmount", () => {
  it("reads the reported take: per-video price times a count", () => {
    expect(parseTakeAmount("i want to offer them 200$ per video for 3 videos")).toEqual({
      total: 600,
      perUnit: 200,
      units: 3,
    });
  });

  it("reads the other ways a manager writes the same thing", () => {
    expect(parseTakeAmount("$250 each for 2 reels")).toMatchObject({ total: 500, units: 2 });
    expect(parseTakeAmount("offer 300 a video, 4x video bundle")).toMatchObject({ total: 1200 });
  });

  it("reads a plain total", () => {
    expect(parseTakeAmount("offer $900 for the bundle")).toMatchObject({ total: 900 });
    expect(parseTakeAmount("go in at 1,250 usd")).toMatchObject({ total: 1250 });
  });

  it("does not mistake a count of videos for a price", () => {
    expect(parseTakeAmount("ask for 3 videos instead of 1")).toBeNull();
  });

  it("returns null when there is no money in the take — silence beats a wrong warning", () => {
    expect(parseTakeAmount("push back on the exclusivity and keep the tone warm")).toBeNull();
  });
});

describe("takeGuardWarning", () => {
  const base = { walkaway: 185, breakeven: null, deliverables: "1 video within 4 weeks", platforms: ["youtube"] };

  it("catches the reported case before the call, and names the real fix", () => {
    const warning = takeGuardWarning({ ...base, take: "offer 200$ per video for 3 videos" });
    expect(warning).toContain("$600");
    expect(warning).toContain("$185");
    expect(warning).toContain("re-run the analysis");
  });

  it("stays silent when the take fits under the ceiling", () => {
    expect(takeGuardWarning({ ...base, take: "offer $150 for the video" })).toBeNull();
  });

  it("uses the lower of walk-away and breakeven, like the guard itself", () => {
    const warning = takeGuardWarning({ ...base, breakeven: 120, take: "offer $150" });
    expect(warning).toContain("$120");
  });

  it("says nothing when the deal has no ceiling to breach yet", () => {
    expect(
      takeGuardWarning({ ...base, walkaway: null, breakeven: null, take: "offer $5,000" })
    ).toBeNull();
  });

  it("says nothing about a take with no number in it", () => {
    expect(takeGuardWarning({ ...base, take: "keep it warm and mention the product" })).toBeNull();
  });
});

describe("normalizeTake", () => {
  it("trims, and caps a runaway paste", () => {
    expect(normalizeTake("  offer $200  ")).toBe("offer $200");
    expect(normalizeTake("x".repeat(900))?.length).toBe(600);
  });

  it("treats empty as no take at all", () => {
    expect(normalizeTake("   ")).toBeNull();
    expect(normalizeTake(null)).toBeNull();
  });
});

describe("takeGuardWarning — the Playbook floor", () => {
  const base = {
    walkaway: 1000,
    breakeven: null,
    deliverables: "1 video",
    platforms: ["youtube"],
    minPaidFee: 300,
  };

  it("catches a take below the minimum paid fee, which the deal page never shows", () => {
    const warning = takeGuardWarning({ ...base, take: "offer exactly $30 for the one video" });
    expect(warning).toContain("$30");
    expect(warning).toContain("$300 minimum paid fee");
    expect(warning).toContain("product and performance");
  });

  it("leaves a take at or above the floor alone", () => {
    expect(takeGuardWarning({ ...base, take: "offer $300" })).toBeNull();
    expect(takeGuardWarning({ ...base, take: "offer $450" })).toBeNull();
  });

  it("does not treat a deliberate no-fee take as being under the floor", () => {
    expect(takeGuardWarning({ ...base, take: "no fee, product and commission only" })).toBeNull();
  });
});
