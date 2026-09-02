import { money } from "@/lib/format";
import type { CostScopeLine } from "@/lib/ladder-notes";

/**
 * Can we afford this, and does it make money — the two questions the price ladder
 * cannot answer on its own.
 *
 * Note the two comparisons are deliberately against different figures. The budget test
 * is TOTAL cost (fee plus commission plus gifted product) against maxPerDeal, because
 * that is what actually leaves the account. The profitability test is the FEE against
 * breakeven, because breakeven is itself defined as the highest fee the unit economics
 * support — comparing total cost to breakeven would double-count the commission that is
 * already inside the breakeven calculation.
 */
export default function AffordabilityPanel({
  totalCost,
  fee,
  maxPerDeal,
  breakeven,
  scope,
}: {
  totalCost: number;
  /** The fee the ladder's target marker represents. */
  fee: number | null;
  maxPerDeal: number | null;
  breakeven: number | null;
  /** What the money buys. Without it the total is unreadable — see costScopeLine. */
  scope: CostScopeLine;
}) {
  const rows: { label: string; ok: boolean; verdict: string }[] = [];

  if (maxPerDeal != null && maxPerDeal > 0) {
    const ok = totalCost <= maxPerDeal;
    rows.push({
      label: `vs maxPerDeal ${money(maxPerDeal)}`,
      ok,
      verdict: ok ? "under" : `over by ${money(totalCost - maxPerDeal)}`,
    });
  }
  if (breakeven != null && fee != null) {
    const ok = fee <= breakeven;
    rows.push({
      label: `fee ${money(fee)} vs breakeven ${money(breakeven)}`,
      ok,
      verdict: ok ? "profitable" : "above breakeven",
    });
  }

  return (
    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
      <span className="text-[11px] uppercase font-semibold tracking-wider text-slate-500 block mb-1">
        Total deal cost
      </span>
      <span className="text-2xl font-semibold font-tabular text-slate-900 block">
        {money(totalCost)}
      </span>
      {/* An assumed bundle size must not read like a quoted one, so it does not get the
          same colour as a scope the manager actually wrote. */}
      <div className="mb-3 mt-0.5">
        <span className="block text-[12px] text-slate-600">{scope.text}</span>
        {scope.assumed && (
          <span
            className="block text-[11px] text-amber-700 mt-0.5"
            title="No deliverables are recorded on this deal, so the bundle size comes from the Playbook's minimum. Set the deliverables to price what you are actually asking for."
          >
            Assumed — no deliverables set on this deal
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-[11px] text-slate-400">
          Set a target and a per-deal cap to see whether this is affordable.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-2 flex-wrap text-[12px]">
              <span className={r.ok ? "text-slate-600" : "text-red-600 font-medium"}>
                {r.label}
              </span>
              <span
                className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                  r.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                }`}
              >
                {r.verdict}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
