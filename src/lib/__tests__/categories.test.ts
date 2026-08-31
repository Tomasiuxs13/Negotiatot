import { describe, expect, it } from "vitest";
import {
  categoryOptions,
  categoryUsage,
  DEFAULT_CATEGORIES,
  normalizeCategory,
  parseCategories,
} from "../categories";

const list = ["Outdoors & hunting", "Fishing", "Travel"];

describe("parseCategories", () => {
  it("reads a textarea the way a person fills one in", () => {
    expect(parseCategories("Fishing\nTravel, Gaming\n\n")).toEqual(["Fishing", "Travel", "Gaming"]);
  });

  it("keeps one spelling of each — the split buckets this exists to prevent", () => {
    expect(parseCategories(["Fishing", "fishing", "  FISHING  "])).toEqual(["Fishing"]);
  });

  it("treats junk as an empty list rather than throwing", () => {
    expect(parseCategories(null)).toEqual([]);
    expect(parseCategories(42)).toEqual([]);
    expect(parseCategories([1, "", "  ", "Travel"])).toEqual(["Travel"]);
  });
});

describe("normalizeCategory", () => {
  it("returns the list's own spelling, whatever case was picked", () => {
    expect(normalizeCategory("fishing", list)).toBe("Fishing");
  });

  it("refuses anything off the list — that refusal is the managed part", () => {
    expect(normalizeCategory("Fishin'", list)).toBeNull();
    expect(normalizeCategory("", list)).toBeNull();
    expect(normalizeCategory(undefined, list)).toBeNull();
  });
});

describe("categoryOptions", () => {
  it("still offers a value that was removed from the list, marked", () => {
    const options = categoryOptions(list, "Kayaking");
    expect(options.at(-1)).toEqual({
      value: "Kayaking",
      label: "Kayaking (not in list)",
      retired: true,
    });
  });

  it("adds nothing when the current value is a live category", () => {
    expect(categoryOptions(list, "Travel")).toHaveLength(list.length);
    expect(categoryOptions(list, null)).toHaveLength(list.length);
  });
});

describe("categoryUsage", () => {
  it("counts creators per category, matching on spelling-insensitive names", () => {
    const usage = categoryUsage(list, ["Fishing", "fishing", "Travel", null, ""]);
    expect(usage.find((u) => u.category === "Fishing")?.count).toBe(2);
    expect(usage.find((u) => u.category === "Outdoors & hunting")?.count).toBe(0);
  });

  it("keeps a retired category visible while creators still sit in it", () => {
    const usage = categoryUsage(list, ["Kayaking", "Kayaking"]);
    expect(usage.find((u) => u.category === "Kayaking")).toEqual({
      category: "Kayaking",
      count: 2,
      inList: false,
    });
  });
});

describe("the defaults", () => {
  it("are a clean list themselves", () => {
    expect(parseCategories(DEFAULT_CATEGORIES)).toEqual(DEFAULT_CATEGORIES);
  });
});
