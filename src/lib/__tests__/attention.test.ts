import { describe, expect, it } from "vitest";
import { attentionItems, classifyAttention, groupAttention } from "../attention";
import type { Deal } from "../types";
import type {
  ContentItem,
  Contract,
  OnboardingTask,
  PaymentItem,
  Shipment,
} from "../fulfillment-types";

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

const contract = (over: Partial<Contract>): Contract =>
  ({ id: 1, deal_id: 1, status: "confirmed", ...over }) as Contract;

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
    expect(fresh[0].id).toMatch(/^verdict-/);
    expect(fresh[0].severity).toBe("info");

    const stale = attentionItems({
      ...base,
      deals: [deal({ stage: "analyzing", analysis: "{}", job_status: null, updated_at: "2026-07-15 09:00:00" })],
    });
    expect(stale[0].severity).toBe("warning");
    // The wait is still stated, just compactly — the number is what matters.
    expect(stale[0].detail).toContain("7d");
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

describe("agreement setup exceptions", () => {
  const agreed = deal({ stage: "agreed", agreed_price: 2000 });

  it("combines missing contract, content and payment setup into one decision item", () => {
    const items = attentionItems({ ...base, deals: [agreed] });
    const gap = items.find((item) => item.id === "setup-gap-1")!;
    expect(gap.title).toContain("agreement setup incomplete");
    expect(gap.detail).toContain("confirmed signed contract");
    expect(gap.detail).toContain("content plan");
    expect(gap.detail).toContain("payment schedule");
    expect(gap.owner).toBe("us");
  });

  it("clears once the confirmed source and operational plan exist", () => {
    const items = attentionItems({
      ...base,
      deals: [agreed],
      contracts: [contract({})],
      contentItems: [content({})],
      payments: [payment({})],
    });
    expect(items.some((item) => item.id.startsWith("setup-gap-"))).toBe(false);
  });
});

describe("creator date requests", () => {
  it("puts a pending proposal in the manager's content queue without changing the real date", () => {
    const items = attentionItems({
      ...base,
      deals: [deal({ stage: "agreed" })],
      contentItems: [
        content({
          due_date: "2026-08-01",
          requested_due_date: "2026-08-08",
          due_date_request_reason: "The product arrived late",
        }),
      ],
    });
    const request = items.find((item) => item.id === "date-change-1")!;
    expect(request.detail).toContain("2026-08-01 → 2026-08-08");
    expect(request.group).toBe("content");
    expect(request.owner).toBe("us");
  });
});

