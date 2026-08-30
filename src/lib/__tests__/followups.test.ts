import { describe, expect, it } from "vitest";
import { getFollowUpCandidate, getFollowUpCandidates } from "../followups";
import type { Deal, Message } from "../types";

const deal = (over: Partial<Deal> = {}): Deal =>
  ({
    id: 12,
    creator: "Marta",
    stage: "offer_sent",
    your_move: 0,
    updated_at: "2026-07-01 09:00:00",
    ...over,
  }) as Deal;

const message = (over: Partial<Message> = {}): Message =>
  ({
    id: 7,
    deal_id: 12,
    sender: "us",
    body: "Here is our proposal",
    meta: null,
    created_at: "2026-07-18 09:00:00",
    ...over,
  }) as Message;

describe("getFollowUpCandidate", () => {
  it("waits three full days from the last outgoing message, not the deal edit time", () => {
    const current = deal({ updated_at: "2026-07-22 10:00:00" });
    expect(getFollowUpCandidate(current, [message()], null, { today: "2026-07-20" })).toBeNull();

    const due = getFollowUpCandidate(current, [message()], null, { today: "2026-07-21" });
    expect(due?.daysWaiting).toBe(3);
    expect(due?.draft).toContain("proposal I sent");
  });

  it("does not chase when there is a later creator reply or when it is our move", () => {
    const replied = getFollowUpCandidate(
      deal(),
      [message(), message({ id: 8, sender: "them", created_at: "2026-07-20 09:00:00" })],
      null,
      { today: "2026-07-25" }
    );
    expect(replied).toBeNull();
    expect(getFollowUpCandidate(deal({ your_move: 1 }), [message()], null, { today: "2026-07-25" })).toBeNull();
  });

  it("uses a negotiation-specific draft and honours a snooze for its outbound anchor", () => {
    const active = deal({ stage: "negotiating" });
    const snoozed = getFollowUpCandidate(
      active,
      [message()],
      {
        deal_id: 12,
        anchor_message_id: 7,
        anchor_at: "2026-07-18 09:00:00",
        snoozed_until: "2026-07-26",
        updated_at: "2026-07-22 09:00:00",
      },
      { today: "2026-07-25" }
    );
    expect(snoozed).toBeNull();

    const due = getFollowUpCandidate(active, [message()], null, { today: "2026-07-25" });
    expect(due?.draft).toContain("last conversation");
  });

  it("lets dashboard use the conversation thread for each deal", () => {
    const candidates = getFollowUpCandidates(
      [deal()],
      new Map([[12, [message()]]]),
      new Map(),
      { today: "2026-07-22" }
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].anchorMessageId).toBe(7);
  });
});
