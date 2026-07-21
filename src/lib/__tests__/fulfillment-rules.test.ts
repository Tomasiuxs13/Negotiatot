import { describe, expect, it } from "vitest";
import {
  addDays,
  fulfillmentSummary,
  isOverdue,
  nextPaymentStatus,
  parseLinkedIds,
  paymentApprovable,
} from "../fulfillment-rules";

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
