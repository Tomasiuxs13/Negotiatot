"use client";

import { useState, useTransition } from "react";
import { submitDraftAction } from "@/app/portal/actions";

/** The creator's draft hand-in: a link to the cut (Drive, Dropbox, Frame.io, WeTransfer). */
export default function DraftForm({
  token,
  contentItemId,
  initialUrl,
  submitted,
  round,
}: {
  token: string;
  contentItemId: number;
  initialUrl: string;
  submitted: boolean;
  round: number;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [state, setState] = useState<"idle" | "saved" | string>("idle");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Link to your draft (Drive, Dropbox, Frame.io…)"
          className="flex-1 border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800"
        />
        <button
          onClick={() => {
            setState("idle");
            startTransition(async () => {
              const r = await submitDraftAction(token, contentItemId, url);
              setState(r?.error ? r.error : "saved");
            });
          }}
          disabled={isPending || !url.trim()}
          className="text-xs font-medium bg-brand hover:bg-brand-dark text-white rounded-md px-3 py-1.5 disabled:opacity-50"
        >
          {isPending ? "Sending…" : submitted ? "Resubmit draft" : "Submit draft"}
        </button>
        {state === "saved" && <span className="text-xs text-emerald-700">✓ in review</span>}
        {state !== "idle" && state !== "saved" && <span className="text-xs text-red-600">{state}</span>}
      </div>
      {submitted && state === "idle" && (
        <p className="text-[11px] text-slate-400 mt-1">Draft in review{round > 1 ? ` · revision ${round}` : ""} — we&apos;ll get back to you.</p>
      )}
    </div>
  );
}
