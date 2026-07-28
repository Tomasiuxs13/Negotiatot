"use client";

import { useState, useTransition } from "react";
import { savePlaybookAction, type PlaybookPayload } from "@/app/playbook/actions";

const PLATFORMS = ["youtube", "instagram", "tiktok"] as const;
const PLATFORM_LABEL: Record<string, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
};

const RULE_LABELS: Record<string, string> = {
  minIntegrations: "Min pieces of content per deal",
  maxCpmIntegration: "Max CPM · integration (€)",
  maxCpmShort: "Max CPM · short / mention (€)",
  targetCpc: "Target CPC (€)",
  minAvgViews: "Min avg views",
  minEngagementRate: "Min engagement rate (%)",
  maxFakeFollowers: "Max fake followers (%)",
  minGeoShare: "Min target-geo share (%)",
  geoLabel: "Target geo",
  maxPerDeal: "Max per deal (€)",
  monthlyCap: "Monthly cap (€)",
};

const ECON_LABELS: Record<string, string> = {
  aov: "Average order value (€)",
  conversionRate: "Conversion rate (%)",
  grossMargin: "Gross margin (%)",
  repeatFactor: "Repeat-purchase factor (×)",
  commissionPercent: "Default commission (% of sale)",
  commissionPerOrder: "Default commission (€ per order)",
  discountPercent: "Default audience discount (%)",
  discountFixed: "Default audience discount (€)",
  productCost: "Gifted product — your cost (€)",
  minPaidFee: "Smallest fee worth paying (€)",
};

const inputClass =
  "w-28 border border-slate-200 rounded-md bg-white px-2.5 py-1.5 text-sm text-right font-tabular text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand";

interface NegotiationStyle {
  style: string;
  anchorBelowTargetPct: number[];
  warnAtWalkawayPct: number;
  maxStepPct: number;
  concessionLadder: string[];
  nonNegotiables: string[];
}

