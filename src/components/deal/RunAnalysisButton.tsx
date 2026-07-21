"use client";

import { useState, useTransition } from "react";
import { runAnalysis } from "@/app/deals/[id]/actions";

export default function RunAnalysisButton({
  dealId,
  compact = false,
}: {
  dealId: number;
  compact?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    startTransition(async () => {
      const result = await runAnalysis(dealId);
      if (result?.error) setError(result.error);
    });
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-red-600">{error}</span>}
        <button
          onClick={run}
          disabled={isPending}
          title="Re-run with current Playbook rules and deal data"
          className="flex items-center gap-1.5 border border-slate-200 hover:border-slate-400 text-slate-600 rounded-md py-1 px-2.5 text-xs font-medium transition-colors disabled:opacity-60"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>refresh</span>
          {isPending ? "Re-analyzing…" : "Re-run analysis"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={run}
        disabled={isPending}
        className="bg-brand hover:bg-brand-dark text-white rounded-md py-2 px-4 text-sm font-medium transition-colors shadow-sm disabled:opacity-60"
      >
        {isPending ? "Analyzing… (can take a minute)" : "Run analysis"}
      </button>
      {error && <p className="text-xs text-red-600 mt-2 max-w-md mx-auto">{error}</p>}
    </div>
  );
}
