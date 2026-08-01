"use client";

import { useState, useTransition } from "react";
import {
  parseRequirements,
  type BriefRequirement,
  type RequirementKind,
} from "@/lib/brief-requirements";
import {
  extractBriefRequirementsAction,
  saveBriefRequirementsAction,
} from "@/app/playbook/campaign-actions";

const KIND_LABEL: Record<RequirementKind, string> = {
  mention: "Must say",
  disclosure: "Disclosure",
  prohibited: "Must not say",
};

const KIND_CLASS: Record<RequirementKind, string> = {
  mention: "bg-sky-50 text-sky-700 border-sky-200",
  disclosure: "bg-emerald-50 text-emerald-700 border-emerald-200",
  prohibited: "bg-red-50 text-red-700 border-red-200",
};

/**
 * The brief's checkable obligations, extracted by the Copilot and then owned here.
 *
 * Everything is editable because extraction from prose is a starting point, not a
 * verdict — and because these rules later decide whether a creator's video passes,
 * which is not a judgement to hand to a model unsupervised. The phrases matter most:
 * they are what a mangled transcript gets matched against, so adding the way a creator
 * actually says something is the highest-value edit available here.
 */
export default function BriefRequirements({
  campaignId,
  hasBrief,
  initialJson,
}: {
  campaignId: number;
  hasBrief: boolean;
  initialJson: string | null;
}) {
  const [reqs, setReqs] = useState(() => parseRequirements(initialJson));
  const [saved, setSaved] = useState(() => JSON.stringify(parseRequirements(initialJson)));
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const dirty = JSON.stringify(reqs) !== saved;
  const count = reqs.requirements.length;

  const extract = () => {
    setError(null);
    startTransition(async () => {
      const result = await extractBriefRequirementsAction(campaignId);
      if (result?.error) setError(result.error);
      else window.location.reload();
    });
  };

  const save = () => {
    setError(null);
    const json = JSON.stringify(reqs);
    startTransition(async () => {
      const result = await saveBriefRequirementsAction(campaignId, json);
      if (result?.error) setError(result.error);
      else setSaved(json);
    });
  };

  const update = (id: string, patch: Partial<BriefRequirement>) =>
    setReqs((r) => ({
      ...r,
      requirements: r.requirements.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    }));

  const remove = (id: string) =>
    setReqs((r) => ({ ...r, requirements: r.requirements.filter((q) => q.id !== id) }));

  const add = () =>
    setReqs((r) => ({
      ...r,
      requirements: [
        ...r.requirements,
        { id: `custom-${Date.now()}`, kind: "mention", label: "", phrases: [] },
      ],
    }));

  if (!hasBrief) return null;

  return (
    <div className="mt-2">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-xs font-medium text-slate-500 hover:text-slate-900"
        >
          {open ? "▾" : "▸"} Video requirements
          {count > 0 && <span className="text-slate-400"> · {count}</span>}
          {reqs.minIntegrationSeconds != null && (
            <span className="text-slate-400"> · min {reqs.minIntegrationSeconds}s</span>
          )}
        </button>
        {count === 0 && (
          <button
            onClick={extract}
            disabled={isPending}
            className="text-xs font-medium text-brand-dark hover:underline disabled:opacity-60"
          >
            {isPending ? "Reading brief…" : "Read from brief"}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}

      {open && (
        <div className="mt-2 border border-slate-200 rounded-lg p-3 bg-slate-50/60">
          {count === 0 ? (
            <p className="text-xs text-slate-500">
              Nothing extracted yet. &ldquo;Read from brief&rdquo; pulls out what the creator has
              to say on camera, and how long the integration must run — then you correct it.
            </p>
          ) : (
            <>
              <label className="flex items-center gap-2 text-xs text-slate-600 mb-3">
                Minimum integration
                <input
                  type="number"
                  min={0}
                  value={reqs.minIntegrationSeconds ?? ""}
                  onChange={(e) =>
                    setReqs((r) => ({
                      ...r,
                      minIntegrationSeconds: e.target.value === "" ? null : Number(e.target.value),
                    }))
                  }
                  className="w-20 border border-slate-200 rounded px-2 py-1 text-xs font-tabular"
                />
                seconds
                <span className="text-slate-400">— blank if the brief sets no floor</span>
              </label>

              <div className="space-y-2">
                {reqs.requirements.map((q) => (
                  <div key={q.id} className="bg-white border border-slate-200 rounded-lg p-2.5">
                    <div className="flex items-center gap-2">
                      <select
                        value={q.kind}
                        onChange={(e) => update(q.id, { kind: e.target.value as RequirementKind })}
                        className={`text-[11px] font-semibold rounded-full px-2 py-0.5 border ${KIND_CLASS[q.kind]}`}
                      >
                        {(Object.keys(KIND_LABEL) as RequirementKind[]).map((k) => (
                          <option key={k} value={k}>
                            {KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                      <input
                        value={q.label}
                        onChange={(e) => update(q.id, { label: e.target.value })}
                        placeholder="What the brief asks for"
                        className="flex-1 text-xs border-0 focus:ring-0 p-0 text-slate-900 font-medium bg-transparent"
                      />
                      <button
                        onClick={() => remove(q.id)}
                        className="text-xs text-slate-300 hover:text-red-600"
                        aria-label={`Remove ${q.label || "requirement"}`}
                      >
                        ✕
                      </button>
                    </div>
                    <input
                      value={q.phrases.join(", ")}
                      onChange={(e) =>
                        update(q.id, {
                          phrases: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="Spoken forms that count, comma separated"
                      className="w-full mt-1.5 text-[11px] text-slate-500 border border-slate-100 rounded px-2 py-1"
                    />
                  </div>
                ))}
              </div>

              {reqs.notCheckable.length > 0 && (
                <details className="mt-3">
                  <summary className="text-[11px] text-slate-500 cursor-pointer">
                    {reqs.notCheckable.length} things the brief asks for that a transcript
                    can&apos;t check
                  </summary>
                  <ul className="mt-1.5 space-y-0.5 list-disc list-inside">
                    {reqs.notCheckable.map((n) => (
                      <li key={n} className="text-[11px] text-slate-500">
                        {n}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="flex items-center gap-3 mt-3">
                <button onClick={add} className="text-xs font-medium text-slate-500 hover:text-slate-900">
                  + Add requirement
                </button>
                <button
                  onClick={extract}
                  disabled={isPending}
                  className="text-xs font-medium text-slate-400 hover:text-slate-700 disabled:opacity-60"
                >
                  Re-read brief
                </button>
                {dirty && (
                  <button
                    onClick={save}
                    disabled={isPending}
                    className="ml-auto text-xs font-medium bg-slate-900 text-white rounded-md px-3 py-1 hover:bg-slate-800 disabled:opacity-60"
                  >
                    {isPending ? "Saving…" : "Save requirements"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
