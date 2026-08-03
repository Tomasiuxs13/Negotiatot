import { describe, it, expect } from "vitest";
import {
  addDaysUtc,
  calendarEntries,
  dayGap,
  isInMonth,
  landsOn,
  monthGrid,
  monthLabel,
  shiftMonth,
  spacingConflicts,
} from "../content-calendar";
import type { ContentRow } from "../content-queue";
import type { ContentItem } from "../fulfillment-types";

const item = (over: Partial<ContentItem> = {}): ContentItem => ({
  id: 1,
  deal_id: 10,
  title: "YouTube integration",
  platform: "youtube",
  due_date: null,
  due_rule: null,
  due_days_after_delivery: null,
  status: "planned",
  posted_url: null,
  posted_at: null,
  actuals_measured_at: null,
  actual_views: null,
  actual_clicks: null,
  actual_orders: null,
  actual_revenue: null,
  notes: null,
  created_at: "2026-07-01 09:00:00",
  updated_at: "2026-07-01 09:00:00",
  ...over,
});

const row = (over: Partial<ContentItem> = {}, creator = "TheOldCoupleOutdoors"): ContentRow => ({
  item: item(over),
  dealId: 10,
  creator,
  campaign: null,
  platform: "youtube",
  blockedBy: [],
  awaitingProduct: null,
});

describe("landsOn", () => {
  it("uses the real publication date once posted, not what was agreed", () => {
    // The calendar should show what happened, not what was promised.
    expect(landsOn(item({ status: "posted", due_date: "2026-08-20", posted_at: "2026-08-23" }))).toBe(
      "2026-08-23"
    );
  });

  it("falls back to the agreed date when a posted item was never stamped", () => {
    expect(landsOn(item({ status: "posted", due_date: "2026-08-20", posted_at: null }))).toBe(
      "2026-08-20"
    );
  });

  it("uses the agreed date for anything not yet live", () => {
    expect(landsOn(item({ status: "approved", due_date: "2026-08-20" }))).toBe("2026-08-20");
    expect(landsOn(item())).toBeNull();
  });
});

describe("calendarEntries", () => {
  it("marks both the publish slot and the draft deadline before it", () => {
    const map = calendarEntries([row({ due_date: "2026-08-20" })], 10);
    expect(map.get("2026-08-20")?.[0].kind).toBe("publish");
    expect(map.get("2026-08-10")?.[0].kind).toBe("draft");
  });

  it("drops the draft marker once the draft is in — a met deadline is history", () => {
    const map = calendarEntries([row({ status: "submitted", due_date: "2026-08-20" })], 10);
    expect(map.get("2026-08-10")).toBeUndefined();
    expect(map.get("2026-08-20")).toHaveLength(1);
  });

  it("stacks several items on the same day", () => {
    const map = calendarEntries(
      [row({ id: 1, status: "approved", due_date: "2026-08-20" }), row({ id: 2, status: "approved", due_date: "2026-08-20" })],
      10
    );
    expect(map.get("2026-08-20")).toHaveLength(2);
  });

  it("leaves undated items off the calendar entirely", () => {
    expect(calendarEntries([row()], 10).size).toBe(0);
  });
});

describe("monthGrid", () => {
  it("starts on the Monday on or before the 1st", () => {
    // 1 August 2026 is a Saturday, so the grid opens on Monday 27 July.
    expect(monthGrid("2026-08")[0][0]).toBe("2026-07-27");
  });

  it("is always six full weeks, so paging months does not change the height", () => {
    const grid = monthGrid("2026-08");
    expect(grid).toHaveLength(6);
    for (const week of grid) expect(week).toHaveLength(7);
  });

  it("handles a month that starts on a Monday without a blank leading week", () => {
    // 1 June 2026 is a Monday.
    expect(monthGrid("2026-06")[0][0]).toBe("2026-06-01");
  });

  it("runs consecutively with no gaps or repeats", () => {
    const days = monthGrid("2026-02").flat();
    for (let i = 1; i < days.length; i++) {
      expect(dayGap(days[i - 1], days[i])).toBe(1);
    }
  });
});

