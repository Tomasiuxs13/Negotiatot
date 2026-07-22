import { describe, expect, it } from "vitest";
import { attentionItems } from "../attention";
import type { Deal } from "../types";
import type { ContentItem, PaymentItem, Shipment } from "../fulfillment-types";

const TODAY = "2026-07-22";

const deal = (over: Partial<Deal>): Deal =>
  ({
    id: 1,
    creator: "Marta",
    stage: "negotiating",
    your_move: 0,
    round: 2,
    updated_at: "2026-07-22 09:00:00",
    analysis: null,
    job_status: null,
    ...over,
  }) as Deal;

const content = (over: Partial<ContentItem>): ContentItem =>
  ({
    id: 1,
    deal_id: 1,
    title: "YouTube integration",
    status: "planned",
    due_date: null,
    platform: "youtube",
    posted_at: null,
    actual_views: null,
    actuals_measured_at: null,
    ...over,
  }) as ContentItem;

const payment = (over: Partial<PaymentItem>): PaymentItem =>
  ({ id: 1, deal_id: 1, description: "Final fee", amount: 1500, status: "pending", ...over }) as PaymentItem;

const shipment = (over: Partial<Shipment>): Shipment =>
  ({ id: 1, deal_id: 1, product: "Headset", status: "to_prepare", shipped_at: null, ...over }) as Shipment;

const base = { deals: [deal({})], contentItems: [], shipments: [], payments: [], today: TODAY };

describe("attentionItems", () => {
  it("is empty when nothing needs doing", () => {
    expect(attentionItems(base)).toEqual([]);
  });

  it("puts overdue content first, with how late it is", () => {
    const items = attentionItems({
      ...base,
      contentItems: [content({ due_date: "2026-07-19", status: "planned" })],
      payments: [payment({ status: "approvable" })],
    });
    expect(items[0].severity).toBe("critical");
    expect(items[0].detail).toContain("3 days ago");
    expect(items[1].severity).toBe("warning"); // payment ranks below overdue content
  });

  it("surfaces money that is ready to approve, with the amount", () => {
    const items = attentionItems({ ...base, payments: [payment({ status: "approvable" })] });
    expect(items).toHaveLength(1);
    expect(items[0].amount).toBe(1500);
    expect(items[0].title).toContain("payment ready to approve");
  });

  it("ignores payments that are still waiting, approved, or paid", () => {
    const items = attentionItems({
      ...base,
      payments: [payment({ status: "pending" }), payment({ id: 2, status: "approved" }), payment({ id: 3, status: "paid" })],
    });
    expect(items).toEqual([]);
  });

  it("flags product that has not shipped, and shipments stuck in transit", () => {
    const notSent = attentionItems({ ...base, shipments: [shipment({ status: "to_prepare" })] });
    expect(notSent[0].title).toContain("product not sent");

    const stuck = attentionItems({
      ...base,
      shipments: [shipment({ status: "shipped", shipped_at: "2026-07-10 12:00:00" })],
    });
    expect(stuck[0].detail).toContain("12 days ago");

    const recent = attentionItems({
      ...base,
      shipments: [shipment({ status: "shipped", shipped_at: "2026-07-20 12:00:00" })],
    });
    expect(recent).toEqual([]);
  });

  it("suggests a nudge only after the agreed silence window", () => {
    const quiet = attentionItems({
      ...base,
      deals: [deal({ stage: "offer_sent", updated_at: "2026-07-18 09:00:00" })],
    });
    expect(quiet[0].title).toContain("no reply in 4 days");

    const fresh = attentionItems({
      ...base,
      deals: [deal({ stage: "offer_sent", updated_at: "2026-07-21 09:00:00" })],
    });
    expect(fresh).toEqual([]);
  });

  it("does not chase the creator when it is our move", () => {
    const items = attentionItems({
      ...base,
      deals: [deal({ stage: "negotiating", your_move: 1, updated_at: "2026-07-10 09:00:00" })],
    });
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain("your move");
  });

  it("warns about content due soon but not content already posted", () => {
    const soon = attentionItems({
      ...base,
      contentItems: [content({ due_date: "2026-07-25", status: "planned" })],
    });
    expect(soon[0].title).toContain("due in 3 days");

    const posted = attentionItems({
      ...base,
      contentItems: [content({ due_date: "2026-07-25", status: "posted" })],
    });
    expect(posted.some((i) => i.title.includes("due in"))).toBe(false);
  });

  it("surfaces a finished analysis nobody has acted on", () => {
    const fresh = attentionItems({
      ...base,
      deals: [deal({ stage: "analyzing", analysis: "{}", job_status: null, updated_at: "2026-07-22 09:00:00" })],
    });
    expect(fresh[0].title).toContain("verdict ready to review");
    expect(fresh[0].severity).toBe("info");

    const stale = attentionItems({
      ...base,
      deals: [deal({ stage: "analyzing", analysis: "{}", job_status: null, updated_at: "2026-07-15 09:00:00" })],
    });
    expect(stale[0].severity).toBe("warning");
    expect(stale[0].detail).toContain("7 days");
  });

  it("stays quiet while the analysis is still running", () => {
    const items = attentionItems({
      ...base,
      deals: [deal({ stage: "analyzing", analysis: null, job_status: "analyzing" })],
    });
    expect(items).toEqual([]);
  });

  it("suggests wrapping up a deal once content is verified and money is paid", () => {
    const done = attentionItems({
      ...base,
      deals: [deal({ stage: "agreed" })],
      contentItems: [content({ status: "verified" })],
      payments: [payment({ status: "paid" })],
    });
    expect(done.some((i) => i.title.includes("ready to wrap up"))).toBe(true);

    const stillOwed = attentionItems({
      ...base,
      deals: [deal({ stage: "agreed" })],
      contentItems: [content({ status: "verified" })],
      payments: [payment({ status: "approved" })],
    });
    expect(stillOwed.some((i) => i.title.includes("ready to wrap up"))).toBe(false);
  });

  it("tells you to chase the creator on overdue content", () => {
    const items = attentionItems({
      ...base,
      contentItems: [content({ due_date: "2026-07-19", status: "planned" })],
    });
    expect(items[0].detail).toContain("check in with Marta");
  });

  it("nudges stale leads", () => {
    const items = attentionItems({
      ...base,
      deals: [deal({ stage: "lead", updated_at: "2026-07-10 09:00:00" })],
    });
    expect(items[0].title).toContain("untouched for 12 days");
  });
});

