import { describe, expect, it } from "vitest";
import { daysToPublish, draftDueDate, shouldRequestDraft } from "../timeline";

describe("draftDueDate", () => {
  it("computes the draft deadline back from the publish slot", () => {
    expect(draftDueDate("2026-08-10")).toBe("2026-07-31"); // default T-10
    expect(draftDueDate("2026-08-10", 5)).toBe("2026-08-05");
  });

  it("crosses month boundaries", () => {
    expect(draftDueDate("2026-08-05")).toBe("2026-07-26");
  });
});

describe("shouldRequestDraft", () => {
  const today = "2026-07-31";

  it("fires exactly when the review window opens", () => {
    // Publishes Aug 10 → draft due Jul 31 → fires today, not yesterday.
    expect(shouldRequestDraft({ status: "planned", due_date: "2026-08-10" }, today)).toBe(true);
    expect(shouldRequestDraft({ status: "planned", due_date: "2026-08-11" }, today)).toBe(false);
  });

  it("stops asking once a draft has been submitted", () => {
    expect(shouldRequestDraft({ status: "submitted", due_date: "2026-08-10" }, today)).toBe(false);
    expect(shouldRequestDraft({ status: "approved", due_date: "2026-08-10" }, today)).toBe(false);
  });

  it("stays quiet without a publish date — there is no window to compute", () => {
    expect(shouldRequestDraft({ status: "planned", due_date: null }, today)).toBe(false);
  });
});

describe("daysToPublish", () => {
  it("counts down to the slot and goes negative after it", () => {
    expect(daysToPublish("2026-08-10", "2026-07-31")).toBe(10);
    expect(daysToPublish("2026-07-31", "2026-07-31")).toBe(0);
    expect(daysToPublish("2026-07-30", "2026-07-31")).toBe(-1);
  });
});
