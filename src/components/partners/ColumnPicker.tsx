"use client";

import { useState, useTransition } from "react";
import { savePartnerColumnsAction } from "@/app/partners/actions";
import { PARTNER_COLUMNS, type PartnerColumnKey } from "@/lib/partner-columns";

/**
 * Choose what the table shows. A saved preference, not a URL parameter: the columns you
 * work by should survive a click into a partner and back.
 *
 * "Partner" is fixed — a table of creators you cannot name is not a view.
 */
export default function ColumnPicker({ visible }: { visible: PartnerColumnKey[] }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<PartnerColumnKey[]>(visible);
  const [isPending, startTransition] = useTransition();

  const toggle = (key: PartnerColumnKey) => {
    if (key === "name") return;
    const next = chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key];
    setChosen(next);
    startTransition(async () => {
      await savePartnerColumnsAction(next);
    });
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
        aria-expanded={open}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>
          view_column
        </span>
        Columns
        <span className="font-data text-slate-400">{chosen.length}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} role="presentation" />
          <div className="absolute right-0 z-30 mt-2 w-60 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
            <p className="label-caps px-2 py-1 text-slate-400">
              Show columns {isPending && <span className="font-normal">· saving</span>}
            </p>
            {PARTNER_COLUMNS.map((column) => {
              const checked = chosen.includes(column.key);
              const fixed = column.key === "name";
              return (
                <label
                  key={column.key}
                  className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm ${
                    fixed ? "text-slate-400" : "cursor-pointer text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked || fixed}
                    disabled={fixed}
                    onChange={() => toggle(column.key)}
                    className="h-4 w-4 accent-[var(--brand,#0d4d44)]"
                  />
                  {column.label}
                  {fixed && <span className="ml-auto text-[10px] uppercase tracking-wide">always</span>}
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
