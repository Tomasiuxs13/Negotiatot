"use client";

import { useRef, useState, useTransition } from "react";
import { attachReportAndAnalyze, runAnalysis } from "@/app/deals/[id]/actions";
import { views as fmtViews } from "@/lib/format";

/**
 * The first analysis, with its inputs on screen at the moment you start it.
 *
 * Before this, "Run analysis" was a bare button and the report upload was a separate
 * card in another column, so the commonest mistake was silent: run the analysis, spend
 * the call, and get a verdict priced on a channel URL because the Modash PDF was never
 * attached. Nothing said what the run would use, and nothing said what was missing.
 *
 * So the button names what it is about to do — "Analyze with this report" or "Run
 * without a report" — and the checklist above it is the evidence inventory. Attaching
 * the file happens here rather than somewhere else on the page.
 */
export default function RunAnalysisBlock({
  dealId,
  channelUrl,
  avgViews,
  engagementRate,
  hasMessage,
}: {
  dealId: number;
  channelUrl: string | null;
  avgViews: number | null;
  engagementRate: number | null;
  hasMessage: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The page-shape warning: shown once, with a way past it. */
  const [warning, setWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = (accept = false) => {
    setError(null);
    if (!accept) setWarning(null);
    const file = fileRef.current?.files?.[0];
    startTransition(async () => {
      if (file) {
        const fd = new FormData();
        fd.set("report", file);
        const r = await attachReportAndAnalyze(dealId, fd, accept);
        if (r?.error) setError(r.error);
        else if (r?.warning) setWarning(r.warning);
        return;
      }
      const r = await runAnalysis(dealId);
      if (r?.error) setError(r.error);
    });
  };

  const rows = [
    {
      key: "audience",
      on: avgViews != null,
      label: "Known audience",
      detail:
        avgViews != null
          ? `${fmtViews(avgViews)} avg views${engagementRate != null ? ` · ${engagementRate}% engagement` : ""}`
          : "Not set — the report or web research has to supply it",
    },
    {
      key: "channel",
      on: Boolean(channelUrl),
      label: "Channel URL",
      detail: channelUrl ? "Counterpart researches the channel" : "None — no web research possible",
    },
    {
      key: "message",
      on: hasMessage,
      label: "Their message",
      detail: hasMessage ? "Their ask is read from the thread" : "Nothing from them yet — we open the pricing",
    },
  ];

  // The case worth shouting about: no document and no figures is a verdict built on
  // whatever the web turns up, which is exactly the analysis people distrust later.
  const thin = fileName == null && avgViews == null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h3 className="font-headline text-sm font-semibold text-slate-900">Run the analysis</h3>
      <p className="text-xs text-slate-500 mt-0.5">
        Fair price, red flags and your four numbers — priced on the evidence below.
      </p>

      <div className="mt-3.5 rounded-lg border border-slate-200 divide-y divide-slate-100">
        {/* The report first and inside this block: it is the one input that changes the
            answer most, and the one that used to live somewhere else entirely. */}
        <div className="p-3">
          <div className="flex items-start gap-2.5">
            <span
              className={`material-symbols-outlined shrink-0 ${
                fileName ? "text-emerald-600" : "text-amber-500"
              }`}
              style={{ fontSize: 18 }}
            >
              {fileName ? "check_circle" : "upload_file"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-800">Analytics report</p>
              <p className="text-xs text-slate-500 [overflow-wrap:anywhere]">
                {fileName ?? "Not attached — a Modash/HypeAuditor PDF, or a screenshot of their stats"}
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => {
                  setFileName(e.target.files?.[0]?.name ?? null);
                  setError(null);
                }}
                className="mt-1.5 block w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border file:border-slate-200 file:bg-white file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:border-slate-400 file:cursor-pointer"
              />
            </div>
          </div>
        </div>

        {rows.map((r) => (
          <div key={r.key} className="flex items-start gap-2.5 p-3">
            <span
              className={`material-symbols-outlined shrink-0 ${
                r.on ? "text-emerald-600" : "text-slate-300"
              }`}
              style={{ fontSize: 18 }}
            >
              {r.on ? "check_circle" : "radio_button_unchecked"}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-800">{r.label}</p>
              <p className="text-xs text-slate-500 [overflow-wrap:anywhere]">{r.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {thin && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No report and no known views. The analysis will price on whatever the web turns
          up — attach the report above, or set the audience figures first.
        </p>
      )}

      <button
        onClick={() => run()}
        disabled={isPending}
        className="mt-3 w-full rounded-md bg-brand py-2 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark disabled:opacity-60"
      >
        {isPending
          ? "Starting…"
          : fileName
            ? "Analyze with this report"
            : "Run analysis without a report"}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {warning && (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="text-xs text-amber-900">{warning}</p>
          <button
            onClick={() => run(true)}
            disabled={isPending}
            className="mt-2 rounded-md border border-amber-400 bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            {isPending ? "Analyzing…" : "Analyze it anyway"}
          </button>
        </div>
      )}
    </div>
  );
}
