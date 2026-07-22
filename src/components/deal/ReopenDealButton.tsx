"use client";

import { useTransition } from "react";
import { reopenDealAction } from "@/app/pipeline-actions";

/** Brings a lost deal back — a creator who said no in July may say yes in October. */
export default function ReopenDealButton({ dealId }: { dealId: number }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(async () => void (await reopenDealAction(dealId)))}
      disabled={isPending}
      title="Put this deal back into Negotiating and clear the loss record"
      className="text-xs font-medium rounded-md px-3 py-1.5 border border-slate-200 text-slate-600 hover:border-brand hover:text-brand-dark transition-colors disabled:opacity-50"
    >
      {isPending ? "Reopening…" : "Reopen"}
    </button>
  );
}