describe("shiftMonth", () => {
  it("wraps the year in both directions", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("pads single-digit months", () => {
    expect(shiftMonth("2026-08", 1)).toBe("2026-09");
    expect(shiftMonth("2026-10", -1)).toBe("2026-09");
  });
});

describe("isInMonth / monthLabel / addDaysUtc", () => {
  it("distinguishes the month's own days from the padding", () => {
    expect(isInMonth("2026-08-01", "2026-08")).toBe(true);
    expect(isInMonth("2026-07-31", "2026-08")).toBe(false);
  });

  it("labels the month readably", () => {
    expect(monthLabel("2026-08")).toBe("August 2026");
  });

  it("crosses month boundaries correctly", () => {
    expect(addDaysUtc("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDaysUtc("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("spacingConflicts", () => {
  it("catches two videos from one creator landing inside the minimum gap", () => {
    const conflicts = spacingConflicts(
      [
        row({ id: 1, status: "approved", due_date: "2026-08-10" }),
        row({ id: 2, status: "approved", due_date: "2026-08-13" }),
      ],
      7
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].tightestGapDays).toBe(3);
    expect(conflicts[0].items.map((r) => r.item.id)).toEqual([1, 2]);
    expect(conflicts[0].firstDay).toBe("2026-08-10");
    expect(conflicts[0].lastDay).toBe("2026-08-13");
  });

  it("leaves comfortably spaced slots alone", () => {
    expect(
      spacingConflicts(
        [
          row({ id: 1, status: "approved", due_date: "2026-08-10" }),
          row({ id: 2, status: "approved", due_date: "2026-08-24" }),
        ],
        7
      )
    ).toEqual([]);
  });

  it("never compares two different creators", () => {
    expect(
      spacingConflicts(
        [
          row({ id: 1, status: "approved", due_date: "2026-08-10" }, "Creator A"),
          row({ id: 2, status: "approved", due_date: "2026-08-11" }, "Creator B"),
        ],
        7
      )
    ).toEqual([]);
  });

  it("reports a crowded run as one cluster, not a pair per adjacent gap", () => {
    // Pairwise reporting turns one bad week into a wall of near-identical warnings.
    const conflicts = spacingConflicts(
      [
        row({ id: 1, status: "approved", due_date: "2026-08-10" }),
        row({ id: 2, status: "approved", due_date: "2026-08-12" }),
        row({ id: 3, status: "approved", due_date: "2026-08-14" }),
      ],
      7
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].items.map((r) => r.item.id)).toEqual([1, 2, 3]);
    expect(conflicts[0].tightestGapDays).toBe(2);
    expect(conflicts[0].lastDay).toBe("2026-08-14");
  });

  it("collapses a bundle logged against a single date into one warning", () => {
    // Four videos all stamped with the same posting date is one problem, not three.
    const conflicts = spacingConflicts(
      [1, 2, 3, 4].map((id) =>
        row({ id, status: "posted", due_date: null, posted_at: "2026-07-31" })
      ),
      7
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].items).toHaveLength(4);
    expect(conflicts[0].tightestGapDays).toBe(0);
  });

  it("splits two separate crowded stretches rather than chaining across a clear gap", () => {
    const conflicts = spacingConflicts(
      [
        row({ id: 1, status: "approved", due_date: "2026-08-01" }),
        row({ id: 2, status: "approved", due_date: "2026-08-03" }),
        row({ id: 3, status: "approved", due_date: "2026-09-01" }),
        row({ id: 4, status: "approved", due_date: "2026-09-03" }),
      ],
      7
    );
    expect(conflicts).toHaveLength(2);
    expect(conflicts.map((c) => c.items.map((r) => r.item.id))).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("compares against the real publication date, not the agreed one", () => {
    // Agreed a fortnight apart, actually posted two days apart — the clash is real.
    const conflicts = spacingConflicts(
      [
        row({ id: 1, status: "posted", due_date: "2026-08-01", posted_at: "2026-08-11" }),
        row({ id: 2, status: "approved", due_date: "2026-08-13" }),
      ],
      7
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].tightestGapDays).toBe(2);
  });

  it("ignores undated items rather than treating them as same-day", () => {
    expect(
      spacingConflicts([row({ id: 1 }), row({ id: 2 })], 7)
    ).toEqual([]);
  });
});
