import { describe, expect, it } from "vitest";
import { dealPhase, type PhaseInput } from "../deal-phase";
import type { ContentItem, OnboardingTask, PaymentItem, Shipment } from "../fulfillment-types";

const task = (over: Partial<OnboardingTask>): OnboardingTask =>
  ({
    id: 1,
    partner_id: 7,
    deal_id: null,
    kind: "tracking_link",
    label: "Affiliate tracking link issued",
    owner: "us",
    value: null,
    status: "todo",
    position: 0,
    completed_at: null,
    created_at: "2026-07-01",
    ...over,
  }) as OnboardingTask;

const content = (over: Partial<ContentItem>): ContentItem =>
  ({ id: 1, deal_id: 1, title: "Video", platform: "youtube", status: "planned", ...over }) as ContentItem;

const payment = (over: Partial<PaymentItem>): PaymentItem =>
  ({ id: 1, deal_id: 1, description: "Fee", amount: 1000, status: "pending", ...over }) as PaymentItem;

const shipment = (over: Partial<Shipment>): Shipment =>
  ({ id: 1, deal_id: 1, product: "Headset", status: "to_prepare", ...over }) as Shipment;

const phase = (over: Partial<PhaseInput>) =>
  dealPhase({
    dealId: 1,
    partnerId: 7,
    onboarding: [],
    shipments: [],
    contentItems: [],
    payments: [],
    ...over,
  });

describe("dealPhase", () => {
  it("reports production progress and names the setup it outran", () => {
    // The case a single kanban column cannot express: filming has started while a
    // tracking link is still missing.
    const p = phase({
      onboarding: [task({})],
      contentItems: [
        content({ id: 1, status: "posted" }),
        content({ id: 2, status: "in_production" }),
        content({ id: 3, status: "planned" }),
      ],
      payments: [payment({})],
    });

    expect(p.label).toBe("Posted 1/3"); // one live, not one verified
    expect(p.behind).toBe("1 setup step missing");
    expect(p.tone).toBe("warn");
  });

  it("counts everything that is live, verified or not", () => {
    const p = phase({
      contentItems: [content({ id: 1, status: "verified" }), content({ id: 2, status: "posted" })],
      payments: [payment({})],
    });
    expect(p.label).toBe("Posted 2/2");
  });

  it("shows onboarding only while nothing else has started", () => {
    const p = phase({ onboarding: [task({}), task({ id: 2, kind: "coupon_code" })] });
    expect(p.key).toBe("setup");
    expect(p.label).toBe("Onboarding · 2 left");
    expect(p.tone).toBe("warn"); // both are blocking kinds
  });

  it("inherits the partner's shared setup but ignores another partner's", () => {
    const mine = phase({ onboarding: [task({ deal_id: null, partner_id: 7 })] });
    expect(mine.key).toBe("setup");

    const theirs = phase({ onboarding: [task({ deal_id: null, partner_id: 99 })] });
    expect(theirs.key).toBe("nothing_tracked");
  });

  it("surfaces the product when it is the thing holding filming up", () => {
    const toSend = phase({ shipments: [shipment({})], contentItems: [content({})] });
    expect(toSend.label).toBe("Product to send");
    expect(toSend.tone).toBe("warn");

    const inTransit = phase({
      shipments: [shipment({ status: "shipped" })],
      contentItems: [content({})],
    });
    expect(inTransit.label).toBe("Product in transit");
    expect(inTransit.tone).toBe("neutral");
  });

  it("stops mentioning the product once filming is under way", () => {
    const p = phase({
      shipments: [shipment({ status: "shipped" })],
      contentItems: [content({ status: "in_production" })],
    });
    expect(p.key).toBe("producing");
  });

  it("flags money that is ready to approve once the work is done", () => {
    const p = phase({
      contentItems: [content({ status: "verified" })],
      payments: [payment({ status: "approvable" })],
    });
    expect(p.label).toBe("Payment to approve");
    expect(p.tone).toBe("warn");
  });

  it("waits quietly when the money is approved but not yet sent", () => {
    const p = phase({
      contentItems: [content({ status: "verified" })],
      payments: [payment({ status: "approved" })],
    });
    expect(p.label).toBe("Awaiting payment");
    expect(p.tone).toBe("neutral");
  });

  it("calls a finished deal ready to wrap", () => {
    const p = phase({
      contentItems: [content({ status: "verified" })],
      payments: [payment({ status: "paid" })],
      onboarding: [task({ status: "done" })],
    });
    expect(p.key).toBe("ready_to_wrap");
    expect(p.tone).toBe("good");
    expect(p.behind).toBeNull();
  });

  it("says nothing rather than guessing when a deal has no work on it", () => {
    expect(phase({}).key).toBe("nothing_tracked");
  });

  it("keeps each deal's work separate", () => {
    const p = phase({
      contentItems: [content({ id: 1, deal_id: 2, status: "verified" })], // another deal
      payments: [payment({ id: 1, deal_id: 2 })],
    });
    expect(p.key).toBe("nothing_tracked");
  });

  it("does not call a non-blocking step behind", () => {
    // A pending welcome email shouldn't put a warning on a card mid-production.
    const p = phase({
      onboarding: [task({ kind: "onboarding_email", label: "Send onboarding email" })],
      contentItems: [content({ status: "in_production" })],
    });
    expect(p.behind).toBeNull();
    expect(p.tone).toBe("neutral");
  });
});
