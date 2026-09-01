"use client";

import { useState, useTransition } from "react";
import { runRecommendation } from "@/app/deals/[id]/actions";
import { MAX_TAKE_LENGTH } from "@/lib/manager-take";

/**
 * Where the manager tells the Copilot what to offer.
 *
 * Until this existed the Copilot decided the number and the manager could only accept the
 * draft or write their own from scratch — "I want $200 a video for three videos" had
 * nowhere to go. Deal notes are explicitly context and never instructions, by design, so
 * this is the instruction channel and is labelled as one.
 *
 * A take that breaches the guardrails is refused here with the reason, before the call:
 * the usual cause is that the take covers more pieces than the deal was priced for, and
 * the fix is the deliverables, not a smaller number.
 */
export default function ManagerTakeBox({
  dealId,
  initialTake = "",
  busy = false,
  hasRecommendation,
}: {
  dealId: number;
  /** The instruction the current draft was built from, so a re-run keeps it. */
  initialTake?: string;
  busy?: boolean;
  hasRecommendation: boolean;
}) {
  const [take, setTake] = useState(initialTake);
  const [open, setOpen] = useState(!hasRecommendation && !initialTake ? false : Boolean(initialTake));
  const [error, setError] = useState<string | null>(null);
  /** Shown once, with a way past it: the manager owns the budget, not this box. */
  const [warning, setWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = (approveOverride = false) => {
    setError(null);
    if (!approveOverride) setWarning(null);
    startTransition(async () => {
      const result = await runRecommendation(dealId, take, approveOverride);
      if (result?.error) setError(result.error);
      else if (result?.warning) setWarning(result.warning);
      else setWarning(null);
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="self-start text-xs font-semibold text-brand-dark hover:underline"
      >
        + Tell the Copilot what to offer
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-brand/25 bg-brand/5 p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-bold tracking-[0.12em] text-brand-dark">YOUR TAKE</p>
        <span className="text-[11px] text-slate-400">
          {take.length}/{MAX_TAKE_LENGTH}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        What you want offered, in your words. It sets the number and the scope; the Copilot
        writes and argues it.
      </p>
      <textarea
        value={take}
        onChange={(event) => setTake(event.target.value.slice(0, MAX_TAKE_LENGTH))}
        rows={3}
        placeholder="e.g. offer $200 per video for 3 videos, and keep the exclusivity out"
        className="mt-2 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
      {error && (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
      {warning && (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2">
          <p className="text-xs text-amber-900">{warning}</p>
          <button
            onClick={() => run(true)}
            disabled={isPending || busy}
            className="mt-2 rounded-md border border-amber-400 bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-50"
          >
            {isPending ? "Drafting…" : "Draft it anyway"}
          </button>
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => run()}
          disabled={isPending || busy || !take.trim()}
          className="rounded-md bg-brand px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
        >
          {isPending || busy
            ? "Drafting…"
            : hasRecommendation
              ? "Redraft with my take"
              : "Draft this"}
        </button>
        {initialTake && take !== initialTake && (
          <button
            onClick={() => setTake(initialTake)}
            className="text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
