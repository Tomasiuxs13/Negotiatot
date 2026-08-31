import { describe, expect, it } from "vitest";
import {
  automaticGmailDeal,
  automaticReplyStageUpdate,
  automaticSentStageUpdate,
} from "../gmail-automation";
import type { Deal } from "../types";

const deal = (
  id: number,
  stage: Deal["stage"],
  over: Partial<Pick<Deal, "round" | "contacted_at">> = {}
) => ({ id, stage, round: over.round ?? 0, contacted_at: over.contacted_at ?? null });

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
});
