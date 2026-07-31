"use client";

import { useState, useTransition } from "react";
import { submitLiveUrlAction } from "@/app/portal/actions";

/** One row's "it's live" report — a URL field and a button. */
export default function LiveUrlForm({
  token,
  contentItemId,
  initialUrl,
}: {
  token: string;
  contentItemId: number;
  initialUrl: string;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [state, setState] = useState<"idle" | "saved" | string>("idle");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2 mt-1.5">
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste the live link once it's posted"
        className="flex-1 border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800"
      />
      <button
        onClick={() => {
          setState("idle");
          startTransition(async () => {
            const r = await submitLiveUrlAction(token, contentItemId, url);
            setState(r?.error ? r.error : "saved");
          });
        }}
        disabled={isPending || !url.trim()}
        className="text-xs font-medium bg-brand hover:bg-brand-dark text-white rounded-md px-3 py-1.5 disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Submit"}
      </button>
      {state === "saved" && <span className="text-xs text-emerald-700">✓</span>}
      {state !== "idle" && state !== "saved" && <span className="text-xs text-red-600">{state}</span>}
    </div>
  );
}
