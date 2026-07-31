"use client";

import { useEffect, useState, useTransition } from "react";
import { savePlaybookAction, type PlaybookPayload } from "@/app/playbook/actions";

const PLATFORMS = ["youtube", "instagram", "tiktok", "facebook"] as const;
const PLATFORM_LABEL: Record<string, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
};

const RULE_LABELS: Record<string, string> = {
  minIntegrations: "Min pieces of content per deal",
  maxCpmIntegration: "Max CPM · integration ($)",
  maxCpmShort: "Max CPM · short / mention ($)",
  targetCpc: "Target CPC ($)",
  minAvgViews: "Min avg views",
  minEngagementRate: "Min engagement rate (%)",
  maxFakeFollowers: "Max fake followers (%)",
  minGeoShare: "Min audience in that market (%)",
  geoLabel: "Target market",
  maxPerDeal: "Max per deal ($)",
  monthlyCap: "Monthly budget ($)",
};

const ECON_LABELS: Record<string, string> = {
  aov: "Average order value ($)",
  linkCtr: "Viewers who click the link (%)",
  orderConversion: "Clickers who buy (%)",
  grossMargin: "Gross margin (%)",
  repeatFactor: "Repeat-purchase factor (×)",
  commissionPercent: "Default commission (% of sale)",
  commissionPerOrder: "Default commission ($ per order)",
  discountPercent: "Default audience discount (%)",
  discountFixed: "Default audience discount ($)",
  productCost: "Gifted product — your cost ($, internal)",
  productRetail: "Gifted product — retail price ($, quoted to creators)",
  minPaidFee: "Smallest fee worth paying ($)",
};

/** What the manager sets themselves vs what comes from finance vs sensible defaults. */
const BRAND_LABELS: Record<string, string> = {
  senderName: "Your name",
  senderRole: "Your role",
  brandName: "Brand name",
  productName: "Product you gift",
  productOffer: "How customers buy it (quoted to creators)",
};

const OFFER_FIELDS = [
  "productCost",
  "productRetail",
  "minPaidFee",
  "commissionPercent",
  "commissionPerOrder",
  "discountPercent",
  "discountFixed",
];
const FINANCE_FIELDS = ["aov", "linkCtr", "orderConversion", "grossMargin", "repeatFactor"];
const PLATFORM_BASIC = ["minIntegrations", "minAvgViews", "maxPerDeal"];

const inputClass =
  "w-28 border border-slate-200 rounded-md bg-white px-2.5 py-1.5 text-sm text-right font-tabular text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand";

interface NegotiationStyle {
  style: string;
  anchorBelowTargetPct: number[];
  warnAtWalkawayPct: number;
  maxStepPct: number;
  concessionLadder: string[];
  commissionTiers?: string[];
  nonNegotiables: string[];
}

