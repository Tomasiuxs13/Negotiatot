"use client";

import { useTransition } from "react";
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

  const run = () => {
    if (!ready && !window.confirm(`${openWork} Mark this deal completed anyway?`)) return;
    startTransition(async () => {
      await moveDealStage(dealId, "completed");
    });
  };

  return (
    <button
      onClick={run}
      disabled={isPending}
      title={ready ? "Everything delivered and paid" : openWork}
      className={`text-xs font-medium rounded-md px-3 py-1.5 border transition-colors disabled:opacity-50 ${
        ready
          ? "bg-brand text-white border-brand hover:bg-brand-dark"
          : "border-slate-200 text-slate-600 hover:border-slate-400"
      }`}
    >
      Mark completed
    </button>
  );
}
