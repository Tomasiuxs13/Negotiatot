import type { Deal, DeclineReason } from "./types";
import { DECLINE_REASON_LABEL } from "./types";

export interface Outcomes {
  won: number;
  lost: number;
  open: number;
  /** Share of settled deals that closed. Null until something has actually settled. */
  winRate: number | null;
  /** Money you agreed to, across won deals. */
  wonValue: number;
  /** What the lost deals were last asking — the size of what walked away. */
  lostValue: number;
  reasons: { reason: DeclineReason; label: string; count: number; value: number }[];
}

/**
 * Win rate and why deals died. Only meaningful once losses are recorded honestly —
 * a pipeline where dead deals are deleted or parked forever reports 100% and teaches
 * you nothing.
 */
export function outcomes(deals: Deal[]): Outcomes {
  const won = deals.filter((d) => d.stage === "agreed" || d.stage === "completed");
  const lost = deals.filter((d) => d.stage === "declined");
  const open = deals.filter(
    (d) => !["agreed", "completed", "declined"].includes(d.stage)
  );

  const byReason = new Map<DeclineReason, { count: number; value: number }>();
  for (const d of lost) {
    const reason = (d.decline_reason ?? "other") as DeclineReason;
    const entry = byReason.get(reason) ?? { count: 0, value: 0 };
    entry.count += 1;
    entry.value += d.current_ask ?? d.first_ask ?? 0;
    byReason.set(reason, entry);
  }

  const settled = won.length + lost.length;

  return {
    won: won.length,
    lost: lost.length,
    open: open.length,
    winRate: settled > 0 ? won.length / settled : null,
    wonValue: won.reduce((s, d) => s + (d.agreed_price ?? 0), 0),
    lostValue: lost.reduce((s, d) => s + (d.current_ask ?? d.first_ask ?? 0), 0),
    reasons: [...byReason.entries()]
      .map(([reason, v]) => ({
        reason,
        label: DECLINE_REASON_LABEL[reason] ?? reason,
        count: v.count,
        value: v.value,
      }))
      .sort((a, b) => b.count - a.count),
  };
}
