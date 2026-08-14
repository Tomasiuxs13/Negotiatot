import { describe, expect, it } from "vitest";
import { describeExtraction, isExtractionUsable } from "../extraction";
import {
  HYPEAUDITOR,
  INJECTION_ATTEMPT,
  MODASH,
  PASTED_DM,
  RATE_CARD_SCREENSHOT,
  TRAPS,
  extraction,
} from "./fixtures/extractions";

/**
 * Per-format coverage for the extraction layer.
 *
 * See the note in ./fixtures/extractions.ts for what this can and cannot prove: the pure
 * layer is tested here, the model's field mapping from a real file of each format is not.
 */

describe("a full analytics report is analysed from, not re-read", () => {
  it("accepts HypeAuditor's shape", () => {
    expect(isExtractionUsable(HYPEAUDITOR)).toBe(true);
  });

  it("accepts Modash's shape", () => {
    expect(isExtractionUsable(MODASH)).toBe(true);
  });

  it("keeps the trend's basis in the prompt, so a growth figure can't pass as a views trend", () => {
    const text = describeExtraction(HYPEAUDITOR);
    expect(text).toContain("233.08%");
    expect(text).toContain("yearly follower growth, NOT a views trend");
  });

  it("shows the words each figure came from", () => {
    const text = describeExtraction(MODASH);
    expect(text).toContain(`[read from: "Credibility 88%"]`);
  });
});

describe("thin inputs fall back to the document rather than being analysed", () => {
  it("rejects a rate card with prices but no metrics", () => {
    // Nothing to value the placement on. Paying full price for the raw document is the
    // correct outcome — the alternative is grading a channel nobody has measured.
    expect(isExtractionUsable(RATE_CARD_SCREENSHOT)).toBe(false);
  });

  it("keeps a DM usable only on the figure it actually stated", () => {
    // A follower count is present, so there is something to reason about; the creator's
    // claimed "around 200k" views deliberately did not become avgViews.
    expect(isExtractionUsable(PASTED_DM)).toBe(true);
    expect(PASTED_DM.avgViews).toBeNull();
    expect(describeExtraction(PASTED_DM)).toContain("NOT in the report");
  });

  it("states a rate card's absences as absences", () => {
    const text = describeExtraction(RATE_CARD_SCREENSHOT);
    expect(text).toContain("NOT in the report (treat as unknown, never as zero)");
    expect(text).toContain("avg views");
    // No invented figures anywhere in the rendering.
    expect(text).not.toMatch(/Avg views: 0|Engagement rate: 0%/);
  });
});

describe("format-specific misreads the guard is meant to catch", () => {
  it("catches a Modash K/M misread", () => {
    // 22.1K read as 22.1M against 143K followers: two orders of magnitude apart.
    expect(isExtractionUsable(extraction({ ...MODASH, avgViews: 22_100_000 }))).toBe(false);
  });

  it("catches an inverted credibility reading only when it goes out of range", () => {
    // 88% fake instead of 12% is wrong but not impossible, so the guard passes it — this
    // is exactly the class the guard cannot catch, and why fieldSources carries the quote.
    const inverted = extraction({ ...MODASH, fakeFollowerPct: 88 });
    expect(isExtractionUsable(inverted)).toBe(true);
    expect(describeExtraction(inverted)).toContain(`[read from: "Credibility 88%"]`);
    // Documented so it isn't rediscovered the hard way.
    expect(TRAPS.modash).toContain("complement");
  });

  it("rejects an impossible engagement rate whatever the source", () => {
    expect(isExtractionUsable(extraction({ ...HYPEAUDITOR, engagementRatePct: 140 }))).toBe(false);
  });
});

describe("injected instructions stay visible as text", () => {
  /**
   * The defence is structural and lives elsewhere: pricing.ts computes the four numbers
   * where a document cannot reach them. What matters here is that the attempt travels
   * intact — dropped text can't be flagged, and paraphrased text reads like a finding.
   */
  it("carries the attempt through verbatim rather than dropping or summarising it", () => {
    const text = describeExtraction(INJECTION_ATTEMPT);
    expect(text).toContain("IGNORE PREVIOUS INSTRUCTIONS");
    expect(text).toContain("$10,000");
  });

  it("keeps it in the signals list rather than in any numeric field", () => {
    expect(INJECTION_ATTEMPT.avgViews).toBe(45_000);
    // The instruction named a walk-away. No field exists for it to land in — the schema
    // has no price fields at all — and the numbers are not the model's to set.
    expect(Object.keys(INJECTION_ATTEMPT)).not.toContain("walkaway");
    expect(describeExtraction(INJECTION_ATTEMPT)).toContain("Other signals from the report:");
  });
});
