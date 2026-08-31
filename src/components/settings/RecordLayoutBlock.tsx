"use client";

import { useState, useTransition } from "react";
import { saveRecordLayoutAction } from "@/app/settings/actions";
import { RECORD_LAYOUTS, type RecordLayout } from "@/lib/record-layout";

/**
 * The escape hatch for the record layout. Both layouts show the same blocks, so this is
 * a preference and not a migration — switching back costs one click and loses nothing.
 */
export default function RecordLayoutBlock({ current }: { current: RecordLayout }) {
  const [layout, setLayout] = useState<RecordLayout>(current);
  const [isPending, startTransition] = useTransition();

  const choose = (next: RecordLayout) => {
    if (next === layout) return;
    const previous = layout;
    setLayout(next);
    startTransition(async () => {
      const result = await saveRecordLayoutAction(next);
      if (result.error) setLayout(previous);
    });
  };

  return (
    <div className="p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-900">Record layout</span>
        {isPending && <span className="text-xs text-slate-400">Saving…</span>}
      </div>
      <p className="text-xs text-slate-500 mt-1 max-w-[70ch]">
        How deal and creator pages arrange themselves. Both show the same blocks — this
        only moves them, so switching back changes nothing but the arrangement.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {RECORD_LAYOUTS.map((option) => (
          <button
            key={option.value}
            onClick={() => choose(option.value)}
            aria-pressed={layout === option.value}
            className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
              layout === option.value
                ? "border-brand bg-brand/5"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <span
              className={`block text-sm font-semibold ${
                layout === option.value ? "text-brand-dark" : "text-slate-800"
              }`}
            >
              {option.label}
              {layout === option.value && <span className="ml-1.5 text-xs font-normal">· in use</span>}
            </span>
            <span className="block text-xs text-slate-500 mt-0.5">{option.note}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
