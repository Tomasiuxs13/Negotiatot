import { describe, expect, it } from "vitest";
import {
  automaticGmailDeal,
  automaticOfferUpdate,
  automaticReplyStageUpdate,
  automaticSentStageUpdate,
  offerConfirmedBySentEmail,
} from "../gmail-automation";
import type { Deal } from "../types";

const deal = (
  id: number,
  stage: Deal["stage"],
  over: Partial<Pick<Deal, "round" | "contacted_at" | "current_offer">> = {}
) => ({
  id,
  stage,
  round: over.round ?? 0,
  contacted_at: over.contacted_at ?? null,
  current_offer: over.current_offer ?? null,
});

describe("automatic Gmail deal matching", () => {
  it("accepts one active negotiation and ignores terminal history", () => {
    expect(automaticGmailDeal([deal(1, "completed"), deal(2, "lead")])?.id).toBe(2);
  });

  it("refuses multiple live deals and agreed collaborations", () => {
    expect(automaticGmailDeal([deal(1, "lead"), deal(2, "agreed")])).toBeNull();
    expect(automaticGmailDeal([deal(1, "agreed")])).toBeNull();
  });
});

describe("automatic Gmail stage updates", () => {
  it("moves only a lead to contacted and retains the first contact timestamp", () => {
    expect(automaticSentStageUpdate(deal(1, "lead"), "2026-08-31 08:00:00")).toMatchObject({
      stage: "contacted",
      contacted_at: "2026-08-31 08:00:00",
      your_move: 0,
    });
    expect(
      automaticSentStageUpdate(
        deal(1, "lead", { contacted_at: "2026-08-01 09:00:00" }),
        "2026-08-31 08:00:00"
      )
    ).toMatchObject({ contacted_at: "2026-08-01 09:00:00" });
    expect(automaticSentStageUpdate(deal(1, "negotiating"), "2026-08-31 08:00:00")).toBeNull();
  });

  it("logs a reply as the manager's move and advances an offered deal", () => {
    expect(automaticReplyStageUpdate(deal(1, "offer_sent", { round: 2 }))).toMatchObject({
      stage: "negotiating",
      round: 3,
      your_move: 1,
      status_label: "Round 3 · your move",
    });
  });

  it("puts an unanswered outreach In contact rather than negotiating against nothing", () => {
    // Their first mail back is their ask. Calling that a negotiation skips the step
    // where the deal gets a number of its own to answer with — and calling it "To
    // review" claims a decision is ready before anything has been priced.
    expect(automaticReplyStageUpdate(deal(1, "contacted"))).toMatchObject({
      stage: "in_contact",
      round: 1,
      your_move: 1,
    });
    expect(
      automaticReplyStageUpdate(deal(1, "contacted", { current_offer: 800 }))
    ).toMatchObject({ stage: "negotiating" });
  });
});

describe("offerConfirmedBySentEmail", () => {
  it("accepts the figure when the sent email actually quotes it", () => {
    const body = "Here's what I can put on the table:\n\n- $200 per video for three integrations — $600 in fees total";
    expect(offerConfirmedBySentEmail(body, 600)).toBe(600);
  });

  it("accepts the grouped form a draft writes for a bigger fee", () => {
    expect(offerConfirmedBySentEmail("We can do $1,250 for the bundle.", 1250)).toBe(1250);
    expect(offerConfirmedBySentEmail("Happy to pay 1,250 USD.", 1250)).toBe(1250);
  });

  it("refuses a bare number — a view count is not a fee", () => {
    expect(offerConfirmedBySentEmail("Your videos average 600 views a day.", 600)).toBeNull();
    expect(offerConfirmedBySentEmail("Call me on 555 0600.", 600)).toBeNull();
  });

  it("refuses when the email quotes a different number than was recommended", () => {
    expect(offerConfirmedBySentEmail("I can offer $450 for this.", 600)).toBeNull();
  });

  it("does not match a longer number that merely contains it", () => {
    expect(offerConfirmedBySentEmail("The kit is worth $6,000.", 600)).toBeNull();
    expect(offerConfirmedBySentEmail("Budget is $60000.", 600)).toBeNull();
  });

  it("has nothing to confirm without a recommendation", () => {
    expect(offerConfirmedBySentEmail("$600 sounds right", null)).toBeNull();
    expect(offerConfirmedBySentEmail("$600 sounds right", 0)).toBeNull();
  });
});

describe("automaticOfferUpdate", () => {
  const deal = (over: Partial<Deal> = {}) =>
    ({ id: 1, stage: "contacted", round: 1, contacted_at: null, current_offer: null, ...over }) as Deal;

  it("records the offer and moves the deal, as pressing Mark as sent would", () => {
    expect(automaticOfferUpdate(deal(), 600)).toMatchObject({
      current_offer: 600,
      stage: "offer_sent",
      your_move: 0,
    });
  });

  it("writes nothing when the deal already holds that offer", () => {
    expect(automaticOfferUpdate(deal({ current_offer: 600 }), 600)).toBeNull();
  });

  it("does not rewind a live negotiation to offer_sent", () => {
    expect(automaticOfferUpdate(deal({ stage: "negotiating" }), 700)).toMatchObject({
      stage: "negotiating",
      current_offer: 700,
    });
  });
});
