import { describe, expect, it } from "vitest";
import {
  addedWithin,
  DEFAULT_PARTNER_COLUMNS,
  PARTNER_COLUMNS,
  parseAddedRange,
  parseColumns,
} from "../partner-columns";

describe("parseColumns", () => {
  it("keeps a valid selection, in catalogue order", () => {
    expect(parseColumns(["paid", "category", "name"])).toEqual(["name", "category", "paid"]);
  });

  it("never returns a table you cannot read — name survives every input", () => {
    expect(parseColumns(["paid"])).toContain("name");
    expect(parseColumns([])).toEqual(DEFAULT_PARTNER_COLUMNS);
    expect(parseColumns(null)).toEqual(DEFAULT_PARTNER_COLUMNS);
    expect(parseColumns(["nonsense"])).toEqual(DEFAULT_PARTNER_COLUMNS);
  });

  it("drops unknown keys rather than rendering a blank column", () => {
    expect(parseColumns(["name", "category", "salary"])).toEqual(["name", "category"]);
  });

  it("de-duplicates", () => {
    expect(parseColumns(["name", "name", "email"])).toEqual(["name", "email"]);
  });
});

describe("addedWithin", () => {
  const today = "2026-08-31";

  it("passes everything when no range is chosen", () => {
    expect(addedWithin("2020-01-01", "", today)).toBe(true);
  });

  it("counts whole days back, so the hour of an import does not decide it", () => {
    expect(addedWithin("2026-08-31 23:59:00", "7d", today)).toBe(true);
    expect(addedWithin("2026-08-25 00:01:00", "7d", today)).toBe(true);
    expect(addedWithin("2026-08-24 23:59:00", "7d", today)).toBe(false);
  });

  it("excludes a record with no date rather than guessing it is recent", () => {
    expect(addedWithin(null, "30d", today)).toBe(false);
  });
});

describe("the catalogue", () => {
  it("offers a label for every key, and standard columns are a subset", () => {
    for (const column of PARTNER_COLUMNS) expect(column.label.length).toBeGreaterThan(0);
    expect(DEFAULT_PARTNER_COLUMNS.every((key) => PARTNER_COLUMNS.some((c) => c.key === key))).toBe(true);
  });

  it("accepts only the ranges it offers", () => {
    expect(parseAddedRange("30d")).toBe("30d");
    expect(parseAddedRange("all-time")).toBe("");
  });
});