export default function PlaybookEditor({ initial }: { initial: PlaybookPayload }) {
  const [platforms, setPlatforms] = useState(initial.platforms);
  const [econ, setEcon] = useState(initial.unitEconomics as Record<string, number>);
  const [style, setStyle] = useState(initial.negotiationStyle as unknown as NegotiationStyle);
  const [activePlatform, setActivePlatform] = useState<string>("youtube");
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  const rules = platforms[activePlatform] ?? {};

  const setRule = (key: string, value: string) => {
    setPlatforms((prev) => ({
      ...prev,
      [activePlatform]: {
        ...prev[activePlatform],
        [key]: typeof rules[key] === "number" ? Number(value) : value,
      },
    }));
    setStatus("idle");
  };

  const save = () => {
    startTransition(async () => {
      const result = await savePlaybookAction({
        platforms,
        unitEconomics: econ,
        negotiationStyle: style as unknown as Record<string, unknown>,
      });
      setStatus(result.error ? "error" : "saved");
    });
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-2 mb-4">
        {PLATFORMS.map((p) => (
          <button
            key={p}
            onClick={() => setActivePlatform(p)}
            className={`text-sm font-semibold px-4 py-1.5 rounded-full border transition-colors ${
              activePlatform === p
                ? "bg-slate-900 text-white border-slate-900"
                : "border-slate-200 text-slate-500 hover:text-slate-800"
            }`}
          >
            {PLATFORM_LABEL[p]}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3">
          {status === "saved" && <span className="text-xs font-medium text-emerald-600">Saved ✓</span>}
          {status === "error" && <span className="text-xs font-medium text-red-600">Save failed</span>}
          <button
            onClick={save}
            disabled={isPending}
            className="bg-brand hover:bg-brand-dark text-white rounded-md py-1.5 px-4 text-sm font-medium transition-colors shadow-sm disabled:opacity-60"
          >
            {isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 items-start">
        {/* Economics targets */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
          <h3 className="font-headline text-sm font-semibold text-slate-900 mb-3">
            Economics targets — {PLATFORM_LABEL[activePlatform]}
          </h3>
          <div className="divide-y divide-slate-100">
            {Object.entries(rules).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
                <span className="text-sm text-slate-600">{RULE_LABELS[key] ?? key}</span>
                <input
                  className={typeof value === "number" ? inputClass : `${inputClass} text-left w-32`}
                  type={typeof value === "number" ? "number" : "text"}
                  step="any"
                  value={String(value)}
                  onChange={(e) => setRule(key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Unit economics */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
          <h3 className="font-headline text-sm font-semibold text-slate-900 mb-3">Unit economics</h3>
          <div className="divide-y divide-slate-100">
            {Object.entries(econ).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
                <span className="text-sm text-slate-600">{ECON_LABELS[key] ?? key}</span>
                <input
                  className={inputClass}
                  type="number"
                  step="any"
                  value={value}
                  onChange={(e) => {
                    setEcon((prev) => ({ ...prev, [key]: Number(e.target.value) }));
                    setStatus("idle");
                  }}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-3 max-w-[48ch]">
            These four numbers let Counterpart compute a breakeven price per channel — the strongest
            anchor in any negotiation, because it&apos;s yours, not the market&apos;s.
          </p>
        </div>

        {/* Negotiation style */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
          <h3 className="font-headline text-sm font-semibold text-slate-900 mb-3">Negotiation style</h3>
          <div className="flex gap-2 mb-4">
            {["relationship-first", "balanced", "aggressive"].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStyle((prev) => ({ ...prev, style: s }));
                  setStatus("idle");
                }}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border capitalize transition-colors ${
                  style.style === s
                    ? "border-brand text-brand-dark bg-brand/10"
                    : "border-slate-200 text-slate-500 hover:text-slate-800"
                }`}
              >
                {s.replace("-", " ")}
              </button>
            ))}
          </div>
          <div className="divide-y divide-slate-100">
            <div className="flex items-center justify-between gap-4 py-2">
              <span className="text-sm text-slate-600">Anchor below target (%)</span>
              <div className="flex items-center gap-1.5">
                <input
                  className={`${inputClass} w-16`}
                  type="number"
                  value={style.anchorBelowTargetPct?.[0] ?? 12}
                  onChange={(e) =>
                    setStyle((prev) => ({
                      ...prev,
                      anchorBelowTargetPct: [Number(e.target.value), prev.anchorBelowTargetPct?.[1] ?? 15],
                    }))
                  }
                />
                <span className="text-slate-400 text-sm">–</span>
                <input
                  className={`${inputClass} w-16`}
                  type="number"
                  value={style.anchorBelowTargetPct?.[1] ?? 15}
                  onChange={(e) =>
                    setStyle((prev) => ({
                      ...prev,
                      anchorBelowTargetPct: [prev.anchorBelowTargetPct?.[0] ?? 12, Number(e.target.value)],
                    }))
                  }
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 py-2">
              <span className="text-sm text-slate-600">Warn at % of walk-away</span>
              <input
                className={inputClass}
                type="number"
                value={style.warnAtWalkawayPct}
                onChange={(e) => setStyle((prev) => ({ ...prev, warnAtWalkawayPct: Number(e.target.value) }))}
              />
            </div>
            <div className="flex items-center justify-between gap-4 py-2 last:pb-0">
              <span className="text-sm text-slate-600">Max price step per round (%)</span>
              <input
                className={inputClass}
                type="number"
                value={style.maxStepPct}
                onChange={(e) => setStyle((prev) => ({ ...prev, maxStepPct: Number(e.target.value) }))}
              />
            </div>
          </div>
        </div>

        {/* Concession ladder + non-negotiables */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
          <h3 className="font-headline text-sm font-semibold text-slate-900 mb-1.5">Concession ladder</h3>
          <p className="text-xs text-slate-500 mb-2">One lever per line, in order — price should stay last.</p>
          <textarea
            rows={5}
            className="w-full border border-slate-200 rounded-lg bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand resize-y"
            value={(style.concessionLadder ?? []).join("\n")}
            onChange={(e) =>
              setStyle((prev) => ({ ...prev, concessionLadder: e.target.value.split("\n").filter(Boolean) }))
            }
          />
          <h3 className="font-headline text-sm font-semibold text-slate-900 mt-4 mb-1.5">Non-negotiables</h3>
          <p className="text-xs text-slate-500 mb-2">One per line — the Copilot will never trade these away.</p>
          <textarea
            rows={4}
            className="w-full border border-slate-200 rounded-lg bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand resize-y"
            value={(style.nonNegotiables ?? []).join("\n")}
            onChange={(e) =>
              setStyle((prev) => ({ ...prev, nonNegotiables: e.target.value.split("\n").filter(Boolean) }))
            }
          />
        </div>
      </div>
    </div>
  );
}
