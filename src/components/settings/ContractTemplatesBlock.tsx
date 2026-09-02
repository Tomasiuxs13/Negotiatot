"use client";

import { useMemo, useState, useTransition } from "react";
import {
  deleteContractTemplateAction,
  previewContractTemplateAction,
  proposeContractSlotsAction,
  saveContractTemplateAction,
  setDefaultContractTemplateAction,
} from "@/app/settings/actions";
import {
  CONTRACT_SLOTS,
  REQUIREMENT_LABEL,
  validateTemplate,
  type RequirementGroup,
} from "@/lib/contract-slots";
import type { SlotProposal } from "@/lib/claude";

export interface TemplateRow {
  id: number;
  name: string;
  body: string;
  is_default: 0 | 1;
  incomplete: 0 | 1;
  updated_at: string;
}

type Mode =
  | { kind: "list" }
  | { kind: "import" }
  | { kind: "edit"; id: number | null; name: string; body: string; proposal: SlotProposal | null };

const GROUPS: RequirementGroup[] = ["parties", "deliverables", "compensation"];

/**
 * Contracts: ours or theirs.
 *
 * A company pastes its own agreement once; Claude keeps the wording and marks the parts
 * the app can fill; the person reviews the mapping against a real deal and saves. From
 * then on every Agreed deal renders their wording with our data. The built-in agreement
 * is always available and is the default until they choose otherwise.
 */
