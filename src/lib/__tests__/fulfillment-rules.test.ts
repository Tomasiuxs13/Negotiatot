import { describe, expect, it } from "vitest";
import {
  addDays,
  contentHasOperationalActivity,
  fulfillmentSummary,
  isOverdue,
  nextPaymentStatus,
  parseLinkedIds,
  paymentApprovable,
  resolveConditionalDueDate,
  shipmentTransitionError,
} from "../fulfillment-rules";
import { pendingReason } from "../fulfillment-types";

const content = (id: number, status: string) => ({ id, status }) as never;
const payment = (over: Record<string, unknown>) =>
  ({ trigger: "on_verification", status: "pending", due_date: null, linked_content_ids: "[]", ...over }) as never;

describe("addDays", () => {
  it("adds days across month boundaries", () => {
    expect(addDays("2026-07-21", 14)).toBe("2026-08-04");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(addDays("2026-07-21 10:30:00", 1)).toBe("2026-07-22");
  });
});

describe("conditional contract deadlines", () => {
  it("moves a hybrid deadline to the later delivery-relative date", () => {
    expect(
      resolveConditionalDueDate({
        deliveredAt: "2026-09-05",
        anchorDate: "2026-09-15",
        daysAfterDelivery: 14,
        mode: "later_of",
      })
    ).toBe("2026-09-19");
  });

  it("keeps the fixed date when it is already later", () => {
    expect(
      resolveConditionalDueDate({
        deliveredAt: "2026-08-20",
        anchorDate: "2026-09-15",
        daysAfterDelivery: 14,
        mode: "later_of",
      })
    ).toBe("2026-09-15");
  });

  it("supports explicit relative-only and earlier-of clauses", () => {
    expect(
      resolveConditionalDueDate({ deliveredAt: "2026-09-05", daysAfterDelivery: 14 })
    ).toBe("2026-09-19");
    expect(
      resolveConditionalDueDate({
        deliveredAt: "2026-09-05",
        anchorDate: "2026-09-15",
        daysAfterDelivery: 14,
        mode: "earlier_of",
      })
    ).toBe("2026-09-15");
  });
});

describe("shipmentTransitionError", () => {
  const shipment = {
    status: "to_prepare" as const,
    carrier: null,
    tracking: null,
    tracking_exception: null,
  };

  it("requires a carrier and tracking pair before shipping", () => {
    expect(shipmentTransitionError(shipment, "shipped")).toMatch(/carrier and tracking/);
    expect(
      shipmentTransitionError(shipment, "shipped", {
        carrier: "DHL",
        tracking: "JD123",
      })
    ).toBeNull();
  });

  it("accepts a documented no-tracking exception", () => {
    expect(
      shipmentTransitionError(shipment, "shipped", {
        trackingException: "Hand delivered by the local team",
      })
    ).toBeNull();
  });

  it("does not allow delivery to skip the shipped state", () => {
    expect(shipmentTransitionError(shipment, "delivered")).toMatch(/Mark.*Shipped/);
  });
});

describe("provisional content replacement", () => {
  const planned = {
    status: "planned",
    draft_url: null,
    posted_url: null,
    notes: null,
    video_path: null,
    check_result: null,
    actual_views: null,
    actual_clicks: null,
    actual_orders: null,
    actual_revenue: null,
  } as const;

  it("allows only untouched provisional rows to be replaced by confirmed terms", () => {
    expect(contentHasOperationalActivity(planned)).toBe(false);
    expect(contentHasOperationalActivity({ ...planned, status: "in_production" })).toBe(true);
    expect(contentHasOperationalActivity({ ...planned, draft_url: "https://draft.test/v1" })).toBe(true);
    expect(contentHasOperationalActivity({ ...planned, notes: "Creator confirmed the hook" })).toBe(true);
  });
});

describe("paymentApprovable — payment follows proof", () => {
  it("signing fees are immediately approvable", () => {
    expect(paymentApprovable(payment({ trigger: "on_signing" }), [], false)).toBe(true);
  });

  it("delivery fees wait for the product to arrive", () => {
    expect(paymentApprovable(payment({ trigger: "on_delivery" }), [], false)).toBe(false);
    expect(paymentApprovable(payment({ trigger: "on_delivery" }), [], true)).toBe(true);
  });

  it("verification fees require every linked item verified", () => {
    const items = [content(1, "verified"), content(2, "posted")];
    const linkedBoth = payment({ linked_content_ids: "[1,2]" });
    const linkedFirst = payment({ linked_content_ids: "[1]" });
    expect(paymentApprovable(linkedBoth, items, false)).toBe(false);
    expect(paymentApprovable(linkedFirst, items, false)).toBe(true);
  });

  it("falls back to all deal content when nothing is linked", () => {
    expect(paymentApprovable(payment({}), [content(1, "verified")], false)).toBe(true);
    expect(paymentApprovable(payment({}), [content(1, "posted")], false)).toBe(false);
  });

  it("is not approvable when there is no content to verify at all", () => {
    expect(paymentApprovable(payment({}), [], false)).toBe(false);
  });

  it("date-triggered fees wait for the date", () => {
    const p = payment({ trigger: "date", due_date: "2026-08-01" });
    expect(paymentApprovable(p, [], false, "2026-07-31")).toBe(false);
    expect(paymentApprovable(p, [], false, "2026-08-01")).toBe(true);
  });

  it("never downgrades money already approved or paid", () => {
    expect(paymentApprovable(payment({ status: "approved" }), [], false)).toBe(true);
    expect(nextPaymentStatus(payment({ status: "paid" }), [], false)).toBe("paid");
  });
});

