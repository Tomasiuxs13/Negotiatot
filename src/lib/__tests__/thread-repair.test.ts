import { describe, it, expect } from "vitest";
import { dependentCopilotIds, repairThread } from "../thread-repair";
import type { Message } from "@/lib/types";

const msg = (id: number, sender: Message["sender"], over: Partial<Message> = {}): Message =>
  ({
    id,
    deal_id: 147,
    sender,
    body: "…",
    meta: null,
    created_at: "2026-08-25 07:48:16",
    ...over,
  }) as Message;

describe("dependentCopilotIds", () => {
  it("takes recommendations generated after the deleted message — they read it", () => {
    // The real incident: wrong paste (27) triggered a reco (28) that stamped its $1,500
    // ask on the deal. Deleting 27 must take 28 with it.
    expect(dependentCopilotIds([msg(27, "them"), msg(28, "copilot")], 27)).toEqual([28]);
  });

  it("spares recommendations that predate the mistake", () => {
    expect(
      dependentCopilotIds([msg(10, "copilot"), msg(27, "them"), msg(28, "copilot")], 27)
    ).toEqual([28]);
  });
});

describe("repairThread", () => {
  const deal = { stage: "contacted", analysis: null, status_label: "Round 1 · Recommendation ready" };

  it("rewinds a wrong paste completely — the real incident's shape", () => {
    // Everything the paste caused (round 1, your move, $1,500 ask) must go with it.
    const r = repairThread([], deal);
    expect(r).toMatchObject({
      round: 0,
      your_move: 0,
      first_ask: null,
      current_ask: null,
      status_label: "Reached out · awaiting reply",
    });
    expect(r.stage).toBeUndefined();
  });

  it("keeps the ask fields untouched while any of their messages remain", () => {
    const r = repairThread([msg(1, "them")], deal);
    expect("first_ask" in r).toBe(false);
    expect(r.round).toBe(1);
    expect(r.your_move).toBe(1);
    expect(r.status_label).toBe("Round 1 · your move");
  });

  it("hands the move back to them when our reply is the latest", () => {
    const r = repairThread([msg(1, "them"), msg(2, "us")], deal);
    expect(r.your_move).toBe(0);
    expect(r.status_label).toBe("Round 1 · waiting on them");
  });

  it("ignores copilot messages when deciding whose move it is", () => {
    const r = repairThread([msg(1, "them"), msg(2, "us"), msg(3, "copilot")], deal);
    expect(r.your_move).toBe(0);
  });

  it("walks negotiating back to offer_sent when our offer is all that remains", () => {
    const r = repairThread([msg(2, "us")], { ...deal, stage: "negotiating" });
    expect(r.stage).toBe("offer_sent");
    expect(r.status_label).toBe("Offer sent · waiting on them");
  });

  it("walks negotiating back to analyzing or contacted when nothing remains", () => {
    expect(repairThread([], { ...deal, stage: "negotiating", analysis: "{}" }).stage).toBe(
      "analyzing"
    );
    expect(repairThread([], { ...deal, stage: "negotiating" }).stage).toBe("contacted");
  });

  it("never touches the stage while the thread still supports it", () => {
    expect(repairThread([msg(1, "them")], { ...deal, stage: "negotiating" }).stage).toBeUndefined();
  });
});
