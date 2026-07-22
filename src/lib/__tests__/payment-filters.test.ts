import { describe, expect, it } from "vitest";
import { filterPayments, paymentDate, paymentTotals, type PaymentRow } from "../payment-filters";

const row = (over: Partial<PaymentRow>): PaymentRow =>
  ({
    id: 1,
    deal_id: 1,
    creator: "NordicNiklas",
    description: "Fee",
    amount: 1000,
    trigger: "on_verification",
    due_date: null,
    linked_content_ids: "[]",
    status: "pending",
    approved_at: null,
    paid_at: null,
    created_at: "2026-07-01",
    ...over,
  }) as PaymentRow;

describe("paymentDate", () => {
  it("prefers when the money moved over when it was promised", () => {
    expect(paymentDate(row({ paid_at: "2026-07-10", approved_at: "2026-07-05", due_date: "2026-08-01" })))
      .toBe("2026-07-10");
    expect(paymentDate(row({ approved_at: "2026-07-05", due_date: "2026-08-01" }))).toBe("2026-07-05");
    expect(paymentDate(row({ due_date: "2026-08-01" }))).toBe("2026-08-01");
    expect(paymentDate(row({}))).toBeNull();
  });
});

describe("filterPayments", () => {
  const rows = [
    row({ id: 1, status: "approvable", amount: 1150, creator: "HomeWithHanna" }),
    row({ id: 2, status: "paid", amount: 950, paid_at: "2026-07-12" }),
    row({ id: 3, status: "paid", amount: 2100, paid_at: "2026-04-17" }),
    row({ id: 4, status: "pending", amount: 1500 }),
  ];

  it("filters by status", () => {
    expect(filterPayments(rows, { status: "paid" }).map((p) => p.id)).toEqual([2, 3]);
  });

  it("filters by creator", () => {
    expect(filterPayments(rows, { creator: "HomeWithHanna" }).map((p) => p.id)).toEqual([1]);
  });

  it("filters to a date window, inclusive at both ends", () => {
    expect(filterPayments(rows, { from: "2026-07-01", to: "2026-07-31" }).map((p) => p.id)).toEqual([2]);
    expect(filterPayments(rows, { from: "2026-07-12", to: "2026-07-12" }).map((p) => p.id)).toEqual([2]);
  });

  it("excludes undated payments from a date window rather than guessing", () => {
    // An unearned payment has no date — it can't belong to last month's export.
    expect(filterPayments(rows, { from: "2000-01-01" }).map((p) => p.id)).toEqual([2, 3]);
  });

  it("combines filters", () => {
    expect(
      filterPayments(rows, { status: "paid", from: "2026-01-01", to: "2026-06-30" }).map((p) => p.id)
    ).toEqual([3]);
  });

  it("returns everything when nothing is set", () => {
    expect(filterPayments(rows, {})).toHaveLength(4);
  });
});

describe("paymentTotals", () => {
  it("totals each status separately", () => {
    const t = paymentTotals([
      row({ status: "approvable", amount: 1150 }),
      row({ id: 2, status: "paid", amount: 950 }),
      row({ id: 3, status: "paid", amount: 2100 }),
    ]);
    expect(t.approvable).toBe(1150);
    expect(t.paid).toBe(3050);
    expect(t.total).toBe(4200);
  });
});
