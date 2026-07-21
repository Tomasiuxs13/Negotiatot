"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPartnerAction } from "@/app/partners/actions";

const inputClass =
  "w-full border border-slate-200 rounded-lg bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand";

export default function NewPartnerButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", tags: "" });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await createPartnerAction({
        name: form.name,
        email: form.email,
        phone: form.phone,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      if (result.error) setError(result.error);
      else if (result.id) router.push(`/partners/${result.id}`);
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-brand hover:bg-brand-dark text-white rounded-md py-1.5 px-4 text-sm font-medium transition-colors shadow-sm flex items-center gap-1"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
        New partner
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900/30 flex items-start justify-center pt-32 z-50" onClick={() => setOpen(false)}>
      <div
        className="bg-white rounded-lg border border-slate-200 shadow-lg p-5 w-[28rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-headline text-sm font-semibold text-slate-900 mb-3">New partner</h3>
        <div className="space-y-2.5">
          <input
            autoFocus
            className={inputClass}
            placeholder="Name *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className={inputClass}
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            className={inputClass}
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <input
            className={inputClass}
            placeholder="Tags, comma separated (e.g. tech, DACH)"
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
          />
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button
            onClick={save}
            disabled={isPending}
            className="bg-brand hover:bg-brand-dark text-white rounded-md py-1.5 px-4 text-sm font-medium transition-colors disabled:opacity-60"
          >
            {isPending ? "Creating…" : "Create partner"}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="text-sm font-medium text-slate-500 hover:text-slate-900 px-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
