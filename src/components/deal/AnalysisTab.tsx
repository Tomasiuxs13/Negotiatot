import type { Deal, DealAnalysis } from "@/lib/types";
import { money } from "@/lib/format";
import RunAnalysisButton from "./RunAnalysisButton";
import AnalyzingProgress from "./AnalyzingProgress";

/** The verdict as a single pill in the card header, not a tinted wrapper around
 *  everything. Tinting the whole panel made the amber "negotiable" state — by far the
 *  most common one — shout as loudly as a genuine problem. */
const VERDICT_PILL: Record<DealAnalysis["verdict"], { label: string; className: string }> = {
  accept: { label: "GOOD DEAL", className: "bg-emerald-100 text-emerald-800" },
  negotiate: { label: "NEGOTIABLE", className: "bg-amber-100 text-amber-800" },
  decline: { label: "WALK AWAY", className: "bg-red-100 text-red-800" },
};

const FLAG_ICON: Record<string, { icon: string; className: string }> = {
  good: { icon: "verified", className: "text-emerald-500" },
  warn: { icon: "priority_high", className: "text-amber-500" },
  crit: { icon: "error", className: "text-red-500" },
};

export default function AnalysisTab({
  deal,
  analyzedAt,
  playbookUpdatedAt,
}: {
  deal: Deal;
  /** When this stored analysis was produced — null if it predates usage logging. */
  analyzedAt?: string | null;
  /** Last rule edit; a newer Playbook makes this stored verdict historical. */
  playbookUpdatedAt?: string | null;
}) {
  if (!deal.analysis && deal.job_status === "analyzing") {
    return <AnalyzingProgress startedAt={deal.job_started_at} />;
  }

  if (!deal.analysis) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
        <p className="text-sm font-medium text-slate-700 mb-1">No analysis yet</p>
        <p className="text-sm text-slate-500 mb-4">
          Upload a report or add channel data, then run the analysis to get fair price, red flags,
          and your four numbers.
        </p>
        <RunAnalysisButton dealId={deal.id} />
      </div>
    );
  }

  const analysis = JSON.parse(deal.analysis) as DealAnalysis;
  const v = VERDICT_PILL[analysis.verdict];
  // A re-run in flight: unlike the first run, there is a previous analysis on screen —
  // which is exactly why the progress must be loud. Without it, attaching a report and
  // re-running looked like nothing happened: the old verdict just sat there unmarked.
  const reanalyzing = deal.job_status === "analyzing";
  const stale = Boolean(
    analyzedAt &&
      playbookUpdatedAt &&
      new Date(playbookUpdatedAt).getTime() > new Date(analyzedAt.replace(" ", "T") + "Z").getTime()
  );
  const flagged = analysis.metrics.filter((m) => m.tone === "crit" || m.tone === "warn").slice(0, 4);

  return (
    <div className="@container flex flex-col gap-6">
      {reanalyzing && (
        <AnalyzingProgress
          startedAt={deal.job_started_at}
          hint="Re-pricing this deal — everything below is the previous analysis and will be replaced when this finishes. You can leave this page."
        />
      )}
      {/* The stale-Playbook banner offers a re-run button; while one is already running
          it would be an invitation to do what is being done. */}
      {stale && !reanalyzing && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-amber-900">This analysis uses an older Playbook</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Your pricing or qualification rules changed after this verdict was produced.
            </p>
          </div>
          <RunAnalysisButton dealId={deal.id} compact />
        </div>
      )}
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-headline font-semibold text-lg text-slate-900">Why this verdict</h3>
          <div className="flex items-center gap-3">
            {analyzedAt && (
              <span className="text-xs text-slate-400">
                Analyzed <span className="font-tabular">{analyzedAt.slice(0, 16)}</span>
              </span>
            )}
            <RunAnalysisButton dealId={deal.id} compact />
            <span
              className={`text-[11px] font-semibold rounded-full px-2.5 py-1 tracking-wide ${v.className}`}
            >
              {v.label}
            </span>
          </div>
        </div>

        <div className="p-6">
          {/* The decision-critical figures stay chips: a ten-line paragraph buries
              "cost blows past the cap" in the middle of a sentence. */}
          {flagged.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-4">
              {flagged.map((m) => (
                <span
                  key={m.label}
                  className={`text-xs font-medium rounded-full px-2.5 py-1 border ${
                    m.tone === "crit"
                      ? "bg-red-50 border-red-200 text-red-700"
                      : "bg-amber-50 border-amber-200 text-amber-800"
                  }`}
                >
                  {m.label}: <span className="font-tabular font-semibold">{m.value}</span>
                </span>
              ))}
            </div>
          )}

          <p className="text-sm text-slate-600 leading-relaxed max-w-[80ch] mb-8">
            {analysis.verdictSummary}
          </p>

          <h4 className="text-[11px] uppercase font-semibold tracking-wider text-slate-500 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>
              fact_check
            </span>
            Red flags &amp; checks
          </h4>
          <ul className="grid grid-cols-1 @3xl:grid-cols-2 gap-4">
            {analysis.redFlags.map((f) => {
              const icon = FLAG_ICON[f.severity] ?? FLAG_ICON.warn;
              return (
                <li key={f.title} className="flex gap-3 text-sm">
                  <span
                    className={`material-symbols-outlined shrink-0 ${icon.className}`}
                    style={{ fontSize: 18 }}
                    aria-hidden
                  >
                    {icon.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="font-semibold text-slate-900">{f.title}</span>
                    <span className="text-slate-500"> — {f.detail}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
        <h3 className="font-headline text-sm font-semibold text-slate-900 mb-3">
          How your numbers were computed
        </h3>
        <div className="divide-y divide-slate-100">
          {analysis.numbers.map((n, i) => (
            <details key={n.label} className="py-2 first:pt-0 last:pb-0 group" open={i === 0}>
              <summary className="cursor-pointer text-sm font-semibold text-slate-900 flex items-center gap-2 list-none">
                <span
                  className="material-symbols-outlined text-slate-400 transition-transform group-open:rotate-90"
                  style={{ fontSize: 14 }}
                >
                  chevron_right
                </span>
                {n.label} <span className="font-tabular">{money(n.value)}</span>
              </summary>
              <p className="text-xs text-slate-500 mt-1.5 ml-6 max-w-[62ch]">{n.explanation}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
