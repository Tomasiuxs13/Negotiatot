"use client";

import { useState, useTransition } from "react";
import type { CopilotReco } from "@/lib/types";
import { markDraftAsSent } from "@/app/deals/[id]/actions";

const TONES = ["balanced", "warm", "firm"] as const;
type ToneKey = (typeof TONES)[number];

export default function CopilotCard({ dealId, reco }: { dealId: number; reco: CopilotReco }) {
  const [tone, setTone] = useState<ToneKey>("balanced");
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const draft = reco.drafts[tone];

  const copy = async () => {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const send = () => {
    startTransition(async () => {
      await markDraftAsSent(dealId, draft, reco.proposedOffer);
      setSent(true);
    });
  };

  return (
    <div className="bg-white rounded-lg border border-brand/40 shadow-sm overflow-hidden">
      <div className="bg-brand/10 px-4 py-2.5 flex items-center gap-2.5 border-b border-brand/20">
        <span className="text-[10px] font-bold tracking-[0.13em] text-brand-dark">
          COPILOT · ROUND {reco.round}
        </span>
        <span className="font-headline text-sm font-semibold text-slate-900">{reco.headline}</span>
      </div>

      <div className="p-4">
        <div className="flex flex-wrap gap-2 mb-3">
          {reco.pills.map((p) => (
            <span
              key={p.label}
              className={`text-xs font-semibold rounded-full px-2.5 py-1 font-tabular ${
                p.tone === "good"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-slate-100 text-slate-600 border border-slate-200"
              }`}
            >
              {p.label}
            </span>
          ))}
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-3 mb-3.5">
          <div className="text-[10px] font-bold tracking-[0.12em] text-slate-500 mb-1.5">
            WHY THIS MOVE
          </div>
          <ul className="list-disc pl-4 space-y-1">
            {reco.reasoning.map((r, i) => (
              <li key={i} className="text-xs text-slate-600 max-w-[65ch]">
                {r}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex gap-1.5 mb-2.5" role="tablist" aria-label="Draft tone">
          {TONES.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tone === t}
              onClick={() => setTone(t)}
              className={`text-xs font-semibold px-3 py-1 rounded-full border capitalize transition-colors ${
                tone === t
                  ? "bg-slate-900 text-white border-slate-900"
                  : "border-slate-200 text-slate-500 hover:text-slate-800"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="bg-white border border-dashed border-slate-300 rounded-lg px-3.5 py-3 text-sm text-slate-700 whitespace-pre-line">
          {draft}
        </div>

        <div className="flex gap-2 mt-3.5">
          <button
            onClick={copy}
            className="bg-brand hover:bg-brand-dark text-white rounded-md py-1.5 px-3.5 text-sm font-medium transition-colors shadow-sm"
          >
            {copied ? "Copied ✓" : "Copy draft"}
          </button>
          <button
            onClick={send}
            disabled={isPending || sent}
            className="border border-slate-200 hover:border-slate-400 text-slate-700 rounded-md py-1.5 px-3.5 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {sent ? "Sent ✓" : isPending ? "Sending…" : "Mark as sent"}
          </button>
        </div>
      </div>
    </div>
  );
}