describe("measurement nudges", () => {
  const posted = (over: Partial<ContentItem>) =>
    content({ status: "verified", due_date: null, ...over });

  it("stays quiet while a platform's views are still settling", () => {
    const items = attentionItems({
      ...base,
      // YouTube needs 30 days; this went live 10 days ago.
      contentItems: [posted({ platform: "youtube", posted_at: "2026-07-12" })],
    });
    expect(items.some((i) => i.title.includes("ready to measure"))).toBe(false);
  });

  it("asks for results once the window closes", () => {
    const items = attentionItems({
      ...base,
      contentItems: [posted({ platform: "youtube", posted_at: "2026-06-01" })],
    });
    const nudge = items.find((i) => i.title.includes("ready to measure"))!;
    expect(nudge.detail).toContain("30-day window");
  });

  it("asks again when only a provisional number was logged", () => {
    const items = attentionItems({
      ...base,
      contentItems: [
        posted({
          platform: "youtube",
          posted_at: "2026-06-01",
          actual_views: 20_000,
          actuals_measured_at: "2026-06-04", // read 3 days in
        }),
      ],
    });
    const nudge = items.find((i) => i.title.includes("ready to measure"))!;
    expect(nudge.detail).toContain("provisional");
  });

  it("leaves a settled reading alone", () => {
    const items = attentionItems({
      ...base,
      contentItems: [
        posted({
          platform: "youtube",
          posted_at: "2026-06-01",
          actual_views: 71_000,
          actuals_measured_at: "2026-07-05",
        }),
      ],
    });
    expect(items.some((i) => i.title.includes("ready to measure"))).toBe(false);
  });

  it("honours a configured window", () => {
    const args = {
      ...base,
      contentItems: [posted({ platform: "youtube", posted_at: "2026-06-15" })], // 37 days ago
    };
    expect(attentionItems(args).some((i) => i.title.includes("ready to measure"))).toBe(true);
    expect(
      attentionItems({ ...args, windows: { youtube: 90 } }).some((i) =>
        i.title.includes("ready to measure")
      )
    ).toBe(false);
  });
});

describe("revisit nudges", () => {
  it("brings back a deal parked on timing once its date arrives", () => {
    const due = attentionItems({
      ...base,
      deals: [
        deal({
          stage: "declined",
          decline_reason: "timing",
          decline_note: "No budget until Q4",
          revisit_on: "2026-07-20",
        }),
      ],
    });
    const nudge = due.find((i) => i.title.includes("worth revisiting"))!;
    expect(nudge.detail).toContain("No budget until Q4");
  });

  it("stays quiet until the date arrives", () => {
    const later = attentionItems({
      ...base,
      deals: [deal({ stage: "declined", decline_reason: "timing", revisit_on: "2026-09-01" })],
    });
    expect(later.some((i) => i.title.includes("worth revisiting"))).toBe(false);
  });

  it("never nags about a deal declined on price", () => {
    const priced = attentionItems({
      ...base,
      deals: [deal({ stage: "declined", decline_reason: "too_expensive", revisit_on: null })],
    });
    expect(priced).toEqual([]);
  });
});
