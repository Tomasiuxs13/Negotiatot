import { describe, expect, it } from "vitest";
import { recommendationIsBehind } from "../negotiation-state";
import type { Message } from "../types";

let seq = 0;
function msg(sender: Message["sender"], created_at: string, id?: number): Message {
  return { id: id ?? ++seq, deal_id: 1, sender, body: "x", meta: null, created_at } as Message;
}

describe("recommendationIsBehind", () => {
  it("is false on a deal nobody has replied to", () => {
    expect(recommendationIsBehind([])).toBe(false);
    expect(recommendationIsBehind([msg("us", "2026-09-01 10:00")])).toBe(false);
  });

  /** The reported case: their reply is logged by the sync, no recommendation exists. */
  it("is true when they replied and no recommendation has ever run", () => {
    expect(
      recommendationIsBehind([msg("us", "2026-09-01 10:00"), msg("them", "2026-09-01 11:00")])
    ).toBe(true);
  });

  it("is false when the recommendation already answers their latest message", () => {
    expect(
      recommendationIsBehind([
        msg("them", "2026-09-01 11:00"),
        msg("copilot", "2026-09-01 11:05"),
      ])
    ).toBe(false);
  });

  /** A reply that lands after a recommendation leaves that recommendation stale. */
  it("is true when a newer reply arrives after the recommendation", () => {
    expect(
      recommendationIsBehind([
        msg("them", "2026-09-01 11:00"),
        msg("copilot", "2026-09-01 11:05"),
        msg("them", "2026-09-02 09:00"),
      ])
    ).toBe(true);
  });

  it("breaks a same-second tie by row id, not by array order", () => {
    const reply = msg("them", "2026-09-01 11:00", 50);
    const reco = msg("copilot", "2026-09-01 11:00", 51);
    expect(recommendationIsBehind([reply, reco])).toBe(false);
    expect(recommendationIsBehind([reco, reply])).toBe(false);

    const laterReply = msg("them", "2026-09-01 11:00", 52);
    expect(recommendationIsBehind([reco, laterReply])).toBe(true);
  });

  it("compares ids numerically, so id 9 does not beat id 10", () => {
    expect(
      recommendationIsBehind([msg("them", "2026-09-01 11:00", 9), msg("copilot", "2026-09-01 11:00", 10)])
    ).toBe(false);
  });

  it("ignores our own outbound messages when deciding", () => {
    expect(
      recommendationIsBehind([
        msg("them", "2026-09-01 11:00"),
        msg("copilot", "2026-09-01 11:05"),
        msg("us", "2026-09-01 12:00"),
      ])
    ).toBe(false);
  });
});
