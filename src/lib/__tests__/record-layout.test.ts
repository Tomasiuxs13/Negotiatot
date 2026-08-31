import { describe, expect, it } from "vitest";
import { DEFAULT_RECORD_LAYOUT, parseRecordLayout, RECORD_LAYOUTS } from "../record-layout";

describe("parseRecordLayout", () => {
  it("keeps either real choice", () => {
    expect(parseRecordLayout("classic")).toBe("classic");
    expect(parseRecordLayout("workspace")).toBe("workspace");
  });

  it("falls back rather than rendering nothing — an unreadable setting must not blank a deal", () => {
    expect(parseRecordLayout(null)).toBe(DEFAULT_RECORD_LAYOUT);
    expect(parseRecordLayout("three-columns")).toBe(DEFAULT_RECORD_LAYOUT);
    expect(parseRecordLayout({ layout: "classic" })).toBe(DEFAULT_RECORD_LAYOUT);
  });

  it("offers every value it accepts — a listed option that parses to something else is a trap", () => {
    for (const option of RECORD_LAYOUTS) {
      expect(parseRecordLayout(option.value)).toBe(option.value);
    }
  });
});
