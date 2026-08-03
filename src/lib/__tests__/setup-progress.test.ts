import { describe, it, expect } from "vitest";
import { setupProgress, setupState } from "../setup-progress";
import type { OnboardingTask } from "../fulfillment-types";

const task = (over: Partial<OnboardingTask> = {}): OnboardingTask =>
  ({
    id: 1,
    partner_id: 5,
    deal_id: null,
    kind: "tracking_link",
    label: "Affiliate tracking link issued",
    owner: "us",
    value: null,
    status: "todo",
    position: 0,
    completed_at: null,
    created_at: "2026-07-01 09:00:00",
    ...over,
  }) as OnboardingTask;

describe("setupProgress", () => {
  it("returns null when the creator has no checklist — nothing promised, nothing late", () => {
    expect(setupProgress([], 5)).toBeNull();
    expect(setupProgress([task({ partner_id: 99 })], 5)).toBeNull();
  });

  it("counts done against total", () => {
    const p = setupProgress(
      [
        task({ status: "done" }),
        task({ kind: "coupon_code", status: "done" }),
        task({ kind: "onboarding_email" }),
      ],
      5
    );
    expect(p).toMatchObject({ done: 2, total: 3 });
  });

  it("names only the unfinished steps other work depends on", () => {
    const p = setupProgress(
      [task({ kind: "onboarding_email" }), task({ kind: "tracking_link" })],
      5
    );
    // The welcome email is outstanding too, but nothing breaks without it.
    expect(p?.blockingLeft).toEqual(["tracking_link"]);
  });

  it("counts only this partner's steps", () => {
    const p = setupProgress([task({ status: "done" }), task({ partner_id: 99 })], 5);
    expect(p).toMatchObject({ done: 1, total: 1 });
  });
});

describe("setupState", () => {
  it("separates blocked from merely in progress", () => {
    // Collapsing these into one "incomplete" hides the only one that costs money.
    expect(setupState({ done: 1, total: 3, blockingLeft: ["tracking_link"] })).toBe("blocked");
    expect(setupState({ done: 1, total: 3, blockingLeft: [] })).toBe("in_progress");
  });

  it("reports a finished checklist as ready", () => {
    expect(setupState({ done: 3, total: 3, blockingLeft: [] })).toBe("ready");
  });

  it("reports no checklist as none, not as ready", () => {
    // A creator nobody has started onboarding is not set up; they are unstarted.
    expect(setupState(null)).toBe("none");
  });
});
