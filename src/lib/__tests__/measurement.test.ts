import { describe, expect, it } from "vitest";
import {
  countsTowardBenchmarks,
  measurementState,
  windowFor,
  DEFAULT_WINDOWS,
} from "../measurement";
import type { ContentItem } from "../fulfillment-types";

const TODAY = "2026-07-22";

const item = (over: Partial<ContentItem>): ContentItem =>
  ({
    id: 1,
    deal_id: 1,
    title: "Video",
    platform: "youtube",
    status: "posted",
    posted_at: null,
    actual_views: null,
    actuals_measured_at: null,
    ...over,
  }) as ContentItem;

const state = (over: Partial<ContentItem>, windows = {}) =>
  measurementState(item(over), windows, TODAY);

describe("windowFor", () => {
  it("gives each platform the time its view curve needs", () => {
    expect(windowFor("youtube")).toBe(30);
    expect(windowFor("tiktok")).toBe(14);
    expect(windowFor("instagram")).toBe(14);
  });

  it("prefers a configured window over the default", () => {
    expect(windowFor("youtube", { youtube: 90 })).toBe(90);
  });

  it("falls back for unknown or missing platforms", () => {
    expect(windowFor("twitch")).toBe(14);
    expect(windowFor(null)).toBe(14);
  });
});

describe("measurementState", () => {
  it("holds a fresh YouTube post back until its window closes", () => {
    const fresh = state({ posted_at: "2026-07-20" });
    expect(fresh.state).toBe("maturing");
    expect(fresh.matureOn).toBe("2026-08-19"); // +30 days
    expect(fresh.daysUntilMature).toBe(28);
  });

  it("asks for a reading once the window has closed", () => {
    const ready = state({ posted_at: "2026-06-01" });
    expect(ready.state).toBe("due");
    expect(ready.daysSincePost).toBe(51);
  });

  it("marks an early reading provisional, not final", () => {
    // Posted 5 days ago on YouTube, measured today — 25 days short of the window.
    const early = state({
      posted_at: "2026-07-17",
      actual_views: 20_000,
      actuals_measured_at: TODAY,
    });
    expect(early.state).toBe("provisional");
    expect(countsTowardBenchmarks(early)).toBe(false);
  });

  it("accepts a reading taken after the window as final", () => {
    const settled = state({
      posted_at: "2026-06-01",
      actual_views: 71_000,
      actuals_measured_at: "2026-07-05", // 34 days after posting
    });
    expect(settled.state).toBe("final");
    expect(countsTowardBenchmarks(settled)).toBe(true);
  });

  it("treats the same reading differently per platform", () => {
    // 20 days after posting: settled for TikTok, still early for YouTube.
    const posted = { posted_at: "2026-07-02", actual_views: 50_000, actuals_measured_at: TODAY };
    expect(state({ ...posted, platform: "tiktok" }).state).toBe("final");
    expect(state({ ...posted, platform: "youtube" }).state).toBe("provisional");
  });

  it("respects a longer configured window for evergreen content", () => {
    const settled = state(
      { posted_at: "2026-06-01", actual_views: 71_000, actuals_measured_at: "2026-07-05" },
      { youtube: 90 }
    );
    expect(settled.state).toBe("provisional"); // 34 days is early against a 90-day window
  });

  it("says nothing to measure before the content is live", () => {
    expect(state({ status: "planned" }).state).toBe("not_posted");
    expect(state({ status: "in_production" }).state).toBe("not_posted");
  });

  it("takes historic readings at face value when the post date is unknown", () => {
    // Items logged before posted_at existed shouldn't be retroactively discarded.
    const legacy = state({ posted_at: null, actual_views: 61_000 });
    expect(legacy.state).toBe("final");
    expect(countsTowardBenchmarks(legacy)).toBe(true);
  });

  it("asks for a reading on a live item with no known post date", () => {
    expect(state({ posted_at: null, status: "verified" }).state).toBe("due");
  });

  it("uses today as the measurement date when one was never stamped", () => {
    const justMeasured = state({ posted_at: "2026-07-20", actual_views: 5_000 });
    expect(justMeasured.state).toBe("provisional");
  });
});

describe("DEFAULT_WINDOWS", () => {
  it("gives long-form the longest runway", () => {
    expect(DEFAULT_WINDOWS.youtube).toBeGreaterThan(DEFAULT_WINDOWS.tiktok);
  });
});
