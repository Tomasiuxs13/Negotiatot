"use client";

import { useRef, useState, useTransition } from "react";
import type { Contract, ParsedTerms, PaymentTrigger } from "@/lib/fulfillment-types";
import { PAYMENT_TRIGGER_LABEL } from "@/lib/fulfillment-types";
import { money } from "@/lib/format";
import { confirmContractAction, uploadContractAction } from "@/app/deals/[id]/fulfillment-actions";

const inputClass =
  "border border-slate-200 rounded-md bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand";

const TRIGGERS: PaymentTrigger[] = ["on_signing", "on_delivery", "on_verification", "date"];

const emptyTerms = (): ParsedTerms => ({
  deliverables: [],
  payments: [],
  product: null,
  usageRights: null,
  exclusivity: null,
  paymentTerms: null,
  totalFee: null,
  notes: [],
});

export default function ContractBlock({
  dealId,
  contract,
  terms,
}: {
  dealId: number;
  contract: Contract | null;
  terms: ParsedTerms | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ParsedTerms | null>(null);
  const [signedAt, setSignedAt] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const upload = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.append("contract", file);
    startTransition(async () => {
      const res = await uploadContractAction(dealId, formData);
      if (res.error) setError(res.error);
    });
  };

  const startReview = () => {
    setDraft(structuredClone(terms ?? emptyTerms()));
    setResult(null);
  };

  const confirm = () => {
    if (!contract || !draft) return;
    // A re-confirmation rebuilds the whole schedule — that deserves a pause even with
    // the server refusing the genuinely dangerous cases.
    if (
      contract.status === "confirmed" &&
      !window.confirm(
        "Re-confirming replaces every generated content item, payment, and shipment with the terms shown. Continue?"
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const res = await confirmContractAction(contract.id, draft, signedAt || null);
      if (res.error) setError(res.error);
      else {
        setDraft(null);
        setResult(
          `Created ${res.created?.content ?? 0} content item(s), ${res.created?.payments ?? 0} payment(s)` +
            (res.created?.shipments ? ", 1 shipment" : "")
        );
      }
    });
  };

  /* ------------------------------------------------ no contract yet */
  if (!contract) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
        <h3 className="font-headline text-sm font-semibold text-slate-900 mb-1">Contract</h3>
        <p className="text-xs text-slate-500 mb-3 max-w-[65ch]">
          Upload the signed contract — Counterpart reads the deliverables, payments, and product
          out of it, and generates the work items so nothing is typed twice.
        </p>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            onChange={() => setError(null)}
          />
          <button
            onClick={upload}
            disabled={isPending}
            className="bg-brand hover:bg-brand-dark text-white rounded-md py-1.5 px-4 text-sm font-medium transition-colors disabled:opacity-60"
          >
            {isPending ? "Uploading…" : "Upload & read"}
          </button>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>
    );
  }

  /* ------------------------------------------------ parsing in progress */
  if (contract.status === "parsing") {
    return (
      <div className="bg-white rounded-lg border border-brand/30 p-5">
        <h3 className="font-headline text-sm font-semibold text-slate-900 mb-2">Contract</h3>
        <div className="inline-flex items-center gap-2.5 text-sm font-medium text-slate-700">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand" />
          </span>
          Reading {contract.filename}…
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Extracting deliverables, payments, and terms. This takes under a minute.
        </p>
      </div>
    );
  }

  /* ------------------------------------------------ review / confirm */
  if (draft) {
    return (
      <div className="bg-white rounded-lg border border-brand/40 shadow-sm p-5">
        <h3 className="font-headline text-sm font-semibold text-slate-900 mb-1">
          Confirm contract terms
        </h3>
        <p className="text-xs text-slate-500 mb-4 max-w-[70ch]">
          Check what was extracted, fix anything wrong, then confirm — this creates the content
          items, payments, and shipment. Re-confirming replaces all of them; it will refuse if
          any payment is already approved or paid, or any content has results logged.
        </p>

        {/* Deliverables */}
        <div className="mb-4">
          <div className="flex items-baseline justify-between mb-1.5">
            <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Deliverables</h4>
            <button
              onClick={() =>
                setDraft({
                  ...draft,
                  deliverables: [
                    ...draft.deliverables,
                    { description: "", platform: null, quantity: 1, dueDate: null, dueDaysAfterDelivery: null, dueRule: null },
                  ],
                })
              }
              className="text-xs font-semibold text-brand-dark hover:underline"
            >
              + Add
            </button>
          </div>
          <div className="space-y-1.5">
            {draft.deliverables.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className={`${inputClass} flex-1`}
                  value={d.description}
                  placeholder="e.g. YouTube integration 60–90s"
                  onChange={(e) => {
                    const next = [...draft.deliverables];
                    next[i] = { ...d, description: e.target.value };
                    setDraft({ ...draft, deliverables: next });
                  }}
                />
                <input
                  className={`${inputClass} w-16 text-right font-tabular`}
                  type="number"
                  min="1"
                  value={d.quantity}
                  title="Quantity"
                  onChange={(e) => {
                    const next = [...draft.deliverables];
                    next[i] = { ...d, quantity: Number(e.target.value) };
                    setDraft({ ...draft, deliverables: next });
                  }}
                />
                <input
                  className={`${inputClass} w-36`}
                  type="date"
                  value={d.dueDate ?? ""}
                  title="Due date"
                  onChange={(e) => {
                    const next = [...draft.deliverables];
                    next[i] = { ...d, dueDate: e.target.value || null };
                    setDraft({ ...draft, deliverables: next });
                  }}
                />
                <input
                  className={`${inputClass} w-28 text-right font-tabular`}
                  type="number"
                  placeholder="+days"
                  title="Days after product delivery"
                  value={d.dueDaysAfterDelivery ?? ""}
                  onChange={(e) => {
                    const next = [...draft.deliverables];
                    next[i] = { ...d, dueDaysAfterDelivery: e.target.value ? Number(e.target.value) : null };
                    setDraft({ ...draft, deliverables: next });
                  }}
                />
                <button
                  onClick={() =>
                    setDraft({ ...draft, deliverables: draft.deliverables.filter((_, j) => j !== i) })
                  }
                  className="text-slate-300 hover:text-red-600"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                </button>
              </div>
            ))}
            {draft.deliverables.length === 0 && (
              <p className="text-xs text-slate-400">None found — add them manually.</p>
            )}
          </div>
        </div>

        {/* Payments */}
        <div className="mb-4">
          <div className="flex items-baseline justify-between mb-1.5">
            <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Payments</h4>
            <button
              onClick={() =>
                setDraft({
                  ...draft,
                  payments: [
                    ...draft.payments,
                    { description: "", amount: 0, trigger: "on_verification", dueDate: null },
                  ],
                })
              }
              className="text-xs font-semibold text-brand-dark hover:underline"
            >
              + Add
            </button>
          </div>
          <div className="space-y-1.5">
            {draft.payments.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className={`${inputClass} flex-1`}
                  value={p.description}
                  placeholder="e.g. Fee on publication"
                  onChange={(e) => {
                    const next = [...draft.payments];
                    next[i] = { ...p, description: e.target.value };
                    setDraft({ ...draft, payments: next });
                  }}
                />
                <input
                  className={`${inputClass} w-24 text-right font-tabular`}
                  type="number"
                  value={p.amount}
                  onChange={(e) => {
                    const next = [...draft.payments];
                    next[i] = { ...p, amount: Number(e.target.value) };
                    setDraft({ ...draft, payments: next });
                  }}
                />
                <select
                  className={`${inputClass} w-44`}
                  value={p.trigger}
                  onChange={(e) => {
                    const next = [...draft.payments];
                    next[i] = { ...p, trigger: e.target.value as PaymentTrigger };
                    setDraft({ ...draft, payments: next });
                  }}
                >
                  {TRIGGERS.map((t) => (
                    <option key={t} value={t}>
                      {PAYMENT_TRIGGER_LABEL[t]}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setDraft({ ...draft, payments: draft.payments.filter((_, j) => j !== i) })}
                  className="text-slate-300 hover:text-red-600"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                </button>
              </div>
            ))}
            {draft.payments.length === 0 && (
              <p className="text-xs text-slate-400">None found — gifted deal, or add them manually.</p>
            )}
          </div>
        </div>

        {/* Product */}
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
            Product to send
          </h4>
          <div className="flex items-center gap-2">
            <input
              className={`${inputClass} flex-1`}
              placeholder="No product — leave blank for a paid-only deal"
              value={draft.product?.description ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  product: e.target.value
                    ? { description: e.target.value, value: draft.product?.value ?? null }
                    : null,
                })
              }
            />
            <input
              className={`${inputClass} w-28 text-right font-tabular`}
              type="number"
              placeholder="value $"
              value={draft.product?.value ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  product: draft.product
                    ? { ...draft.product, value: e.target.value ? Number(e.target.value) : null }
                    : null,
                })
              }
            />
          </div>
        </div>

        {/* Terms summary */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-4 text-xs">
          {([
            ["Usage rights", "usageRights"],
            ["Exclusivity", "exclusivity"],
            ["Payment terms", "paymentTerms"],
          ] as const).map(([label, key]) => (
            <div key={key}>
              <span className="text-slate-500">{label}</span>
              <input
                className={`${inputClass} w-full mt-0.5`}
                value={(draft[key] as string | null) ?? ""}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value || null })}
              />
            </div>
          ))}
          <div>
            <span className="text-slate-500">Signed on</span>
            <input
              className={`${inputClass} w-full mt-0.5`}
              type="date"
              value={signedAt}
              onChange={(e) => setSignedAt(e.target.value)}
            />
          </div>
        </div>

        {draft.notes?.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            <p className="text-[11px] font-bold text-amber-700 mb-1">WORTH A LOOK</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {draft.notes.map((n, i) => (
                <li key={i} className="text-xs text-slate-600">{n}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={confirm}
            disabled={isPending}
            className="bg-brand hover:bg-brand-dark text-white rounded-md py-1.5 px-4 text-sm font-medium transition-colors disabled:opacity-60"
          >
            {isPending ? "Creating…" : "Confirm & generate work"}
          </button>
          <button onClick={() => setDraft(null)} className="text-sm font-medium text-slate-500 hover:text-slate-900">
            Cancel
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </div>
    );
  }

  /* ------------------------------------------------ uploaded / parsed / confirmed */
  const totalFee = terms?.totalFee ?? null;
  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-headline text-sm font-semibold text-slate-900">Contract</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {contract.filename}
            {contract.signed_at ? ` · signed ${contract.signed_at}` : ""}
            {totalFee != null ? ` · ${money(totalFee)} total` : ""}
          </p>
        </div>
        <span
          className={`text-[11px] font-semibold rounded-full px-2.5 py-1 ${
            contract.status === "confirmed"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {contract.status === "confirmed" ? "Confirmed" : "Needs review"}
        </span>
      </div>

      {contract.parse_error && (
        <p className="text-xs text-red-600 mt-2">{contract.parse_error}</p>
      )}

      {terms && contract.status === "confirmed" && (
        <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
          {terms.usageRights && (
            <div>
              <span className="text-slate-500 block">Usage rights</span>
              <span className="text-slate-800">{terms.usageRights}</span>
            </div>
          )}
          {terms.exclusivity && (
            <div>
              <span className="text-slate-500 block">Exclusivity</span>
              <span className="text-slate-800">{terms.exclusivity}</span>
            </div>
          )}
          {terms.paymentTerms && (
            <div>
              <span className="text-slate-500 block">Payment terms</span>
              <span className="text-slate-800">{terms.paymentTerms}</span>
            </div>
          )}
        </div>
      )}

      {result && <p className="text-xs text-emerald-600 mt-2">{result}</p>}

      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={startReview}
          className="border border-slate-200 hover:border-slate-400 text-slate-700 rounded-md py-1.5 px-3.5 text-sm font-medium transition-colors"
        >
          {contract.status === "confirmed" ? "Review terms again" : "Review & confirm terms"}
        </button>
        <label className="text-xs text-slate-500 cursor-pointer hover:text-slate-800">
          Replace file
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={upload}
          />
        </label>
        {isPending && <span className="text-xs text-slate-500">Working…</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