export default function ContractTemplatesBlock({
  templates,
  builtinBody,
  sampleDeals,
  apiConfigured,
}: {
  templates: TemplateRow[];
  builtinBody: string;
  /** Recent deals to preview a template against. */
  sampleDeals: { id: number; creator: string }[];
  apiConfigured: boolean;
}) {
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [pasted, setPasted] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewDeal, setPreviewDeal] = useState<number | null>(sampleDeals[0]?.id ?? null);
  const [showSlots, setShowSlots] = useState(false);
  const [isPending, startTransition] = useTransition();

  const report = useMemo(
    () => (mode.kind === "edit" ? validateTemplate(mode.body) : null),
    [mode]
  );

  const hasCustomDefault = templates.some((t) => t.is_default === 1);

  const openEditor = (row: TemplateRow | null, body?: string, proposal: SlotProposal | null = null) => {
    setNote(null);
    setPreview(null);
    setMode({
      kind: "edit",
      id: row?.id ?? null,
      name: row?.name ?? "",
      body: body ?? row?.body ?? "",
      proposal,
    });
  };

  const run = (fn: () => Promise<{ error?: string }>, after?: () => void) => {
    setNote(null);
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setNote(r.error);
      else after?.();
    });
  };

  // ------------------------------------------------------------------ list
  if (mode.kind === "list") {
    return (
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="text-sm font-semibold text-slate-900">Contract templates</span>
            <p className="text-xs text-slate-500 mt-1 max-w-[60ch]">
              Every Agreed deal gets a contract draft. Use Counterpart&apos;s agreement, or add
              your own: the system marks which parts it can fill from the deal, and your wording
              stays as written.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => { setNote(null); setPasted(""); setMode({ kind: "import" }); }}
              className="text-xs font-medium bg-slate-900 text-white rounded-md px-3 py-1.5 hover:bg-slate-800"
            >
              Add your own contract
            </button>
          </div>
        </div>

        <ul className="mt-4 divide-y divide-slate-100 border border-slate-200 rounded-md">
          <li className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <span className="text-sm text-slate-900">Counterpart standard agreement</span>
              {!hasCustomDefault && <Badge tone="brand">Default</Badge>}
              <p className="text-[11px] text-slate-500">
                Fee, commission-only and gifted deals; rights written from what was priced.
              </p>
            </div>
            <div className="flex gap-3 shrink-0 text-xs">
              <button onClick={() => openEditor(null, builtinBody)} className="font-medium text-brand-dark hover:underline">
                Duplicate to customise
              </button>
              {hasCustomDefault && (
                <button
                  onClick={() => run(() => setDefaultContractTemplateAction(null))}
                  disabled={isPending}
                  className="font-medium text-slate-600 hover:underline disabled:opacity-50"
                >
                  Make default
                </button>
              )}
            </div>
          </li>
          {templates.map((t) => {
            const missing = validateTemplate(t.body).missing;
            return (
              <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <span className="text-sm text-slate-900">{t.name}</span>
                  {t.is_default === 1 && <Badge tone="brand">Default</Badge>}
                  {t.incomplete === 1 && (
                    <Badge tone="amber" title={missing.map((g) => REQUIREMENT_LABEL[g]).join("; ")}>
                      Incomplete
                    </Badge>
                  )}
                  <p className="text-[11px] text-slate-500">
                    Updated {t.updated_at.slice(0, 10)}
                    {t.incomplete === 1 && missing.length > 0 && (
                      <> · missing: {missing.map((g) => REQUIREMENT_LABEL[g].toLowerCase()).join(", ")}</>
                    )}
                  </p>
                </div>
                <div className="flex gap-3 shrink-0 text-xs">
                  <button onClick={() => openEditor(t)} className="font-medium text-brand-dark hover:underline">
                    Edit
                  </button>
                  {t.is_default !== 1 && t.incomplete !== 1 && (
                    <button
                      onClick={() => run(() => setDefaultContractTemplateAction(t.id))}
                      disabled={isPending}
                      className="font-medium text-slate-600 hover:underline disabled:opacity-50"
                    >
                      Make default
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (!window.confirm(`Delete "${t.name}"? Deals using it will fall back to the default.`)) return;
                      run(() => deleteContractTemplateAction(t.id));
                    }}
                    disabled={isPending}
                    className="font-medium text-red-600 hover:underline disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {note && <p className="text-xs text-red-600 mt-2">{note}</p>}
      </div>
    );
  }

  // ---------------------------------------------------------------- import
  if (mode.kind === "import") {
    return (
      <div className="p-5">
        <span className="text-sm font-semibold text-slate-900">Add your own contract</span>
        <p className="text-xs text-slate-500 mt-1 max-w-[60ch]">
          Paste the agreement your company uses. The wording is kept as written; the system
          marks the parts it can fill per deal — names, amounts, deliverables, dates, rights — and
          lists anything it could not map, so you can decide what stays manual.
        </p>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={14}
          placeholder="Paste the full text of your agreement here…"
          className="mt-3 w-full border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-800 font-mono resize-y"
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() =>
              startTransition(async () => {
                setNote(null);
                const r = await proposeContractSlotsAction(pasted);
                if (r.error) { setNote(r.error); return; }
                openEditor(null, r.proposal!.template, r.proposal!);
              })
            }
            disabled={isPending || !apiConfigured || pasted.trim().length < 200}
            className="text-xs font-medium bg-slate-900 text-white rounded-md px-3 py-1.5 hover:bg-slate-800 disabled:opacity-60"
          >
            {isPending ? "Reading the agreement…" : "Mark the automatable parts"}
          </button>
          <button
            onClick={() => openEditor(null, pasted)}
            disabled={!pasted.trim()}
            className="text-xs font-medium border border-slate-200 hover:border-slate-400 text-slate-700 rounded-md px-3 py-1.5 disabled:opacity-50"
            title="Skip the automatic pass and place the slots yourself"
          >
            Mark them myself
          </button>
          <button onClick={() => setMode({ kind: "list" })} className="text-xs text-slate-500 hover:underline ml-auto">
            Cancel
          </button>
        </div>
        {!apiConfigured && (
          <p className="text-xs text-amber-700 mt-2">No Claude API key is configured, so only manual marking is available.</p>
        )}
        {note && <p className="text-xs text-red-600 mt-2">{note}</p>}
      </div>
    );
  }

  // ------------------------------------------------------------------ edit
  const canSave = !!mode.name.trim() && !!mode.body.trim() && report != null && report.errors.length === 0;

  return (
    <div className="p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-900">
          {mode.id ? "Edit template" : mode.proposal ? "Review the marked-up contract" : "New template"}
        </span>
        <button onClick={() => setMode({ kind: "list" })} className="text-xs text-slate-500 hover:underline">
          Back to templates
        </button>
      </div>

      <input
        value={mode.name}
        onChange={(e) => setMode({ ...mode, name: e.target.value })}
        placeholder="Template name — e.g. Standard paid collaboration"
        className="mt-3 w-full border border-slate-200 rounded-md px-3 py-1.5 text-sm text-slate-900"
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mt-3">
        <div className="lg:col-span-3">
          <textarea
            value={mode.body}
            onChange={(e) => setMode({ ...mode, body: e.target.value })}
            rows={24}
            spellCheck={false}
            className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-800 font-mono resize-y"
          />
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button
              onClick={() =>
                run(() => saveContractTemplateAction({ id: mode.id, name: mode.name, body: mode.body }), () =>
                  setMode({ kind: "list" })
                )
              }
              disabled={isPending || !canSave}
              className="text-xs font-medium bg-slate-900 text-white rounded-md px-3 py-1.5 hover:bg-slate-800 disabled:opacity-60"
            >
              {report && report.missing.length > 0 ? "Save as incomplete" : "Save template"}
            </button>
            {sampleDeals.length > 0 && (
              <>
                <select
                  value={previewDeal ?? ""}
                  onChange={(e) => setPreviewDeal(Number(e.target.value))}
                  className="text-xs border border-slate-200 rounded-md px-2 py-1.5 text-slate-700 bg-white"
                  aria-label="Deal to preview against"
                >
                  {sampleDeals.map((d) => (
                    <option key={d.id} value={d.id}>{d.creator}</option>
                  ))}
                </select>
                <button
                  onClick={() =>
                    startTransition(async () => {
                      setNote(null);
                      const r = await previewContractTemplateAction(mode.body, previewDeal!);
                      if (r.error) setNote(r.error);
                      else setPreview(r.text ?? "");
                    })
                  }
                  disabled={isPending || previewDeal == null}
                  className="text-xs font-medium border border-slate-200 hover:border-slate-400 text-slate-700 rounded-md px-3 py-1.5 disabled:opacity-50"
                >
                  Preview on this deal
                </button>
              </>
            )}
          </div>
          {note && <p className="text-xs text-red-600 mt-2">{note}</p>}
          {preview != null && (
            <pre className="mt-3 whitespace-pre-wrap text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-md p-3 max-h-96 overflow-auto">
              {preview}
            </pre>
          )}
        </div>

        <aside className="lg:col-span-2 text-xs space-y-4">
          {report && (
            <section>
              <h4 className="font-semibold text-slate-700 mb-1.5">What the system needs</h4>
              <ul className="space-y-1">
                {GROUPS.map((g) => {
                  const ok = !report.missing.includes(g);
                  return (
                    <li key={g} className={ok ? "text-emerald-700" : "text-amber-700"}>
                      {ok ? "✓" : "○"} {REQUIREMENT_LABEL[g]}
                    </li>
                  );
                })}
              </ul>
              {report.errors.length > 0 && (
                <ul className="mt-2 space-y-1 text-red-600">
                  {report.errors.map((e, i) => (
                    <li key={i}>Line {e.line}: {e.message}</li>
                  ))}
                </ul>
              )}
              {report.unknownSlots.length > 0 && (
                <p className="mt-2 text-amber-700">
                  Unknown slots (render empty):{" "}
                  {report.unknownSlots.map((u) => `{{${u.path}}} line ${u.line}`).join(", ")}
                </p>
              )}
            </section>
          )}

          {mode.proposal && (
            <>
              <section>
                <h4 className="font-semibold text-slate-700 mb-1.5">
                  Automated · {mode.proposal.mapped.length}
                </h4>
                <ul className="space-y-1.5 max-h-56 overflow-auto pr-1">
                  {mode.proposal.mapped.map((m, i) => (
                    <li key={i} className="text-slate-600">
                      <code className="text-emerald-700">{`{{${m.slot}}}`}</code>{" "}
                      <span className="text-slate-400">replaced</span> “{m.original}”
                    </li>
                  ))}
                </ul>
              </section>
              {mode.proposal.unmapped.length > 0 && (
                <section>
                  <h4 className="font-semibold text-slate-700 mb-1.5">
                    Stays manual · {mode.proposal.unmapped.length}
                  </h4>
                  <ul className="space-y-1.5 max-h-40 overflow-auto pr-1">
                    {mode.proposal.unmapped.map((u, i) => (
                      <li key={i} className="text-slate-600">
                        “{u.excerpt}” <span className="text-slate-400">— {u.reason}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {mode.proposal.notes.length > 0 && (
                <section>
                  <h4 className="font-semibold text-slate-700 mb-1.5">Notes</h4>
                  <ul className="space-y-1 text-amber-700">
                    {mode.proposal.notes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </section>
              )}
            </>
          )}

          <section>
            <button onClick={() => setShowSlots((v) => !v)} className="font-semibold text-slate-700 hover:underline">
              {showSlots ? "Hide" : "Show"} all slots ({CONTRACT_SLOTS.length})
            </button>
            {showSlots && (
              <ul className="mt-1.5 space-y-1 max-h-72 overflow-auto pr-1">
                {CONTRACT_SLOTS.map((s) => (
                  <li key={s.path} className="text-slate-600">
                    <code className="text-slate-900">{`{{${s.path}}}`}</code> {s.label}
                    {s.description && <span className="text-slate-400"> — {s.description}</span>}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-slate-400">
              Blocks: <code>{"{{#if commission}}…{{/if}}"}</code>, <code>{"{{#each deliverables.items}}…{{/each}}"}</code>.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Badge({ tone, children, title }: { tone: "brand" | "amber"; children: React.ReactNode; title?: string }) {
  const cls = tone === "brand" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700";
  return (
    <span title={title} className={`ml-2 align-middle text-[10px] font-semibold rounded-full px-2 py-0.5 ${cls}`}>
      {children}
    </span>
  );
}
