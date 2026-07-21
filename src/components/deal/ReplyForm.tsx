"use client";

import { useRef, useState, useTransition } from "react";
import { addTheirReply } from "@/app/deals/[id]/actions";

export default function ReplyForm({ dealId, busy = false }: { dealId: number; busy?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const text = ref.current?.value ?? "";
    if (!text.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await addTheirReply(dealId, text);
      if (result?.error) {
        setError(result.error);
      } else if (ref.current) {
        ref.current.value = "";
      }
    });
  };

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
        Paste their reply{" "}
        <span className="font-normal text-slate-500">
          — Counterpart re-analyzes and recommends the next move
        </span>
      </label>
      <textarea
        ref={ref}
        rows={3}
        placeholder="Paste the influencer's response here…"
        className="w-full border border-slate-200 rounded-lg bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand resize-y"
      />
      <button
        onClick={submit}
        disabled={isPending || busy}
        className="mt-2 bg-brand hover:bg-brand-dark text-white rounded-md py-1.5 px-4 text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
      >
        {busy ? "Copilot is busy…" : isPending ? "Sending…" : "Send to Copilot"}
      </button>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
