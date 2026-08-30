"use client";

import { useState, useTransition } from "react";
import type { FollowUpCandidate } from "@/lib/followups";
import { markFollowUpSent, snoozeFollowUpForTwoDays } from "@/app/deals/[id]/followup-actions";

export default function FollowUpComposer({
  dealId,
  followUp,
}: {
  dealId: number;
  followUp: FollowUpCandidate;
}) {
  const [draft, setDraft] = useState(followUp.draft);
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState<"sent" | "snoozed" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy the draft. Select the text and copy it manually.");
    }
  };

  const markSent = () => {
    setError(null);
    startTransition(async () => {
      const result = await markFollowUpSent(dealId, draft);
      if (result.error) setError(result.error);
      else setDone("sent");
    });
  };

  const snooze = () => {
    setError(null);
    startTransition(async () => {
      const result = await snoozeFollowUpForTwoDays(dealId);
      if (result.error) setError(result.error);
      else setDone("snoozed");
    });
  };

  if (done === "sent") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        Follow-up recorded. The next reminder will wait three days from this message.
      </div>
    );
  }

  if (done === "snoozed") {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        Follow-up snoozed for two days.
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-brand/35 bg-brand/5 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand/20 bg-brand/10 px-4 py-2.5">
        <div>
          <p className="text-[10px] font-bold tracking-[0.13em] text-brand-dark">FOLLOW-UP READY</p>
          <p className="text-sm font-semibold text-slate-900">
            No reply for {followUp.daysWaiting} day{followUp.daysWaiting === 1 ? "" : "s"}
          </p>
        </div>
        <span className="text-xs text-slate-500">
          {followUp.stage === "offer_sent" ? "Proposal sent" : "Negotiation in progress"}
        </span>
      </div>
      <div className="p-4">
        <label htmlFor={`follow-up-${dealId}`} className="sr-only">
          Editable follow-up draft
        </label>
        <textarea
          id={`follow-up-${dealId}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={6}
          className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 whitespace-pre-line focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/35 resize-y"
        />
        <p className="mt-2 text-xs text-slate-500">
          Copy and send this in your email app, then record it here. Nothing is sent from Counterpart.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copy}
            disabled={!draft.trim() || isPending}
            className="rounded-md bg-brand px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-dark disabled:opacity-50"
          >
            {copied ? "Copied ✓" : "Copy draft"}
          </button>
          <button
            type="button"
            onClick={markSent}
            disabled={!draft.trim() || isPending}
            className="rounded-md border border-slate-200 px-3.5 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Mark follow-up sent"}
          </button>
          <button
            type="button"
            onClick={snooze}
            disabled={isPending}
            className="rounded-md px-3.5 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800 disabled:opacity-50"
          >
            Snooze 2 days
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    </section>
  );
}
