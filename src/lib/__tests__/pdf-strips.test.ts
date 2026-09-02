import { describe, expect, it } from "vitest";
import { MAX_STRIPS, planStrips, STRIP_HEIGHT, STRIP_OVERLAP } from "../pdf-strips";

describe("planStrips", () => {
  it("cuts the real Modash render — 14404 px — into overlapping page-shaped strips", () => {
    const plan = planStrips(14404);
    expect(plan.length).toBe(11);
    expect(plan[0]).toEqual({ top: 0, height: STRIP_HEIGHT });
    // Each strip starts one overlap before the previous one ended.
    expect(plan[1].top).toBe(STRIP_HEIGHT - STRIP_OVERLAP);
    const last = plan.at(-1)!;
    expect(last.top + last.height).toBe(14404);
  });

  it("covers every row — no gap between strips", () => {
    const plan = planStrips(5000);
    for (let i = 1; i < plan.length; i++) {
      expect(plan[i].top).toBeLessThan(plan[i - 1].top + plan[i - 1].height);
    }
  });

  it("leaves a normal page as one strip", () => {
    expect(planStrips(1200)).toEqual([{ top: 0, height: 1200 }]);
  });

  it("never emits a zero-height strip when the page divides exactly", () => {
    const step = STRIP_HEIGHT - STRIP_OVERLAP;
    const plan = planStrips(step * 3 + STRIP_OVERLAP);
    expect(plan.every((s) => s.height > 0)).toBe(true);
    expect(plan.at(-1)!.top + plan.at(-1)!.height).toBe(step * 3 + STRIP_OVERLAP);
  });

  it("caps at a dashboard, not a book", () => {
    expect(MAX_STRIPS).toBe(16);
    expect(planStrips(14404).length).toBeLessThanOrEqual(MAX_STRIPS);
  });
});
