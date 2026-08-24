import { describe, expect, it } from "vitest";
import { approvalCounts, approvalItems } from "../approvals";
import type { Deal } from "../types";
import type { ContentItem, Contract, PaymentItem, Shipment } from "../fulfillment-types";

const deal = (over: Partial<Deal> = {}) =>
  ({
    id: 1,
    creator: "Marta",
    stage: "agreed",
    agreed_price: 2000,
    current_offer: 2000,
    rights: null,
    updated_at: "2026-08-18 09:00:00",
    ...over,
  }) as Deal;
const content = (over: Partial<ContentItem> = {}) =>
  ({
    id: 10,
    deal_id: 1,
    title: "YouTube integration",
    status: "planned",
    due_date: "2026-09-01",
    platform: "youtube",
    ...over,
  }) as ContentItem;
const payment = (over: Partial<PaymentItem> = {}) =>
  ({
    id: 20,
    deal_id: 1,
    description: "Final fee",
    amount: 2000,
    status: "pending",
    created_at: "2026-08-18 09:00:00",
    ...over,
  }) as PaymentItem;
const contractTerms = {
  deliverables: [],
  payments: [],
  product: null,
  usageRights: null,
  exclusivity: null,
  paymentTerms: null,
  totalFee: 2000,
  notes: [],
};
const contract = (over: Partial<Contract> = {}) =>
  ({
    id: 30,
    deal_id: 1,
    filename: "signed.pdf",
    status: "confirmed",
    parsed_terms: JSON.stringify(contractTerms),
    parse_error: null,
    created_at: "2026-08-18 09:00:00",
    ...over,
  }) as Contract;

describe("approvalItems", () => {
  it("collects draft and date decisions with exact fulfillment anchors", () => {
    const items = approvalItems({
      deals: [deal()],
      contentItems: [
        content({
          status: "submitted",
          revision_round: 2,
          requested_due_date: "2026-09-08",
          due_date_request_reason: "Product arrived late",
        }),
      ],
      contracts: [contract()],
      payments: [payment()],
      shipments: [],
      today: "2026-08-18",
    });
    expect(items.map((item) => item.kind)).toEqual(expect.arrayContaining(["draft", "date_change"]));
    expect(items.find((item) => item.kind === "draft")?.href).toContain("#content-10");
    expect(items.find((item) => item.kind === "date_change")?.detail).toContain("Product arrived late");
  });

  it("shows parsed contract confirmation once and ignores an older upload", () => {
    const items = approvalItems({
      deals: [deal()],
      contentItems: [content()],
      contracts: [
        contract({ id: 29, status: "uploaded", parse_error: "Old error" }),
        contract({ id: 30, status: "parsed" }),
      ],
      payments: [payment()],
      shipments: [],
    });
    expect(items.filter((item) => item.kind === "contract")).toHaveLength(1);
    expect(items.find((item) => item.kind === "contract")?.title).toContain("Confirm");
  });

  it("raises a critical contract decision when priced rights are absent", () => {
    const rights = JSON.stringify({
      usage: { kind: "paid", months: 3 },
      whitelisting: { enabled: false, months: 0 },
      exclusivity: { kind: "none", months: 0, scope: "" },
    });
    const items = approvalItems({
      deals: [deal({ rights })],
      contentItems: [content()],
      contracts: [contract({ status: "parsed" })],
      payments: [payment()],
      shipments: [],
    });
    expect(items.find((item) => item.kind === "contract")).toMatchObject({
      severity: "critical",
    });
  });

  it("keeps ready money separate from unearned or approved money", () => {
    const items = approvalItems({
      deals: [deal()],
      contentItems: [content()],
      contracts: [contract()],
      payments: [
        payment({ id: 20, status: "approvable" }),
        payment({ id: 21, status: "pending" }),
        payment({ id: 22, status: "approved" }),
      ],
      shipments: [],
    });
    expect(items.filter((item) => item.kind === "payment")).toHaveLength(1);
    expect(items.find((item) => item.kind === "payment")?.amount).toBe(2000);
  });

  it("consolidates absent agreement records without duplicating an uploaded contract review", () => {
    const noContract = approvalItems({
      deals: [deal()],
      contentItems: [],
      contracts: [],
      payments: [],
      shipments: [],
    });
    expect(noContract.find((item) => item.kind === "setup")?.detail).toContain(
      "signed contract, content plan, payment schedule"
    );

    const parsed = approvalItems({
      deals: [deal()],
      contentItems: [],
      contracts: [contract({ status: "parsed" })],
      payments: [],
      shipments: [],
    });
    expect(parsed.find((item) => item.kind === "setup")?.detail).not.toContain("contract");
  });

  it("offers completion only when setup and every tracked record are complete", () => {
    const done = approvalItems({
      deals: [deal({ agreed_price: 0, current_offer: 0 })],
      contentItems: [content({ status: "verified" })],
      contracts: [contract()],
      payments: [],
      shipments: [{ deal_id: 1, status: "delivered" } as Shipment],
    });
    expect(done.some((item) => item.kind === "completion")).toBe(true);

    const open = approvalItems({
      deals: [deal({ agreed_price: 0, current_offer: 0 })],
      contentItems: [content({ status: "posted" })],
      contracts: [contract()],
      payments: [],
      shipments: [],
    });
    expect(open.some((item) => item.kind === "completion")).toBe(false);
  });

  it("counts each approval group for filter badges", () => {
    const items = approvalItems({
      deals: [deal()],
      contentItems: [content({ status: "submitted" })],
      contracts: [contract()],
      payments: [payment({ status: "approvable" })],
      shipments: [],
    });
    expect(approvalCounts(items)).toMatchObject({ content: 1, contracts: 0, money: 1 });
  });
});
