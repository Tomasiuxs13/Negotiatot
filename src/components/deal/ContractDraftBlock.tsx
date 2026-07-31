"use client";

import { useState, useTransition } from "react";
import {
  generateContractDraftAction,
  markContractSignedAction,
  saveContractDraftAction,
} from "@/app/deals/[id]/actions";

/** The generated agreement: editable text until marked signed, copied manually. */
export default function ContractDraftBlock({
  dealId,
  initial,
}: {
  dealId: number;
  initial: { body: string; status: "draft" | "signed" } | null;
}) {
  const [body, setBody] = useState(initial?.body ?? "");
  const [status, setStatus] = useState(initial?.status ?? null);
  const [note, setNote] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ error?: string; body?: string }>, after?: () => void) => {
    setNote(null);
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setNote(r.error);
      else {
        if (r?.body) setBody(r.body);
        after?.();
      }
    });
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-headline text-sm font-semibold text-slate-900">
          Contract draft{status === "signed" && <span className="text-emerald-700 font-normal text-xs"> · marked signed</span>}
        </h3>
        <div className="flex gap-2">
          {status !== "signed" && (
            <button
              onClick={() => run(() => generateContractDraftAction(dealId), () => setStatus("draft"))}
              disabled={isPending}
              className="text-xs font-semibold text-brand-dark hover:underline disabled:opacity-50"
            >
              {body ? "Regenerate from deal" : "Generate contract"}
            </button>
          )}
          {body && (
            <button
              onClick={() => navigator.clipboard.writeText(body).catch(() => {})}
              className="text-xs font-medium text-slate-600 hover:underline"
            >
              Copy
            </button>
          )}
        </div>
      </div>
      {!body && (
        <p className="text-sm text-slate-400">
          Generate a working agreement from the negotiated terms, content items and the
          creator&apos;s legal details (they fill those in via their portal). Edit freely, copy
          it out for signing — nothing is sent from here.
        </p>
      )}
      {body && (
        <>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            readOnly={status === "signed"}
            rows={16}
            className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-800 font-mono resize-y read-only:bg-slate-50 read-only:text-slate-500"
          />
          {status !== "signed" && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => run(() => saveContractDraftAction(dealId, body))}
                disabled={isPending}
                className="text-xs font-medium bg-slate-900 text-white rounded-md px-3 py-1.5 hover:bg-slate-800 disabled:opacity-60"
              >
                Save draft
              </button>
              <button
                onClick={() => {
                  if (!window.confirm("Mark this contract as signed? It becomes read-only — the signed original should then be uploaded above.")) return;
                  run(() => saveContractDraftAction(dealId, body).then(() => markContractSignedAction(dealId)), () => setStatus("signed"));
                }}
                disabled={isPending}
                className="text-xs font-medium border border-slate-200 hover:border-slate-400 text-slate-700 rounded-md px-3 py-1.5 disabled:opacity-50"
              >
                Mark signed
              </button>
            </div>
          )}
        </>
      )}
      {note && <p className="text-xs text-red-600 mt-2">{note}</p>}
    </div>
  );
}
