"use client";

import { useEffect, useState } from "react";

interface Stage {
  /** Percent at which this label takes over. */
  at: number;
  label: string;
}

const DEFAULT_STAGES: Stage[] = [
  { at: 0, label: "Reading the inputs" },
  { at: 22, label: "Checking your Playbook" },
  { at: 45, label: "Researching the channel" },
  { at: 68, label: "Computing your four numbers" },
  { at: 88, label: "Finishing up" },
];

/** UTC timestamp "YYYY-MM-DD HH:MM:SS" → epoch ms. Stored without a zone marker. */
function parseStarted(startedAt: string | null): number {
  if (!startedAt) return Date.now();
  const ms = Date.parse(startedAt.slice(0, 19).replace(" ", "T") + "Z");
  return Number.isNaN(ms) ? Date.now() : ms;
}

/**
 * A progress bar for a job with no real progress signal — a single Claude call.
 *
 * Rather than fake motion, it charts elapsed time against a typical duration on a
 * decaying curve: quick at first, easing toward a 95% ceiling it never crosses, so it
 * can't claim done before the work is. When the result lands, the poller refreshes and
 * this unmounts. If it genuinely overruns the estimate, it keeps creeping toward the
 * ceiling instead of stalling on a hard number.
 */
export default function AnalyzingProgress({
  startedAt,
  estimateSeconds = 60,
  hint = "Reading the inputs, checking the Playbook, computing your four numbers. You can leave this page — the result will be here.",
  stages = DEFAULT_STAGES,
}: {
  startedAt: string | null;
  estimateSeconds?: number;
  hint?: string;
  stages?: Stage[];
}) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const start = parseStarted(startedAt);
    const tau = (estimateSeconds * 1000) / 2.3; // time constant of the decay curve
    const tick = () => {
      const elapsed = Date.now() - start;
      setPct(Math.min(95, 95 * (1 - Math.exp(-elapsed / tau))));
    };
    tick();
    const id = setInterval(tick, 400);
    return () => clearInterval(id);
  }, [startedAt, estimateSeconds]);

  const rounded = Math.round(pct);
  const stage = [...stages].reverse().find((s) => rounded >= s.at) ?? stages[0];

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-8">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5 text-sm font-medium text-slate-800">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand" />
          </span>
          {stage.label}…
        </div>
        <span className="text-sm font-semibold font-tabular text-slate-900">{rounded}%</span>
      </div>

      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="text-xs text-slate-500 mt-3 max-w-md">{hint}</p>
    </div>
  );
}
