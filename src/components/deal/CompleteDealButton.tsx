"use client";

import { useState, useTransition } from "react";
import { moveDealStage } from "@/app/pipeline-actions";

/**
 * Closes a delivered deal out of the working pipeline. Warns when work or money is
 * still open, rather than blocking — sometimes a deal ends untidily.
 */
export default function CompleteDealButton({
  dealId,
  ready,
  openWork,
}: {
  dealId: number;
  ready: boolean;
  openWork: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    startTransition(async () => {
      setError(null);
      const result = await moveDealStage(dealId, "completed");
      if (result.error) setError(result.error);
    });
  };

  return (
    <div className="relative">
      <button
        onClick={run}
        disabled={isPending || !ready}
        title={ready ? "Everything delivered and paid" : openWork}
        className={`text-xs font-medium rounded-md px-3 py-1.5 border transition-colors disabled:opacity-50 ${
          ready
            ? "bg-brand text-white border-brand hover:bg-brand-dark"
            : "border-slate-200 text-slate-600"
        }`}
      >
        Mark completed
      </button>
      {error && (
        <p className="absolute right-0 top-full mt-1 w-72 rounded-md border border-red-200 bg-white p-2 text-[11px] text-red-700 shadow-lg z-20">
          {error}
        </p>
      )}
    </div>
  );
}