describe("measurement nudges", () => {
  const measurementBase = { ...base, deals: [deal({ stage: "agreed" })] };
  const posted = (over: Partial<ContentItem>) =>
    content({ status: "verified", due_date: null, ...over });

  it("stays quiet while a platform's views are still settling", () => {
    const items = attentionItems({
      ...measurementBase,
      // YouTube needs 30 days; this went live 10 days ago.
      contentItems: [posted({ platform: "youtube", posted_at: "2026-07-12" })],
    });
    expect(items.some((i) => i.title.includes("ready to measure"))).toBe(false);
  });

  it("asks for results once the window closes", () => {
    const items = attentionItems({
      ...measurementBase,
      contentItems: [posted({ platform: "youtube", posted_at: "2026-06-01" })],
    });
    const nudge = items.find((i) => i.title.includes("ready to measure"))!;
    expect(nudge.detail).toContain("30-day window");
  });

  it("asks again when only a provisional number was logged", () => {
    const items = attentionItems({
      ...measurementBase,
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
      ...measurementBase,
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
      ...measurementBase,
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

describe("onboarding gaps", () => {
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

  const agreed = deal({ stage: "agreed", partner_id: 7 });

  it("escalates when content is already in production without a link", () => {
    const items = attentionItems({
      ...base,
      deals: [agreed],
      contentItems: [content({ status: "in_production" })],
      onboarding: [task({})],
    });
    const gap = items.find((i) => i.id.startsWith("onboarding-"))!;
    expect(gap.severity).toBe("warning");
    expect(gap.detail).toContain("already in production");
    // Short enough to read as a headline: the stored label is a whole sentence.
    expect(gap.title).toContain("no tracking link");
  });

  it("mentions it quietly while nothing has started", () => {
    const items = attentionItems({
      ...base,
      deals: [agreed],
      contentItems: [content({ status: "planned" })],
      onboarding: [task({})],
    });
    expect(items.find((i) => i.id.startsWith("onboarding-"))!.severity).toBe("info");
  });

  it("stays quiet once the blocking setup is done", () => {
    const items = attentionItems({
      ...base,
      deals: [agreed],
      contentItems: [content({ status: "in_production" })],
      onboarding: [task({ status: "done" })],
    });
    expect(items.some((i) => i.id.startsWith("onboarding-"))).toBe(false);
  });

  it("ignores steps that don't block tracking", () => {
    const items = attentionItems({
      ...base,
      deals: [agreed],
      contentItems: [content({ status: "in_production" })],
      onboarding: [task({ kind: "onboarding_email", label: "Send onboarding email" })],
    });
    expect(items.some((i) => i.id.startsWith("onboarding-"))).toBe(false);
  });

  it("applies a partner-level gap to that partner's deal only", () => {
    const other = deal({ id: 2, creator: "Other", stage: "agreed", partner_id: 99 });
    const items = attentionItems({
      ...base,
      deals: [agreed, other],
      contentItems: [],
      onboarding: [task({})],
    });
    const gaps = items.filter((i) => i.id.startsWith("onboarding-"));
    expect(gaps).toHaveLength(1);
    expect(gaps[0].title).toContain("Marta");
  });
});

describe("verdict vs your-move overlap", () => {
  const analyzed = { stage: "analyzing" as const, analysis: "{}", job_status: null };

  it("shows one item, not two, once the Copilot has drafted a move", () => {
    // Both used to fire for the same deal: "verdict ready to review" and "your move".
    const items = attentionItems({
      ...base,
      deals: [deal({ ...analyzed, your_move: 1 })],
    });
    const forThisDeal = items.filter((i) => i.title.startsWith("Marta"));
    expect(forThisDeal).toHaveLength(1);
    expect(forThisDeal[0].title).toContain("your move");
  });

  it("still asks for a decision when no recommendation is waiting", () => {
    const items = attentionItems({ ...base, deals: [deal({ ...analyzed, your_move: 0 })] });
    expect(items.some((i) => i.id.startsWith("verdict-"))).toBe(true);
  });
});

describe("manager reminders", () => {
  const reminder = (over: Partial<import("../reminders").Reminder>) =>
    ({
      id: 9,
      title: "Reach out again — they asked for 3 months",
      due_on: TODAY,
      partner_id: 4,
      deal_id: null,
      status: "open",
      done_at: null,
      created_at: "2026-04-22 09:00:00",
      ...over,
    }) as import("../reminders").Reminder;

  it("surfaces a reminder the day it comes due, linked to its subject", () => {
    const items = attentionItems({ ...base, reminders: [reminder({})] });
    const hit = items.find((i) => i.id === "reminder-9");
    expect(hit?.title).toContain("Reach out again");
    expect(hit?.detail).toBe("due today");
    expect(hit?.href).toBe("/partners/4");
  });

  it("stays quiet before the date and after it's done", () => {
    expect(
      attentionItems({ ...base, reminders: [reminder({ due_on: "2026-07-23" })] })
    ).toEqual([]);
    expect(
      attentionItems({ ...base, reminders: [reminder({ status: "done" })] })
    ).toEqual([]);
  });

  it("escalates a reminder ignored for over a week", () => {
    const items = attentionItems({ ...base, reminders: [reminder({ due_on: "2026-07-10" })] });
    const hit = items.find((i) => i.id === "reminder-9");
    expect(hit?.severity).toBe("critical");
    expect(hit?.detail).toBe("due 12 days ago");
  });

  it("prefers the deal page and names the creator when attached to a deal", () => {
    const items = attentionItems({
      ...base,
      reminders: [reminder({ deal_id: 1, partner_id: null })],
    });
    const hit = items.find((i) => i.id === "reminder-9");
    expect(hit?.href).toBe("/deals/1");
    expect(hit?.detail).toBe("Marta · due today");
  });
});

describe("draft request trigger", () => {
  const agreedDeal = deal({ stage: "agreed", creator: "Marta" });

  it("asks for the draft when the review window opens on an agreed deal", () => {
    // TODAY is 2026-07-22; publish Aug 1 → draft due Jul 22 → window just opened.
    const items = attentionItems({
      ...base,
      deals: [agreedDeal],
      contentItems: [content({ status: "planned", due_date: "2026-08-01" })],
    });
    const hit = items.find((i) => i.id === "draft-request-1");
    expect(hit?.title).toBe("Request the draft from Marta");
    expect(hit?.detail).toContain("publishes in 10 days");
    expect(hit?.severity).toBe("warning");
  });

  it("escalates when the slot is under a week away", () => {
    const items = attentionItems({
      ...base,
      deals: [agreedDeal],
      contentItems: [content({ status: "planned", due_date: "2026-07-25" })],
    });
    expect(items.find((i) => i.id === "draft-request-1")?.severity).toBe("critical");
  });

  it("stays quiet before the window, after submission, and off agreed deals", () => {
    const before = attentionItems({
      ...base,
      deals: [agreedDeal],
      contentItems: [content({ status: "planned", due_date: "2026-08-02" })],
    });
    expect(before.find((i) => i.id === "draft-request-1")).toBeUndefined();

    const submitted = attentionItems({
      ...base,
      deals: [agreedDeal],
      contentItems: [content({ status: "submitted", due_date: "2026-08-01" })],
    });
    expect(submitted.find((i) => i.id === "draft-request-1")).toBeUndefined();

    const negotiating = attentionItems({
      ...base,
      contentItems: [content({ status: "planned", due_date: "2026-08-01" })],
    });
    expect(negotiating.find((i) => i.id === "draft-request-1")).toBeUndefined();
  });
});

describe("classifyAttention", () => {
  it("splits chase-them from do-it-yourself", () => {
    // The distinction the flat list could not make: both are on your screen, neither is
    // the same job.
    expect(classifyAttention("draft-request-4").owner).toBe("creator");
    expect(classifyAttention("draft-review-4").owner).toBe("us");
  });

  it("gives an in-transit shipment no owner — nobody can speed up a courier", () => {
    expect(classifyAttention("shipment-stuck-2").owner).toBeNull();
    expect(classifyAttention("shipment-prepare-2").owner).toBe("us");
  });

  it("keeps the two content- rules apart despite the shared prefix", () => {
    expect(classifyAttention("content-overdue-9").group).toBe("content");
    expect(classifyAttention("content-soon-9").group).toBe("content");
    expect(classifyAttention("content-overdue-9").owner).toBe("creator");
  });

  it("files an unrecognised id rather than dropping it", () => {
    // A new rule nobody wired up must still be visible; silently vanishing is the
    // failure that would go unnoticed.
    expect(classifyAttention("brand-new-rule-1")).toEqual({ group: "followups", owner: "us" });
  });

  it("classifies every rule the engine actually emits", () => {
    const emitted = attentionItems({
      deals: [
        deal({ id: 1, your_move: 1 }),
        deal({ id: 2, stage: "lead", updated_at: "2026-06-01 09:00:00" }),
      ],
      contentItems: [],
      shipments: [],
      payments: [],
      today: TODAY,
    });
    expect(emitted.length).toBeGreaterThan(0);
    for (const item of emitted) {
      expect(item.group).toBeDefined();
      // "followups" is the fallback, so a real rule landing there means it was missed.
      if (!item.id.startsWith("reminder-") && !item.id.startsWith("revisit-") && !item.id.startsWith("wrap-up-")) {
        expect(item.group).not.toBe("followups");
      }
    }
  });
});

describe("groupAttention", () => {
  const item = (id: string, severity: "critical" | "warning" | "info") => ({
    id,
    severity,
    title: id,
    detail: "",
    href: "#",
    ...classifyAttention(id),
  });

  it("leads with whatever is most on fire, not a fixed menu", () => {
    // Grouping must never bury a critical item under a heading that always sits last.
    const buckets = groupAttention([
      item("your-move-1", "info"),
      item("reminder-1", "critical"),
      item("payment-1", "warning"),
    ]);
    expect(buckets.map((b) => b.key)).toEqual(["followups", "money", "negotiation"]);
  });

  it("breaks ties between equally urgent groups in a stable order", () => {
    const buckets = groupAttention([
      item("your-move-1", "warning"),
      item("payment-1", "warning"),
      item("draft-review-1", "warning"),
    ]);
    expect(buckets.map((b) => b.key)).toEqual(["content", "money", "negotiation"]);
  });

  it("counts what is somebody else's move per group", () => {
    const buckets = groupAttention([
      item("draft-request-1", "warning"),
      item("content-overdue-1", "critical"),
      item("draft-review-1", "warning"),
    ]);
    expect(buckets[0].key).toBe("content");
    expect(buckets[0].waitingOnThem).toBe(2);
  });

  it("sorts inside a group by severity", () => {
    const buckets = groupAttention([
      item("draft-review-1", "info"),
      item("content-overdue-1", "critical"),
    ]);
    expect(buckets[0].items.map((i) => i.severity)).toEqual(["critical", "info"]);
  });

  it("returns nothing for an empty worklist", () => {
    expect(groupAttention([])).toEqual([]);
  });
});
