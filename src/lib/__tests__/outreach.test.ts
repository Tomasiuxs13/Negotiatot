import { describe, expect, it } from "vitest";
import { outreachStatus } from "../outreach";
import type { Deal, Message } from "../types";

const TODAY = "2026-07-22";

const deal = (over: Partial<Deal> = {}): Deal =>
  ({
    id: 1,
    creator: "Marta",
    stage: "contacted",
    contacted_at: "2026-07-15 09:00:00",
    updated_at: "2026-07-20 09:00:00",
    ...over,
  }) as Deal;

const msg = (over: Partial<Message>): Message =>
  ({ id: 1, deal_id: 1, sender: "us", body: "…", created_at: "2026-07-19 09:00:00", ...over }) as Message;

describe("outreachStatus", () => {
  it("says how long ago the outreach went when nothing has followed it", () => {
    const status = outreachStatus(deal(), [], TODAY);
    expect(status?.followUps).toBe(0);
    expect(status?.line).toBe("Reached out · 7d ago");
  });

  it("numbers each follow-up and dates it from the newest one", () => {
    const status = outreachStatus(
      deal(),
      [
        msg({ id: 1, created_at: "2026-07-18 09:00:00" }),
        msg({ id: 2, created_at: "2026-07-21 09:00:00" }),
      ],
      TODAY
    );
    expect(status?.followUps).toBe(2);
    expect(status?.line).toBe("Follow-up 2 · 1d ago");
  });

  it("ignores their replies and the Copilot — only what we sent is a touch", () => {
    const status = outreachStatus(
      deal(),
      [
        msg({ id: 1, sender: "them", created_at: "2026-07-21 09:00:00" }),
        msg({ id: 2, sender: "copilot", created_at: "2026-07-21 10:00:00" }),
      ],
      TODAY
    );
    expect(status?.followUps).toBe(0);
    expect(status?.line).toBe("Reached out · 7d ago");
  });

  it("falls back to updated_at for rows contacted before the column existed", () => {
    const status = outreachStatus(deal({ contacted_at: null }), [], TODAY);
    expect(status?.line).toBe("Reached out · 2d ago");
  });

  it("is only about the contacted stage — every other stage has its own story", () => {
    expect(outreachStatus(deal({ stage: "negotiating" }), [], TODAY)).toBeNull();
  });
});
