import { describe, expect, it } from "vitest";
import { buildQuery, compareValues, nextDir, sortBy } from "../table-sort";

describe("compareValues", () => {
  it("orders numbers and text in both directions", () => {
    expect(compareValues(1, 2, "asc")).toBeLessThan(0);
    expect(compareValues(1, 2, "desc")).toBeGreaterThan(0);
    expect(compareValues("alice", "bob", "asc")).toBeLessThan(0);
  });

  it("ignores case when comparing names", () => {
    expect(compareValues("alice", "Alice", "asc")).toBe(0);
    expect(compareValues("Bob", "alice", "asc")).toBeGreaterThan(0);
  });

  it("keeps blanks at the bottom whichever way you sort", () => {
    // A deal with no price isn't the cheapest — it's just unknown.
    expect(compareValues(null, 100, "asc")).toBeGreaterThan(0);
    expect(compareValues(null, 100, "desc")).toBeGreaterThan(0);
    expect(compareValues(100, null, "desc")).toBeLessThan(0);
    expect(compareValues("", 5, "asc")).toBeGreaterThan(0);
    expect(compareValues(null, null, "asc")).toBe(0);
  });
});

describe("sortBy", () => {
  const rows = [
    { name: "Gitta", fee: 2800 },
    { name: "hanna", fee: null },
    { name: "Niklas", fee: 2450 },
  ];

  it("sorts without mutating the input", () => {
    const sorted = sortBy(rows, (r) => r.fee, "desc");
    expect(sorted.map((r) => r.name)).toEqual(["Gitta", "Niklas", "hanna"]);
    expect(rows[0].name).toBe("Gitta"); // original untouched
  });

  it("puts the unpriced row last even ascending", () => {
    expect(sortBy(rows, (r) => r.fee, "asc").map((r) => r.name)).toEqual([
      "Niklas",
      "Gitta",
      "hanna",
    ]);
  });
});

describe("nextDir", () => {
  it("starts at descending, then toggles the active column", () => {
    expect(nextDir(false, "asc")).toBe("desc");
    expect(nextDir(true, "desc")).toBe("asc");
    expect(nextDir(true, "asc")).toBe("desc");
  });
});

describe("buildQuery", () => {
  it("keeps existing filters while changing one", () => {
    expect(buildQuery("/pipeline", { platform: "youtube", view: "list" }, { sort: "value" })).toBe(
      "/pipeline?platform=youtube&view=list&sort=value"
    );
  });

  it("drops a cleared filter entirely", () => {
    expect(buildQuery("/pipeline", { platform: "youtube", stage: "agreed" }, { stage: "" })).toBe(
      "/pipeline?platform=youtube"
    );
  });

  it("omits values that are already the default", () => {
    const url = buildQuery("/pipeline", { view: "board", platform: "tiktok" }, {}, { view: "board" });
    expect(url).toBe("/pipeline?platform=tiktok");
  });

  it("returns a bare path when nothing is set", () => {
    expect(buildQuery("/payments", {}, {})).toBe("/payments");
    expect(buildQuery("/payments", { status: "" }, {})).toBe("/payments");
  });
});
