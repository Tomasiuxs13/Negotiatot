import type { Deal, DealAnalysis } from "@/lib/types";
import { money } from "@/lib/format";
import RunAnalysisButton from "./RunAnalysisButton";
import AnalyzingProgress from "./AnalyzingProgress";
import AudienceDataEditor from "./AudienceDataEditor";
import { suspectAudienceData } from "@/lib/audience-sanity";

const VERDICT_STYLE: Record<
  DealAnalysis["verdict"],
  { label: string; wrap: string; badge: string }
> = {
  accept: {
    label: "GOOD DEAL",
    wrap: "bg-emerald-50 border-emerald-300/60",
    badge: "text-emerald-700 border-emerald-600",
  },
  negotiate: {
    label: "NEGOTIABLE",
    wrap: "bg-amber-50 border-amber-300/60",
    badge: "text-amber-700 border-amber-600",
  },
  decline: {
    label: "WALK AWAY",
    wrap: "bg-red-50 border-red-300/60",
    badge: "text-red-700 border-red-600",
  },
};

const METRIC_TONE: Record<string, string> = {
  good: "text-emerald-600",
  warn: "text-amber-600",
  crit: "text-red-600",
  neutral: "text-slate-500",
};

const FLAG_DOT: Record<string, string> = {
  good: "bg-emerald-500",
  warn: "bg-amber-400",
  crit: "bg-red-500",
};

export default function AnalysisTab({
  deal,
  followers,
}: {
  deal: Deal;
  followers?: number | null;
}) {
  if (!deal.analysis && deal.job_status === "analyzing") {
    return <AnalyzingProgress startedAt={deal.job_started_at} />;
  }

  if (!deal.analysis) {
    return (
      <div className="bg-white rounded-lg border border-dashed border-slate-300 p-10 text-center">
        <p className="text-sm font-medium text-slate-700 mb-1">No analysis yet</p>
        <p className="text-sm text-slate-500 mb-4">
          Upload a report or add channel data, then run the analysis to get fair price, red flags,
          and your three numbers.
        </p>
        <RunAnalysisButton dealId={deal.id} />
      </div>
    );
  }

  const analysis = JSON.parse(deal.analysis) as DealAnalysis;
  const v = VERDICT_STYLE[analysis.verdict];

  return (
    <div className="space-y-4">
      <div className="flex justify-end -mb-2">
        <RunAnalysisButton dealId={deal.id} compact />
      </div>

      {/* Shown always, not just on suspicion: views drive every number here, and until
          this existed a figure captured wrongly at intake could never be corrected. */}
      <AudienceDataEditor
        dealId={deal.id}
        avgViews={deal.avg_views}
        engagementRate={deal.engagement_rate}
        suspect={suspectAudienceData({ avgViews: deal.avg_views, followers })}
      />
      {/* Verdict banner. The decision-critical numbers surface as chips — a ten-line
          paragraph buries "cost blows past the cap" in the middle of a sentence. */}
      <div className={`p-4 rounded-lg border ${v.wrap}`}>
        <div className="flex gap-3 items-center flex-wrap mb-2">
          <span
            className={`font-headline font-bold text-xs tracking-widest border-[1.5px] rounded-md px-2.5 py-1.5 whitespace-nowrap ${v.badge}`}
          >
            {v.label}
          </span>
          {analysis.metrics
            .filter((m) => m.tone === "crit" || m.tone === "warn")
            .slice(0, 4)
            .map((m) => (
              <span
                key={m.label}
                className={`text-xs font-medium rounded-full px-2.5 py-1 border ${
                  m.tone === "crit"
                    ? "bg-red-50 border-red-200 text-red-700"
                    : "bg-amber-100/60 border-amber-300 text-amber-800"
                }`}
              >
                {m.label}: <span className="font-tabular font-semibold">{m.value}</span>
              </span>
            ))}
        </div>
        <p className="text-sm text-slate-700 max-w-[80ch]">{analysis.verdictSummary}</p>
      </div>

      {/* Metrics. Four hard columns inside the tab's ~560px min width gave each card
          about 130px, so labels like "Avg views / integration" wrapped to three lines
          and the value clipped. Two up until there is genuinely room for four. */}
      <div className="grid grid-cols-2 2xl:grid-cols-4 gap-4">
        {analysis.metrics.map((m) => (
          <div key={m.label} className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              {m.label}
            </div>
            <div className="text-xl font-semibold text-slate-900 font-tabular mt-1">{m.value}</div>
            <div className={`text-xs font-medium mt-0.5 ${METRIC_TONE[m.tone]}`}>{m.note}</div>
          </div>
        ))}
      </div>

      {/* Panels */}
      <div className="grid grid-cols-2 gap-4 items-start">
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
          <h3 className="font-headline text-sm font-semibold text-slate-900 mb-3">
            Red flags &amp; checks
          </h3>
          <div className="divide-y divide-slate-100">
            {analysis.redFlags.map((f) => (
              <div key={f.title} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${FLAG_DOT[f.severity]}`} />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{f.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 max-w-[60ch]">{f.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
          <h3 className="font-headline text-sm font-semibold text-slate-900 mb-3">
            How your numbers were computed
          </h3>
          <div className="divide-y divide-slate-100">
            {analysis.numbers.map((n, i) => (
              <details key={n.label} className="py-2 first:pt-0 last:pb-0 group" open={i === 0}>
                <summary className="cursor-pointer text-sm font-semibold text-slate-900 flex items-center gap-2 list-none">
                  <span className="material-symbols-outlined text-slate-400 transition-transform group-open:rotate-90" style={{ fontSize: 14 }}>
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
    </div>
  );
}
