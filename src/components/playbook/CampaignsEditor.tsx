"use client";

import { useState, useTransition } from "react";
import {
  OVERRIDE_FIELDS,
  parseOverrides,
  describeOverrides,
  type Campaign,
  type CampaignOverrides,
} from "@/lib/campaigns";
import { money } from "@/lib/format";
import { uploadCampaignBriefAction } from "@/app/playbook/campaign-actions";
import BriefRequirements from "./BriefRequirements";
import { archiveCampaignAction, saveCampaignAction } from "@/app/playbook/campaign-actions";

const inputClass =
  "border border-slate-200 rounded-md bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand";

interface Draft {
  id?: number;
  name: string;
  budget: string;
  overrides: Record<string, string>;
}

const emptyDraft = (): Draft => ({ name: "", budget: "", overrides: {} });

function toDraft(c: Campaign): Draft {
  const o = parseOverrides(c.overrides) as Record<string, unknown>;
  return {
    id: c.id,
    name: c.name,
    budget: c.budget?.toString() ?? "",
    overrides: Object.fromEntries(
      Object.entries(o).map(([k, v]) => [k, v == null ? "" : String(v)])
    ),
  };
}

export default function CampaignsEditor({
  campaigns,
  spendById,
}: {
  campaigns: Campaign[];
  spendById: Record<number, number>;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (!draft) return;
    setError(null);
    const overrides: CampaignOverrides = {};
    for (const f of OVERRIDE_FIELDS) {
      const raw = draft.overrides[f.key]?.trim();
      if (!raw) continue;
      (overrides as Record<string, unknown>)[f.key] = f.numeric ? Number(raw) : raw;
    }
    startTransition(async () => {
      const result = await saveCampaignAction({
        id: draft.id,
        name: draft.name,
        overrides,
        budget: draft.budget.trim() ? Number(draft.budget) : null,
      });
      if (result.error) setError(result.error);
      else setDraft(null);
    });
  };

  const archive = (c: Campaign) => {
    if (!window.confirm(`Archive "${c.name}"? Existing deals keep their rules; it disappears from the New Deal picker.`)) return;
    startTransition(async () => {
      await archiveCampaignAction(c.id);
    });
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="font-headline text-sm font-semibold text-slate-900">Campaigns</h3>
        {!draft && (
          <button
            onClick={() => setDraft(emptyDraft())}
            className="text-xs font-semibold text-brand-dark hover:underline"
          >
            + New campaign
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-4 max-w-[70ch]">
        A campaign can override any Playbook rule for its deals — run a SE-Asia campaign at a
        different target geo, or a premium push at a higher CPM ceiling, without touching your
        global rules. Anything left blank falls back to the Playbook above.
      </p>

      {campaigns.length === 0 && !draft && (
        <p className="text-sm text-slate-400 py-2">
          No campaigns yet. Deals without one use your global Playbook.
        </p>
      )}

      <div className="space-y-2">
        {campaigns.map((c) => {
          const overrides = parseOverrides(c.overrides);
          const changes = describeOverrides(overrides);
          const spend = spendById[c.id] ?? 0;
          return (
            <div key={c.id} className="border border-slate-200 rounded-lg px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-900">{c.name}</span>
                {/* The brand's existing creator brief — attach once, and every creator
                    on this campaign gets it in their portal. */}
                <label className="text-xs font-medium text-brand-dark hover:underline cursor-pointer">
                  {c.brief_filename ? `Brief: ${c.brief_filename}` : "+ Attach creator brief"}
                  <input
                    type="file"
                    accept=".html,.pdf,text/html,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const fd = new FormData();
                      fd.set("brief", file);
                      void uploadCampaignBriefAction(c.id, fd);
                    }}
                  />
                </label>
                {c.budget != null && (
                  <span className="text-xs font-tabular text-slate-500">
                    {money(spend)} / {money(c.budget)}
                    {spend > c.budget && <span className="text-red-600 font-semibold"> · over</span>}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-3">
                  <button
                    onClick={() => setDraft(toDraft(c))}
                    className="text-xs font-medium text-slate-500 hover:text-slate-900"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => archive(c)}
                    className="text-xs font-medium text-slate-400 hover:text-red-600"
                  >
                    Archive
                  </button>
                </div>
              </div>

              <BriefRequirements
                campaignId={c.id}
                hasBrief={Boolean(c.brief_filename)}
                initialJson={c.brief_requirements ?? null}
              />
              {c.budget != null && (
                <div className="w-full bg-slate-100 rounded-full h-1 mt-2">
                  <div
                    className={`h-1 rounded-full ${spend > c.budget ? "bg-red-500" : "bg-brand"}`}
                    style={{ width: `${Math.min(100, (spend / c.budget) * 100)}%` }}
                  />
                </div>
              )}
              <p className="text-xs text-slate-500 mt-1.5">
                {changes.length > 0 ? `Overrides — ${changes.join(" · ")}` : "No overrides — uses the global Playbook"}
              </p>
            </div>
          );
        })}
      </div>

      {draft && (
        <div className="border border-brand/40 bg-brand/5 rounded-lg p-4 mt-3">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Campaign name</label>
              <input
                className={inputClass + " w-full"}
                placeholder="e.g. Q4 SE-Asia push"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Campaign budget ($) <span className="font-normal text-slate-500">optional</span>
              </label>
              <input
                className={inputClass + " w-full font-tabular"}
                type="number"
                placeholder="e.g. 15000"
                value={draft.budget}
                onChange={(e) => setDraft({ ...draft, budget: e.target.value })}
              />
            </div>
          </div>

          <p className="text-xs font-semibold text-slate-700 mb-2">
            Rule overrides <span className="font-normal text-slate-500">— leave blank to inherit</span>
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {OVERRIDE_FIELDS.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-600">{f.label}</span>
                <input
                  className={inputClass + " w-28 text-right font-tabular"}
                  type={f.numeric ? "number" : "text"}
                  step="any"
                  placeholder="—"
                  value={draft.overrides[f.key] ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      overrides: { ...draft.overrides, [f.key]: e.target.value },
                    })
                  }
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={save}
              disabled={isPending}
              className="bg-brand hover:bg-brand-dark text-white rounded-md py-1.5 px-4 text-sm font-medium transition-colors shadow-sm disabled:opacity-60"
            >
              {isPending ? "Saving…" : draft.id != null ? "Save campaign" : "Create campaign"}
            </button>
            <button
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
              className="text-sm font-medium text-slate-500 hover:text-slate-900"
            >
              Cancel
            </button>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
