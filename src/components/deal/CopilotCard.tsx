"use client";

import { useState, useTransition } from "react";
import type { CopilotReco } from "@/lib/types";
import { markDraftAsSent, rewriteDraftAction } from "@/app/deals/[id]/actions";
import { money } from "@/lib/format";

const TONES = ["balanced", "warm", "firm"] as const;
type ToneKey = (typeof TONES)[number];

export default function CopilotCard({ dealId, reco }: { dealId: number; reco: CopilotReco }) {
  const [tone, setTone] = useState<ToneKey>("balanced");
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  /**
   * Only the balanced draft is written up front. The other tones were 53% of the
   * generated tokens and mostly went unread, so they are rewritten on request and held
   * here for the rest of the session.
   */
  const [extra, setExtra] = useState<Record<string, string>>({});

  const draft = extra[tone] ?? reco.drafts[tone] ?? "";

  const pickTone = (t: ToneKey) => {
    setTone(t);
    setError(null);
    if (extra[t] || reco.drafts[t]) return;
    const source = reco.drafts.balanced ?? Object.values(reco.drafts)[0] ?? "";
    if (!source) return;
    startTransition(async () => {
      const r = await rewriteDraftAction(dealId, source, t);
      if (r.error) setError(r.error);
      else if (r.draft) setExtra((e) => ({ ...e, [t]: r.draft! }));
    });
  };

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
        {/* Written to your instruction, not the Copilot's own read — worth saying, because
            the number in the draft is then yours and the reasoning is the argument for it. */}
        {reco.take && (
          <p
            className={`mb-3 rounded-lg border px-3 py-2 text-xs ${
              reco.takeDeparture
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-brand/20 bg-brand/5 text-slate-600"
            }`}
          >
            <span className="font-semibold">Your take: </span>
            {reco.take}
            {reco.takeDeparture && (
              <span className="mt-1 block font-semibold">
                This draft offers {money(reco.takeDeparture.drafted)}, not the{" "}
                {money(reco.takeDeparture.asked)} you asked for — the reasoning says why.
              </span>
            )}
          </p>
        )}
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

        {/* The workings, folded. The pills above already state the move and the draft
            below is what you act on; five paragraphs of CPM arithmetic between them
            pushed the thing you came here to send off the screen. */}
        <details className="group bg-slate-50 border border-slate-200 rounded-lg mb-3.5">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3.5 py-2.5 text-[10px] font-bold tracking-[0.12em] text-slate-500">
            <span
              className="material-symbols-outlined text-slate-400 transition-transform group-open:rotate-90"
              style={{ fontSize: 14 }}
              aria-hidden
            >
              chevron_right
            </span>
            WHY THIS MOVE
            <span className="font-normal tracking-normal text-slate-400">
              · {reco.reasoning.length} point{reco.reasoning.length === 1 ? "" : "s"}
            </span>
          </summary>
          <ul className="list-disc pl-8 pr-3.5 pb-3 space-y-1">
            {reco.reasoning.map((r, i) => (
              <li key={i} className="text-xs text-slate-600 max-w-[65ch]">
                {r}
              </li>
            ))}
          </ul>
        </details>

        <div className="flex gap-1.5 mb-2.5" role="tablist" aria-label="Draft tone">
          {TONES.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tone === t}
              onClick={() => pickTone(t)}
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

        {/* An email preview, not a paragraph: bounded so a long draft scrolls inside its
            own frame instead of pushing Copy and Mark as sent below the fold. */}
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-1.5">
            <span className="label-caps text-slate-500">Draft</span>
            <span className="text-[11px] capitalize text-slate-400">{tone}</span>
          </div>
          <div className="max-h-96 overflow-y-auto px-3.5 py-3 text-sm leading-6 text-slate-700 whitespace-pre-line">
            {draft || (isPending ? `Rewriting in a ${tone} tone…` : "")}
          </div>
        </div>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}

        <div className="flex gap-2 mt-3.5">
          <button
            onClick={copy}
            disabled={!draft}
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
