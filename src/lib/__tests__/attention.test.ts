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
  ({ id: 1, deal_id: 1, title: "YouTube integration", status: "planned", due_date: null, ...over }) as ContentItem;

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
    expect(posted).toEqual([]);
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
    expect(done[0].title).toContain("ready to wrap up");

    const stillOwed = attentionItems({
      ...base,
      deals: [deal({ stage: "agreed" })],
      contentItems: [content({ status: "verified" })],
      payments: [payment({ status: "approved" })],
    });
    expect(stillOwed).toEqual([]);
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
