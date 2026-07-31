"use client";

import { useState, useTransition } from "react";
import { saveLegalDetailsAction } from "@/app/portal/actions";

/** Contract party details, straight from the source. */
export default function LegalDetailsForm({
  token,
  initial,
}: {
  token: string;
  initial: { legalName: string; companyName: string; taxId: string; legalAddress: string };
}) {
  const [f, setF] = useState(initial);
  const [state, setState] = useState<"idle" | "saved" | string>("idle");
  const [isPending, startTransition] = useTransition();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  const input = "w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800";

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
      <h2 className="font-headline text-sm font-semibold text-slate-900 mb-1">Your details for contracts</h2>
      <p className="text-xs text-slate-500 mb-3">Used to prepare your collaboration agreements — fill once, we reuse them.</p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input className={input} placeholder="Legal name *" value={f.legalName} onChange={set("legalName")} />
        <input className={input} placeholder="Company (if invoicing via one)" value={f.companyName} onChange={set("companyName")} />
        <input className={input} placeholder="VAT / tax ID" value={f.taxId} onChange={set("taxId")} />
        <input className={input} placeholder="Registered address" value={f.legalAddress} onChange={set("legalAddress")} />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            setState("idle");
            startTransition(async () => {
              const r = await saveLegalDetailsAction(token, f);
              setState(r?.error ? r.error : "saved");
            });
          }}
          disabled={isPending || !f.legalName.trim()}
          className="text-xs font-medium bg-brand hover:bg-brand-dark text-white rounded-md px-3 py-1.5 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save details"}
        </button>
        {state === "saved" && <span className="text-xs text-emerald-700">✓ saved</span>}
        {state !== "idle" && state !== "saved" && <span className="text-xs text-red-600">{state}</span>}
      </div>
    </div>
  );
}
