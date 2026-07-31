"use client";

import { useState, useTransition } from "react";
import { submitAddressAction } from "@/app/ship/actions";

/** The creator's side of product delivery: three fields and a thank-you. */
export default function AddressForm({
  token,
  initial,
  alreadySubmitted,
}: {
  token: string;
  initial: { recipient: string; address: string; phone: string };
  alreadySubmitted: boolean;
}) {
  const [recipient, setRecipient] = useState(initial.recipient);
  const [address, setAddress] = useState(initial.address);
  const [phone, setPhone] = useState(initial.phone);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await submitAddressAction(token, { recipient, address, phone });
      if (result?.error) setError(result.error);
      else setDone(true);
    });
  };

  if (done) {
    return (
      <div className="text-center py-6">
        <p className="text-sm font-medium text-emerald-700 mb-1">Got it — thank you!</p>
        <p className="text-sm text-slate-500">
          Your details are saved. You can close this page, or edit and resubmit if you spot
          a mistake.
        </p>
        <button
          onClick={() => setDone(false)}
          className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2 mt-3"
        >
          Edit details
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {alreadySubmitted && (
        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
          You&apos;ve filled this in before — submitting again updates your details.
        </p>
      )}
      <label className="block">
        <span className="block text-xs font-medium text-slate-600 mb-1">Recipient name</span>
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          autoComplete="name"
          className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
        />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-slate-600 mb-1">
          Delivery address — street, city, postal code, country
        </span>
        <textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          rows={4}
          autoComplete="street-address"
          placeholder={"12 Harbour Street\n2000 Sydney NSW\nAustralia"}
          className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand resize-y"
        />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-slate-600 mb-1">
          Phone for the courier (optional)
        </span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
        />
      </label>

      <button
        onClick={submit}
        disabled={isPending}
        className="w-full bg-brand hover:bg-brand-dark text-white rounded-md py-2.5 text-sm font-medium transition-colors shadow-sm disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Send my details"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
