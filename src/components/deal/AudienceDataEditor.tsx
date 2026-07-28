"use client";

import { useState, useTransition } from "react";
import { runAnalysis, saveAudienceData } from "@/app/deals/[id]/actions";
import { views as fmtViews } from "@/lib/format";

/**
 * The audience figures every price on this deal derives from, editable in place.
 *
 * They used to be capturable only at intake, which made a wrong number permanent. A
 * 445k-subscriber channel entered at 4,900 average views kept that figure through every
 * re-run and was priced at $100 a video — the analysis flagged the number as impossible
 * and still had to price on it, because nothing else was available.
 */
export default function AudienceDataEditor({
  dealId,
  avgViews,
  engagementRate,
  suspect,
}: {
  dealId: number;
  avgViews: number | null;
  engagementRate: number | null;
  /** Why this data looks wrong, when something has already noticed. */
  suspect?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState(avgViews == null ? "" : String(avgViews));
  const [rate, setRate] = useState(engagementRate == null ? "" : String(engagementRate));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty =
    views !== (avgViews == null ? "" : String(avgViews)) ||
    rate !== (engagementRate == null ? "" : String(engagementRate));

  const save = (thenReRun: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await saveAudienceData(
        dealId,
        views.trim() === "" ? null : Number(views),
        rate.trim() === "" ? null : Number(rate)
      );
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (thenReRun) {
        const run = await runAnalysis(dealId);
        if (run?.error) {
          setError(run.error);
          return;
        }
      }
      setOpen(false);
    });
  };

  if (!open) {
    return (
      <div
        className={`rounded-lg border p-3 flex items-center gap-3 flex-wrap ${
          suspect ? "bg-amber-50 border-amber-300/70" : "bg-white border-slate-200"
        }`}
      >
        <div className="text-xs text-slate-600">
          Priced from{" "}
          <span className="font-semibold text-slate-900 font-tabular">
            {avgViews == null ? "no view data" : `${fmtViews(avgViews)} avg views`}
          </span>
          {engagementRate != null && (
            <>
              {" · "}
              <span className="font-semibold text-slate-900 font-tabular">
                {engagementRate}% engagement
              </span>
            </>
          )}
        </div>
        {suspect && <p className="text-xs text-amber-800 basis-full">{suspect}</p>}
        <button
          onClick={() => setOpen(true)}
          className="ml-auto text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-400 rounded-md px-2.5 py-1 transition-colors"
        >
          Correct this
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-300 p-4 space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-slate-900">Audience data</h4>
        <p className="text-xs text-slate-500 mt-0.5 max-w-[70ch]">
          Every number on this deal — fair value, walk-away, breakeven and what the creator
          earns — is derived from these. Use the average views for the format you&apos;re
          buying: a channel average that blends Shorts into long-form will underprice an
          integration badly.
        </p>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <label className="block">
          <span className="block text-xs text-slate-600 mb-1">Avg views per piece</span>
          <input
            type="number"
            min="0"
            value={views}
            onChange={(e) => setViews(e.target.value)}
            placeholder="e.g. 79000"
            className="border border-slate-200 rounded-md px-2 py-1.5 text-sm text-slate-900 font-tabular w-36"
          />
        </label>
        <label className="block">
          <span className="block text-xs text-slate-600 mb-1">Engagement rate (%)</span>
          <input
            type="number"
            min="0"
            step="0.1"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="e.g. 3.7"
            className="border border-slate-200 rounded-md px-2 py-1.5 text-sm text-slate-900 font-tabular w-32"
          />
        </label>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => {
              setOpen(false);
              setError(null);
              setViews(avgViews == null ? "" : String(avgViews));
              setRate(engagementRate == null ? "" : String(engagementRate));
            }}
            disabled={isPending}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 px-2 py-1.5 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={() => save(false)}
            disabled={isPending || !dirty}
            className="text-xs font-medium border border-slate-200 hover:border-slate-400 text-slate-700 rounded-md px-3 py-1.5 transition-colors disabled:opacity-50"
          >
            Save
          </button>
          {/* Saving without re-analysing leaves the old prices on screen, computed from
              numbers that no longer apply, so this is the primary action. */}
          <button
            onClick={() => save(true)}
            disabled={isPending}
            className="text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-md px-3 py-1.5 transition-colors disabled:opacity-60"
          >
            {isPending ? "Working…" : "Save & re-analyze"}
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
