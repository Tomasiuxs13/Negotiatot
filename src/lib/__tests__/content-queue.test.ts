import { describe, it, expect } from "vitest";
import {
  awaitingShipment,
  blockingSetup,
  daysInStatus,
  groupByStatus,
  leadDate,
  needsAttention,
  nextAction,
  resolvePlatform,
  urgencyScore,
  type ContentRow,
} from "../content-queue";
import { blockingLabel } from "../fulfillment-types";
import type { ContentItem, ContentStatus } from "../fulfillment-types";

const TODAY = "2026-08-03";

const item = (over: Partial<ContentItem> = {}): ContentItem => ({
  id: 1,
  deal_id: 10,
  title: "YouTube integration",
  platform: null,
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

const row = (over: Partial<ContentItem> = {}, rest: Partial<ContentRow> = {}): ContentRow => ({
  item: item(over),
  dealId: 10,
  creator: "TheOldCoupleOutdoors",
  campaign: null,
  platform: "youtube",
  blockedBy: [],
  awaitingProduct: null,
  ...rest,
});

describe("nextAction", () => {
  it("asks for a publish date first — an undated item falls out of every deadline", () => {
    expect(nextAction(row(), TODAY).kind).toBe("set_date");
  });

  it("does not call a delivery-relative due date a gap — it resolves itself", () => {
    // "14 days after the product arrives" is a real date in waiting, not something the
    // manager has to go and set.
    expect(nextAction(row({ due_days_after_delivery: 14 }), TODAY).kind).toBe("await_draft");
  });

  it("chases the draft once the draft deadline has passed, and not before", () => {
    // 10-day default lead: a publish date 5 days out means the draft was due already.
    expect(nextAction(row({ due_date: "2026-08-08" }), TODAY).kind).toBe("chase_draft");
    expect(nextAction(row({ due_date: "2026-09-30" }), TODAY).kind).toBe("await_draft");
  });

  it("hands the move back to us the moment a draft lands", () => {
    const a = nextAction(row({ status: "submitted", due_date: "2026-08-20" }), TODAY);
    expect(a.kind).toBe("review");
    expect(a.owner).toBe("us");
  });

  it("marks an approved item as theirs — we cannot post it for them", () => {
    expect(nextAction(row({ status: "approved" }), TODAY).owner).toBe("creator");
  });

  it("treats posted-but-unchecked as delivered, not done", () => {
    expect(nextAction(row({ status: "posted", posted_at: "2026-08-01" }), TODAY).kind).toBe(
      "check"
    );
    expect(
      nextAction(row({ status: "posted", posted_at: "2026-08-01", check_result: "{}" }), TODAY).kind
    ).toBe("measure");
  });

  it("only calls an item complete once its numbers have been read", () => {
    expect(nextAction(row({ status: "verified" }), TODAY).kind).toBe("measure");
    const done = nextAction(row({ status: "verified", actual_views: 42_000 }), TODAY);
    expect(done.kind).toBe("done");
    expect(done.owner).toBeNull();
  });
});

describe("blockingSetup", () => {
  const task = (over: Partial<Parameters<typeof blockingSetup>[0][number]> = {}) => ({
    status: "todo" as const,
    kind: "tracking_link" as const,
    deal_id: null,
    partner_id: 5,
    label: "Affiliate tracking link issued",
    ...over,
  });

  it("catches a partner-wide link that no deal_id points at", () => {
    // The affiliate link is issued once per creator, so it carries no deal_id. Matching
    // on deal_id alone would miss the one that is most often missing.
    expect(blockingSetup([task()], 10, 5)).toEqual(["tracking_link"]);
  });

  it("catches a deal-scoped coupon code", () => {
    expect(
      blockingSetup([task({ kind: "coupon_code", deal_id: 10 })], 10, 5)
    ).toEqual(["coupon_code"]);
  });

  it("ignores another partner's tasks and another deal's", () => {
    expect(blockingSetup([task({ partner_id: 99 })], 10, 5)).toEqual([]);
    expect(blockingSetup([task({ deal_id: 77 })], 10, 5)).toEqual([]);
  });

  it("ignores completed tasks and non-blocking ones", () => {
    expect(blockingSetup([task({ status: "done" })], 10, 5)).toEqual([]);
    expect(blockingSetup([task({ kind: "onboarding_email" })], 10, 5)).toEqual([]);
  });
});

describe("blockingLabel", () => {
  it("shortens stored sentences into something that fits a card", () => {
    // The stored labels are full sentences; two of them concatenated wrap to three lines.
    expect(blockingLabel(["tracking_link", "coupon_code"])).toBe("tracking link and coupon code");
  });
});

describe("awaitingShipment", () => {
  const ship = (over: Partial<Parameters<typeof awaitingShipment>[0][number]> = {}) => ({
    deal_id: 10,
    product: "Trail Pack 40L",
    status: "to_prepare" as const,
    ...over,
  });

  it("reports an unsent parcel", () => {
    expect(awaitingShipment([ship()], 10)).toEqual({
      product: "Trail Pack 40L",
      status: "to_prepare",
    });
  });

  it("stops reporting once it has been delivered — the dependency is over", () => {
    expect(awaitingShipment([ship({ status: "delivered" })], 10)).toBeNull();
  });

  it("ignores another deal's shipment", () => {
    expect(awaitingShipment([ship()], 99)).toBeNull();
  });

  it("leads with the parcel still sitting with us over one already in transit", () => {
    const result = awaitingShipment(
      [ship({ product: "In transit", status: "shipped" }), ship({ product: "On my desk" })],
      10
    );
    expect(result?.product).toBe("On my desk");
  });
});

describe("content waiting on a product", () => {
  const unsent = { awaitingProduct: { product: "Trail Pack 40L", status: "to_prepare" as const } };
  const transit = { awaitingProduct: { product: "Trail Pack 40L", status: "shipped" as const } };

  it("makes it ours, not theirs — they cannot film what has not arrived", () => {
    // The bug this fixes: the board previously said "waiting on the draft" while the
    // parcel sat unposted on our desk.
    const a = nextAction(row({ status: "planned", due_days_after_delivery: 14 }, unsent), TODAY);
    expect(a.kind).toBe("await_product");
    expect(a.owner).toBe("us");
  });

  it("outranks setting a date — a date means nothing before the product ships", () => {
    expect(nextAction(row({ status: "planned" }, unsent), TODAY).kind).toBe("await_product");
  });

  it("outranks missing tracking setup", () => {
    expect(
      nextAction(row({ status: "planned" }, { ...unsent, blockedBy: ["tracking_link"] }), TODAY).kind
    ).toBe("await_product");
  });

  it("gives an in-transit parcel no owner — nobody can act on it", () => {
    const a = nextAction(row({ status: "planned" }, transit), TODAY);
    expect(a.kind).toBe("await_product");
    expect(a.owner).toBeNull();
    expect(needsAttention(row({ status: "planned" }, transit), TODAY)).toBe(false);
  });

  it("flags an unsent parcel as needing attention", () => {
    expect(needsAttention(row({ status: "planned" }, unsent), TODAY)).toBe(true);
  });

  it("stops applying once filming has started — they evidently have what they needed", () => {
    expect(nextAction(row({ status: "in_production", due_date: "2026-09-30" }, unsent), TODAY).kind).toBe(
      "await_draft"
    );
  });
});

describe("blocked content", () => {
  const blocked = { blockedBy: ["tracking_link" as const] };

  it("outranks every other action once filming has started", () => {
    const a = nextAction(row({ status: "in_production", due_date: "2026-08-08" }, blocked), TODAY);
    expect(a.kind).toBe("blocked");
    expect(a.owner).toBe("us");
    // Without it, this same item would be a draft chase.
    expect(nextAction(row({ status: "in_production", due_date: "2026-08-08" }), TODAY).kind).toBe(
      "chase_draft"
    );
  });

  it("stays quiet on a planned item — nobody has started filming yet", () => {
    expect(nextAction(row({ status: "planned", due_date: "2026-09-30" }, blocked), TODAY).kind).toBe(
      "await_draft"
    );
  });

  it("does not become an action once the video is already live", () => {
    // The link cannot be applied retroactively, so it is a flag, not a task.
    expect(
      nextAction(row({ status: "posted", posted_at: "2026-08-01" }, blocked), TODAY).kind
    ).toBe("check");
  });

  it("counts as needing attention from the moment work starts", () => {
    expect(needsAttention(row({ status: "in_production", due_date: "2026-09-30" }, blocked), TODAY)).toBe(
      true
    );
    expect(needsAttention(row({ status: "planned", due_date: "2026-09-30" }, blocked), TODAY)).toBe(
      false
    );
  });
});

describe("urgencyScore", () => {
  it("sorts by days to publish, so anything already past its slot leads", () => {
    expect(urgencyScore(row({ due_date: "2026-07-28" }), TODAY)).toBe(-6);
    expect(urgencyScore(row({ due_date: "2026-08-13" }), TODAY)).toBe(10);
  });

  it("sorts undated items last rather than pretending they are urgent", () => {
    expect(urgencyScore(row(), TODAY)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("daysInStatus", () => {
  it("measures a submitted draft from when it was submitted, not last edit", () => {
    // The whole point: editing a note must not reset the review clock.
    const waiting = daysInStatus(
      item({
        status: "submitted",
        draft_submitted_at: "2026-07-27 12:00:00",
        updated_at: "2026-08-03 09:00:00",
      }),
      TODAY
    );
    expect(waiting).toBe(7);
  });

  it("measures a posted item from its publish date", () => {
    expect(daysInStatus(item({ status: "posted", posted_at: "2026-08-01" }), TODAY)).toBe(2);
  });

  it("returns null when the relevant stamp was never written", () => {
    expect(daysInStatus(item({ status: "submitted", draft_submitted_at: null }), TODAY)).toBeNull();
  });
});

describe("needsAttention", () => {
  it("flags an overdue item", () => {
    expect(needsAttention(row({ due_date: "2026-07-20" }), TODAY)).toBe(true);
  });

  it("flags a draft that has sat unreviewed past the review window", () => {
    expect(
      needsAttention(
        row({ status: "submitted", draft_submitted_at: "2026-08-01 10:00:00" }),
        TODAY
      )
    ).toBe(true);
    expect(
      needsAttention(
        row({ status: "submitted", draft_submitted_at: "2026-08-03 10:00:00" }),
        TODAY
      )
    ).toBe(false);
  });

  it("flags an undated item, which is invisible to every other deadline check", () => {
    expect(needsAttention(row(), TODAY)).toBe(true);
  });

  it("leaves a healthy item alone", () => {
    expect(needsAttention(row({ due_date: "2026-09-30" }), TODAY)).toBe(false);
  });

  it("does not flag finished work as late", () => {
    // A video posted before its slot is not overdue — it is early.
    expect(
      needsAttention(row({ status: "posted", due_date: "2026-07-20", posted_at: "2026-07-19" }), TODAY)
    ).toBe(false);
  });
});

describe("resolvePlatform", () => {
  it("inherits the deal's platform when there is only one", () => {
    expect(resolvePlatform({ platform: null }, ["youtube"])).toBe("youtube");
  });

  it("refuses to guess on a cross-platform deal — a wrong platform filters wrongly", () => {
    expect(resolvePlatform({ platform: null }, ["youtube", "instagram"])).toBeNull();
  });

  it("never overrides a platform the item already carries", () => {
    expect(resolvePlatform({ platform: "tiktok" }, ["youtube"])).toBe("tiktok");
  });
});

describe("groupByStatus", () => {
  it("returns every column, including the empty ones", () => {
    const groups = groupByStatus([], TODAY);
    const keys: ContentStatus[] = [
      "planned",
      "in_production",
      "submitted",
      "approved",
      "posted",
      "verified",
    ];
    for (const k of keys) expect(groups[k]).toEqual([]);
  });

  it("orders each column by urgency, undated last", () => {
    const groups = groupByStatus(
      [
        row({ id: 1, due_date: "2026-08-20" }),
        row({ id: 2 }),
        row({ id: 3, due_date: "2026-07-25" }),
      ],
      TODAY
    );
    expect(groups.planned.map((r) => r.item.id)).toEqual([3, 1, 2]);
  });
});

describe("leadDate", () => {
  it("leads with the draft deadline before a draft exists", () => {
    // Showing the publish slot here is how the review buffer gets quietly spent.
    expect(leadDate(item({ due_date: "2026-08-20" }))).toEqual({
      label: "draft due",
      date: "2026-08-10",
    });
  });

  it("leads with the publish date once the draft is in", () => {
    expect(leadDate(item({ status: "submitted", due_date: "2026-08-20" }))).toEqual({
      label: "publishes",
      date: "2026-08-20",
    });
  });

  it("shows a delivery-relative rule rather than nothing", () => {
    expect(leadDate(item({ due_days_after_delivery: 14 }))?.date).toBe("+14d after delivery");
  });

  it("returns nothing when there is no date of any kind", () => {
    expect(leadDate(item())).toBeNull();
  });
});
