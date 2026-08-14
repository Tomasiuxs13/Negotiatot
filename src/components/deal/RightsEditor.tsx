"use client";

import { useState, useTransition } from "react";
import { runAnalysis, saveRightsAction } from "@/app/deals/[id]/actions";
import { parseRights, rightsSummary, type DealRights } from "@/lib/rights";

const inputClass =
  "border border-slate-200 rounded-md bg-white px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand w-full";

/**
 * The rights marked on this deal, editable from every tab.
 *
 * Lives in the rail beside the audience data because it is the same kind of fact: an
 * input the price was computed from. Changing either invalidates the ladder the same
 * way, which is why both offer "save & re-analyze" rather than silently leaving an
 * analysis that priced a different deal.
 */
export default function RightsEditor({
  dealId,
  rightsJson,
}: {
  dealId: number;
  rightsJson: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [rights, setRights] = useState<DealRights>(() => parseRights(rightsJson));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const summary = rightsSummary(parseRights(rightsJson));

  const save = (thenReRun: boolean) => {
    setError(null);
    startTransition(async () => {
      const r = await saveRightsAction(dealId, rights);
      if (r?.error) {
        setError(r.error);
        return;
      }
      if (thenReRun) {
        const run = await runAnalysis(dealId);
        if (run?.error) {
          setError(run.error);
          return;
        }
      }
      setOpen(false);
    });
  };

  const set = (patch: Partial<DealRights>) => setRights((prev) => ({ ...prev, ...patch }));

  if (!open) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-headline text-sm font-semibold text-slate-900">Rights &amp; extras</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {summary ?? "None — their channel only"}
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="text-xs font-medium text-brand-dark hover:underline shrink-0"
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 space-y-3">
      <h3 className="font-headline text-sm font-semibold text-slate-900">Rights &amp; extras</h3>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-xs text-slate-600 mb-1">Usage rights</span>
          <select
            value={rights.usage.kind}
            onChange={(e) =>
              set({ usage: { ...rights.usage, kind: e.target.value as DealRights["usage"]["kind"] } })
            }
            className={inputClass}
          >
            <option value="none">None</option>
            <option value="organic">Organic repost</option>
            <option value="paid">Paid ads</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-xs text-slate-600 mb-1">Months</span>
          <input
            type="number"
            min={1}
            max={24}
            value={rights.usage.months || ""}
            onChange={(e) => set({ usage: { ...rights.usage, months: Number(e.target.value) || 0 } })}
            className={inputClass}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 items-end">
        <label className="flex items-center gap-2 text-xs text-slate-700 py-1.5">
          <input
            type="checkbox"
            checked={rights.whitelisting.enabled}
            onChange={(e) =>
              set({ whitelisting: { ...rights.whitelisting, enabled: e.target.checked } })
            }
            className="w-4 h-4"
          />
          Whitelisting
        </label>
        <label className="block">
          <span className="block text-xs text-slate-600 mb-1">Months</span>
          <input
            type="number"
            min={1}
            max={24}
            value={rights.whitelisting.months || ""}
            onChange={(e) =>
              set({ whitelisting: { ...rights.whitelisting, months: Number(e.target.value) || 0 } })
            }
            disabled={!rights.whitelisting.enabled}
            className={`${inputClass} disabled:opacity-40`}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-xs text-slate-600 mb-1">Exclusivity</span>
          <select
            value={rights.exclusivity.kind}
            onChange={(e) =>
              set({
                exclusivity: {
                  ...rights.exclusivity,
                  kind: e.target.value as DealRights["exclusivity"]["kind"],
                },
              })
            }
            className={inputClass}
          >
            <option value="none">None</option>
            <option value="category">Category</option>
            <option value="full">Full</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-xs text-slate-600 mb-1">Months</span>
          <input
            type="number"
            min={1}
            max={24}
            value={rights.exclusivity.months || ""}
            onChange={(e) =>
              set({ exclusivity: { ...rights.exclusivity, months: Number(e.target.value) || 0 } })
            }
            disabled={rights.exclusivity.kind === "none"}
            className={`${inputClass} disabled:opacity-40`}
          />
        </label>
      </div>

      {rights.exclusivity.kind === "category" && (
        <label className="block">
          <span className="block text-xs text-slate-600 mb-1">
            Named competitors — cheaper and clearer than &quot;no competing brands&quot;
          </span>
          <input
            type="text"
            value={rights.exclusivity.scope}
            onChange={(e) => set({ exclusivity: { ...rights.exclusivity, scope: e.target.value } })}
            placeholder="e.g. GlocalMe, TravelWifi, Solis"
            className={inputClass}
          />
        </label>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => {
            setRights(parseRights(rightsJson));
            setOpen(false);
            setError(null);
          }}
          className="text-xs text-slate-500 px-1"
        >
          Cancel
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => save(false)}
            disabled={isPending}
            className="text-xs font-medium border border-slate-200 hover:border-slate-400 text-slate-700 rounded-md px-2.5 py-1.5 disabled:opacity-50"
          >
            Save
          </button>
          <button
            onClick={() => save(true)}
            disabled={isPending}
            className="text-xs font-medium bg-brand hover:bg-brand-dark text-white rounded-md px-2.5 py-1.5 disabled:opacity-50"
            title="Rights change what the fee should be — re-analyzing reprices the ladder"
          >
            {isPending ? "Saving…" : "Save & re-analyze"}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