export default function PlaybookEditor({ initial }: { initial: PlaybookPayload }) {
  const [platforms, setPlatforms] = useState(initial.platforms);
  const [econ, setEcon] = useState(initial.unitEconomics as Record<string, number>);
  const [brand, setBrand] = useState(
    (initial.brandProfile ?? {}) as Record<string, string>
  );
  const [globals, setGlobals] = useState(
    (initial.globalRules ?? {}) as Record<string, string | number>
  );
  const [style, setStyle] = useState(initial.negotiationStyle as unknown as NegotiationStyle);
  const [activePlatform, setActivePlatform] = useState<string>("youtube");
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"pristine" | "idle" | "saved" | "error">("pristine");

  const rules = platforms[activePlatform] ?? {};

  // Closing or refreshing with unsaved edits silently discarded the whole form.
  // (In-app navigation is still unguarded — the sticky save bar makes the dirty
  // state visible, which is the part that prevents most losses.)
  const dirty = status === "idle";
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

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
        globalRules: globals,
        brandProfile: brand,
        unitEconomics: econ,
        negotiationStyle: style as unknown as Record<string, unknown>,
      });
      setStatus(result.error ? "error" : "saved");
    });
  };

  const NAV = [
    ["pb-brand", "Sender & product"],
    ["pb-market", "Market & budget"],
    ["pb-platform", "Platform targets"],
    ["pb-offer", "Standard offer"],
    ["pb-finance", "Finance"],
    ["pb-style", "Negotiation style"],
    ["pb-campaigns", "Campaigns"],
  ] as const;

  return (
    <div className="max-w-5xl">
      {/* Sticky: with 30+ inputs over six screens of scroll, the save button and the
          dirty state must be visible from every one of them. */}
      <div className="flex items-center gap-2 mb-2 sticky top-0 z-20 bg-slate-50/95 backdrop-blur py-3">
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
          {status === "idle" && (
            <span className="text-xs font-medium text-amber-600">Unsaved changes</span>
          )}
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

      <nav className="flex items-center gap-1 mb-4 flex-wrap text-xs">
        {NAV.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="px-2.5 py-1 rounded-full text-slate-500 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200"
          >
            {label}
          </a>
        ))}
      </nav>

      {/* Drafts are signed and describe a product, so the model needs both. Without
          them it writes "our product" and signs off as a department. */}
      <div id="pb-brand" className="scroll-mt-20 bg-white rounded-lg border border-slate-200 shadow-sm p-5 mb-4">
        <h3 className="font-headline text-sm font-semibold text-slate-900 mb-1">
          Who the message is from
        </h3>
        <p className="text-xs text-slate-500 mb-3">
          Used to sign drafts and name what you&apos;re gifting — creators reply to people, not
          to &quot;the partnerships team&quot;.
        </p>
        <div className="grid grid-cols-4 gap-4">
          {Object.entries(brand)
            .filter(([key]) => key !== "productOffer")
            .map(([key, value]) => (
              <div key={key}>
                <label className="block text-xs text-slate-600 mb-1">
                  {BRAND_LABELS[key] ?? key}
                </label>
                <input
                  className={`${inputClass} w-full text-left`}
                  type="text"
                  value={String(value ?? "")}
                  placeholder={key === "productName" ? "e.g. Alpha 3 headset" : ""}
                  onChange={(e) => {
                    setBrand((prev) => ({ ...prev, [key]: e.target.value }));
                    setStatus("idle");
                  }}
                />
              </div>
            ))}
        </div>

        {/* A single retail number can't describe a subscription, a bundle or a promo
            price, so drafts either quote a figure the creator can't find on the site or
            invent one. This is quoted verbatim instead. */}
        <div className="mt-4">
          <label className="block text-xs text-slate-600 mb-1">
            {BRAND_LABELS.productOffer}
          </label>
          <input
            className={`${inputClass} w-full text-left`}
            type="text"
            value={String(brand.productOffer ?? "")}
            placeholder="e.g. $19.99/month for 6 months, device included"
            onChange={(e) => {
              setBrand((prev) => ({ ...prev, productOffer: e.target.value }));
              setStatus("idle");
            }}
          />
          <p className="text-[11px] text-slate-500 mt-1">
            How a customer actually buys it, in your words — drafts quote this instead of a
            lump sum, so the price is one a creator can find on your site. Leave blank to use
            the retail price.
          </p>
        </div>
      </div>

      {/* Applies everywhere — previously duplicated on each platform tab, where the
          copies could disagree and only YouTube's budget was ever read. */}
      <div id="pb-market" className="scroll-mt-20 bg-white rounded-lg border border-slate-200 shadow-sm p-5 mb-4">
        <h3 className="font-headline text-sm font-semibold text-slate-900 mb-1">
          Your market &amp; budget
        </h3>
        <p className="text-xs text-slate-500 mb-3">
          Set once — these apply to every platform.
        </p>
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(globals).map(([key, value]) => (
            <div key={key}>
              <label className="block text-xs text-slate-600 mb-1">{RULE_LABELS[key] ?? key}</label>
              <input
                className={typeof value === "number" ? `${inputClass} w-full` : `${inputClass} w-full text-left`}
                type={typeof value === "number" ? "number" : "text"}
                step="any"
                value={String(value)}
                onChange={(e) => {
                  setGlobals((prev) => ({
                    ...prev,
                    [key]: typeof value === "number" ? Number(e.target.value) : e.target.value,
                  }));
                  setStatus("idle");
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 items-start">
        {/* Economics targets */}
        <div id="pb-platform" className="scroll-mt-20 bg-white rounded-lg border border-slate-200 shadow-sm p-5">
          <h3 className="font-headline text-sm font-semibold text-slate-900 mb-3">
            Economics targets — {PLATFORM_LABEL[activePlatform]}
          </h3>
          <div className="divide-y divide-slate-100">
            {Object.entries(rules)
              .filter(([key]) => PLATFORM_BASIC.includes(key))
              .map(([key, value]) => (
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

          {/* Quality and price ceilings ship with sensible values and rarely need
              touching — hidden so the page opens on the handful that matter. */}
          <details className="mt-3 group">
            <summary className="text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer list-none flex items-center gap-1">
              <span className="material-symbols-outlined group-open:rotate-90 transition-transform" style={{ fontSize: 14 }}>
                chevron_right
              </span>
              Price ceilings &amp; quality filters — good defaults, edit rarely
            </summary>
            <div className="divide-y divide-slate-100 mt-2">
              {Object.entries(rules)
                .filter(([key]) => !PLATFORM_BASIC.includes(key))
                .map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between gap-4 py-2">
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
          </details>
        </div>

        {/* Unit economics */}
        <div id="pb-offer" className="scroll-mt-20 bg-white rounded-lg border border-slate-200 shadow-sm p-5">
          <h3 className="font-headline text-sm font-semibold text-slate-900 mb-1">
            Your standard offer
          </h3>
          <p className="text-xs text-slate-500 mb-3">
            What every creator gets by default. Prefilled on each new deal.
          </p>
          <div className="divide-y divide-slate-100">
            {Object.entries(econ)
              .filter(([key]) => OFFER_FIELDS.includes(key))
              .map(([key, value]) => (
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

          <h3 id="pb-finance" className="scroll-mt-20 font-headline text-sm font-semibold text-slate-900 mt-5 mb-1">
            From your finance team
          </h3>
          <p className="text-xs text-slate-500 mb-3 max-w-[48ch]">
            Ask once, then leave alone. These turn views into a breakeven price —{" "}
            <span className="text-slate-600">
              views × click % = clicks, clicks × buy % = orders
            </span>{" "}
            — which is the strongest anchor you have, because it&apos;s yours rather than the
            market&apos;s.
          </p>
          <div className="divide-y divide-slate-100">
            {Object.entries(econ)
              .filter(([key]) => FINANCE_FIELDS.includes(key))
              .map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-4 py-2">
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
        </div>

        {/* Negotiation style */}
        <div id="pb-style" className="scroll-mt-20 bg-white rounded-lg border border-slate-200 shadow-sm p-5">
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
          <h3 className="font-headline text-sm font-semibold text-slate-900 mt-4 mb-1.5">
            Commission volume tiers
          </h3>
          <p className="text-xs text-slate-500 mb-2">
            One rung per line as <code className="text-slate-600">from: $/sale</code> — e.g.{" "}
            <code className="text-slate-600">0: 20</code>, <code className="text-slate-600">50: 40</code>.
            The volume reached sets one rate paid on every sale, so crossing a rung lifts the
            creator&apos;s whole payout.
          </p>
          <textarea
            rows={3}
            placeholder={"0: 20\n25: 30\n50: 40"}
            className="w-full border border-slate-200 rounded-lg bg-white px-3 py-2 text-sm text-slate-800 font-tabular focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand resize-y"
            value={(style.commissionTiers ?? []).join("\n")}
            onChange={(e) =>
              setStyle((prev) => ({ ...prev, commissionTiers: e.target.value.split("\n").filter(Boolean) }))
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
