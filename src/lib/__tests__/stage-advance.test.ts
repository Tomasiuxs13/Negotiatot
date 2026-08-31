import { describe, expect, it } from "vitest";
import { stageAfterOffer, stageAfterTheirReply } from "../stage-advance";
import { ALL_STAGES } from "../types";

describe("stageAfterOffer", () => {
  it("means Offer sent from every pre-offer stage, including the one that was missing", () => {
    expect(stageAfterOffer("contacted")).toBe("offer_sent");
    expect(stageAfterOffer("analyzing")).toBe("offer_sent");
    expect(stageAfterOffer("lead")).toBe("offer_sent");
  });

  it("leaves a running negotiation where it is — a counter is not a first offer", () => {
    expect(stageAfterOffer("negotiating")).toBe("negotiating");
  });
});

describe("stageAfterTheirReply", () => {
  it("treats their first reply as an ask to price, not a counter to negotiate", () => {
    expect(stageAfterTheirReply("contacted", false)).toBe("analyzing");
    expect(stageAfterTheirReply("analyzing", false)).toBe("analyzing");
  });

  it("negotiates once one of our numbers is on the table", () => {
    expect(stageAfterTheirReply("contacted", true)).toBe("negotiating");
    expect(stageAfterTheirReply("offer_sent", false)).toBe("negotiating");
    expect(stageAfterTheirReply("negotiating", false)).toBe("negotiating");
  });
});

describe("settled deals", () => {
  it("are records, not steps — nothing here moves them", () => {
    for (const stage of ["agreed", "completed", "declined"] as const) {
      expect(stageAfterOffer(stage)).toBe(stage);
      expect(stageAfterTheirReply(stage, true)).toBe(stage);
    }
  });

  it("returns a real stage for every stage that exists", () => {
    for (const stage of ALL_STAGES) {
      expect(ALL_STAGES).toContain(stageAfterOffer(stage));
      expect(ALL_STAGES).toContain(stageAfterTheirReply(stage, false));
    }
  });
});
