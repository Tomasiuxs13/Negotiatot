import { describe, it, expect } from "vitest";
import { parseDecimal, shortAgo } from "../format";

describe("parseDecimal", () => {
  it("accepts the comma as a decimal mark — the reported case", () => {
    expect(parseDecimal("11,45")).toBe(11.45);
  });

  it("accepts the dot as before", () => {
    expect(parseDecimal("11.45")).toBe(11.45);
    expect(parseDecimal("3.7")).toBe(3.7);
  });

  it("treats commas as thousands separators when both marks appear", () => {
    expect(parseDecimal("1,234.56")).toBe(1234.56);
  });

  it("ignores spaces, including thousands spacing", () => {
    expect(parseDecimal(" 11,45 ")).toBe(11.45);
    expect(parseDecimal("1 234,56")).toBe(1234.56);
  });

  it("rounds to two decimals — more precision in a rate is noise", () => {
    expect(parseDecimal("11,456")).toBe(11.46);
    expect(parseDecimal("3.14159")).toBe(3.14);
  });

  it("returns null for empty input — not provided is not zero", () => {
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("   ")).toBeNull();
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal(undefined)).toBeNull();
  });

  it("refuses garbage instead of half-parsing it", () => {
    // parseFloat would read "11,4abc" as 11 and silently store the wrong number.
    expect(parseDecimal("11,4abc")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("1.2.3")).toBeNull();
  });

  it("handles integers and leading-dot decimals", () => {
    expect(parseDecimal("12")).toBe(12);
    expect(parseDecimal(",5")).toBe(0.5);
    expect(parseDecimal(".5")).toBe(0.5);
  });
});

describe("shortAgo", () => {
  const TODAY = "2026-07-22";

  it("says today rather than 0d — an outreach sent this morning is not stale", () => {
    expect(shortAgo("2026-07-22 08:00:00", TODAY)).toBe("today");
  });

  it("counts whole calendar days, ignoring the time of day", () => {
    expect(shortAgo("2026-07-21 23:30:00", TODAY)).toBe("1d ago");
    expect(shortAgo("2026-07-16 07:00:00", TODAY)).toBe("6d ago");
  });

  it("switches to months once days stop being readable", () => {
    expect(shortAgo("2026-04-22", TODAY)).toBe("3mo ago");
  });

  it("returns null when there is nothing to date — the caller shows no chip", () => {
    expect(shortAgo(null, TODAY)).toBeNull();
    expect(shortAgo("", TODAY)).toBeNull();
  });
});