describe("isOverdue", () => {
  it("is late only when the date has passed and it is not yet posted", () => {
    expect(isOverdue({ due_date: "2026-07-01", status: "planned" }, "2026-07-21")).toBe(true);
    expect(isOverdue({ due_date: "2026-07-01", status: "posted" }, "2026-07-21")).toBe(false);
    expect(isOverdue({ due_date: "2026-08-01", status: "planned" }, "2026-07-21")).toBe(false);
    expect(isOverdue({ due_date: null, status: "planned" }, "2026-07-21")).toBe(false);
  });
});

describe("fulfillmentSummary", () => {
  it("derives deal state from its items", () => {
    const summary = fulfillmentSummary(
      [
        { due_date: "2026-07-01", status: "verified" },
        { due_date: "2026-07-02", status: "planned" },
      ],
      [
        { status: "approvable", amount: 1000 },
        { status: "paid", amount: 500 },
      ],
      "2026-07-21"
    );
    expect(summary).toMatchObject({
      totalContent: 2,
      verified: 1,
      overdue: 1,
      complete: false,
      awaitingApproval: 1,
      unpaid: 1000,
    });
  });

  it("is complete only when every item is verified", () => {
    expect(fulfillmentSummary([{ due_date: null, status: "verified" }], []).complete).toBe(true);
    expect(fulfillmentSummary([], []).complete).toBe(false);
  });
});

describe("parseLinkedIds", () => {
  it("parses ids and tolerates junk", () => {
    expect(parseLinkedIds("[1,2,3]")).toEqual([1, 2, 3]);
    expect(parseLinkedIds(null)).toEqual([]);
    expect(parseLinkedIds("nope")).toEqual([]);
  });
});

describe("pendingReason", () => {
  it("names the actual blocker rather than assuming a shipment", () => {
    expect(pendingReason({ trigger: "on_verification", due_date: null })).toBe(
      "waiting on content verification"
    );
    expect(pendingReason({ trigger: "on_delivery", due_date: null })).toBe(
      "waiting on product delivery"
    );
    expect(pendingReason({ trigger: "date", due_date: "2026-08-04" })).toBe("due 2026-08-04");
    expect(pendingReason({ trigger: "on_signing", due_date: null })).toBe("waiting on signature");
  });
});

describe("milestone payment gates", () => {
  const fourItems = (verified: number) =>
    [1, 2, 3, 4].map((id) => content(id, id <= verified ? "verified" : "posted"));

  it("unlocks '50% after half the videos' at two of four verified", () => {
    const half = payment({ linked_content_ids: "[1,2,3,4]", required_verified: 2 });
    expect(paymentApprovable(half, fourItems(1), false)).toBe(false);
    expect(paymentApprovable(half, fourItems(2), false)).toBe(true);
  });

  it("keeps the strict all-verified default when no gate is set", () => {
    const full = payment({ linked_content_ids: "[1,2,3,4]", required_verified: null });
    expect(paymentApprovable(full, fourItems(3), false)).toBe(false);
    expect(paymentApprovable(full, fourItems(4), false)).toBe(true);
  });

  it("caps an over-large gate at what is actually linked", () => {
    // A gate of 9 on four items must not make the payment permanently unreachable.
    const overshoot = payment({ linked_content_ids: "[1,2,3,4]", required_verified: 9 });
    expect(paymentApprovable(overshoot, fourItems(4), false)).toBe(true);
  });

  it("still refuses when nothing is linked and no content exists", () => {
    expect(paymentApprovable(payment({ required_verified: 1 }), [], false)).toBe(false);
  });

  it("names the milestone in the waiting reason", () => {
    expect(pendingReason(payment({ required_verified: 2 }))).toBe(
      "waiting on 2 content items verified"
    );
    expect(pendingReason(payment({}))).toBe("waiting on content verification");
  });
});
