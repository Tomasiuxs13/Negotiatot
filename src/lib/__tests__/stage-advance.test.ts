import { describe, expect, it } from "vitest";
import {
  stageAfterAnalysis,
  stageAfterContractConfirmed,
  stageAfterOffer,
  stageAfterTheirReply,
} from "../stage-advance";
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
  it("puts their first reply in In contact — answered, but nothing priced yet", () => {
    expect(stageAfterTheirReply("contacted", false)).toBe("in_contact");
    expect(stageAfterTheirReply("lead", false)).toBe("in_contact");
    expect(stageAfterTheirReply("in_contact", false)).toBe("in_contact");
  });

  it("leaves a priced deal in To review rather than dragging it back", () => {
    expect(stageAfterTheirReply("analyzing", false)).toBe("in_contact");
  });

  it("negotiates once one of our numbers is on the table", () => {
    expect(stageAfterTheirReply("contacted", true)).toBe("negotiating");
    expect(stageAfterTheirReply("offer_sent", false)).toBe("negotiating");
    expect(stageAfterTheirReply("negotiating", false)).toBe("negotiating");
  });
});

describe("settled deals", () => {
  it("are records, not steps — nothing here moves them", () => {
    for (const stage of ["agreed", "active", "completed", "declined"] as const) {
      expect(stageAfterOffer(stage)).toBe(stage);
      expect(stageAfterTheirReply(stage, true)).toBe(stage);
      expect(stageAfterAnalysis(stage)).toBe(stage);
    }
  });

  it("returns a real stage for every stage that exists", () => {
    for (const stage of ALL_STAGES) {
      expect(ALL_STAGES).toContain(stageAfterOffer(stage));
      expect(ALL_STAGES).toContain(stageAfterTheirReply(stage, false));
    }
  });
});

describe("stageAfterAnalysis", () => {
  it("is what makes To review mean a decision is ready", () => {
    expect(stageAfterAnalysis("lead")).toBe("analyzing");
    expect(stageAfterAnalysis("contacted")).toBe("analyzing");
    expect(stageAfterAnalysis("in_contact")).toBe("analyzing");
  });

  /** Re-pricing a live negotiation must not drag it backwards. */
  it("leaves a deal that is already past pricing where it is", () => {
    expect(stageAfterAnalysis("offer_sent")).toBe("offer_sent");
    expect(stageAfterAnalysis("negotiating")).toBe("negotiating");
    expect(stageAfterAnalysis("analyzing")).toBe("analyzing");
  });
});

describe("stageAfterContractConfirmed", () => {
  it("moves an agreed deal into delivery", () => {
    expect(stageAfterContractConfirmed("agreed")).toBe("active");
  });

  it("touches nothing else — re-confirming must not reopen a completed deal", () => {
    for (const stage of ALL_STAGES.filter((s) => s !== "agreed")) {
      expect(stageAfterContractConfirmed(stage)).toBe(stage);
    }
  });
});
