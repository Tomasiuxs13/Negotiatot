"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDealAction, lookupPartnerAction } from "@/app/new/actions";
import type { PartnerPrefill } from "@/lib/partners";
import { categoryOptions } from "@/lib/categories";
import { money, moneyCpm } from "@/lib/format";
import { campaignGoalLabel, type Campaign } from "@/lib/campaigns";

const inputClass =
  "w-full border border-slate-200 rounded-lg bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand";

const PLATFORMS = [
  { value: "youtube", label: "YouTube" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "facebook", label: "Facebook" },
];

export default function NewDealForm({
  campaigns = [],
  partners = [],
  categories = [],
  presetPartner,
  stage,
  defaultCommission = 0,
  defaultCommissionType = "none",
  defaultDiscount = 0,
  defaultDiscountType = "none",
}: {
  campaigns?: Pick<Campaign, "id" | "name" | "objective" | "primary_kpi" | "kpi_target">[];
  partners?: { id: number; name: string }[];
  /** The managed creator categories, from Settings. */
  categories?: string[];
  presetPartner?: PartnerPrefill;
  stage?: string;
  /** Your standard affiliate rate, from the Playbook. */
  defaultCommission?: number;
  defaultCommissionType?: string;
  /** Your standard audience coupon, from the Playbook. */
  defaultDiscount?: number;
  defaultDiscountType?: string;
}) {
  // The URL param seeds the choice; the form owns it from there. Before this was a
  // visible control, capture-without-analysis only existed behind the per-column "+"
  // on the pipeline board — functionality nobody can find is functionality that
  // doesn't exist. "Use it as a CRM first, spend credits when they reply" is a mode,
  // and a mode belongs on the form.
  const [stageChoice, setStageChoice] = useState(
    stage === "lead" || stage === "contacted" ? stage : "analyzing"
  );
  const isLeadCapture = stageChoice === "lead" || stageChoice === "contacted";
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const initialPlatforms =
    presetPartner && presetPartner.platforms.length > 0
      ? presetPartner.platforms
      : ["youtube"];
  const [selected, setSelected] = useState<string[]>(initialPlatforms);
  const [primaryPlatform, setPrimaryPlatform] = useState(
    presetPartner?.primaryPlatform ?? initialPlatforms[0]
  );
  const [known, setKnown] = useState<PartnerPrefill | null>(presetPartner ?? null);
  // A creator's category belongs to the creator, so a returning one arrives with theirs
  // already chosen — see recognisePartner.
  const [category, setCategory] = useState(presetPartner?.category ?? "");

  /**
   * Recognises a returning creator and fills in what we already hold on them, so the
   * second collaboration starts from the record rather than from a blank form.
   */
  const recognisePartner = (name: string) => {
    startTransition(async () => {
      const found = await lookupPartnerAction(name);
      setKnown(found);
      if (found) {
        // Never overwrite a category the manager just picked for this deal.
        if (found.category && !category) setCategory(found.category);
        if (found.platforms.length > 0) {
          setSelected(found.platforms);
          setPrimaryPlatform(found.primaryPlatform ?? found.platforms[0]);
        }
        const form = formRef.current;
        if (form) {
          const fill = (field: string, value: string | number | null) => {
            const el = form.elements.namedItem(field) as HTMLInputElement | null;
            if (el && !el.value && value != null) el.value = String(value);
          };
          fill("email", found.email);
          fill("channel_url", found.channelUrl);
          fill("known_avg_views", found.avgViews);
          fill("known_engagement", found.engagementRate);
        }
      }
    });
  };

  const togglePlatform = (value: string) => {
    const next = selected.includes(value)
      ? selected.filter((p) => p !== value)
      : [...selected, value];
    setSelected(next);
    if (next.length > 0 && (!next.includes(primaryPlatform) || selected.length === 0)) {
      setPrimaryPlatform(next[0]);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    for (const p of selected) formData.append("platforms", p);
    setError(null);
    setWarning(null);
    startTransition(async () => {
      const result = await createDealAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.warning) setWarning(result.warning);
      if (result.id != null) router.push(`/deals/${result.id}`);
    });
  };

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-4">
      <input type="hidden" name="stage" value={stageChoice === "analyzing" ? "" : stageChoice} />

      {/* The manager's intent controls both workflow and cost, so ask it before any data entry. */}
      <div>
        <span className="block text-xs font-semibold text-slate-700 mb-1.5">What are you doing now?</span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="What are you doing now">
          {[
            { key: "analyzing", label: "Evaluate & price", hint: "Research fit and calculate a negotiation range" },
            { key: "contacted", label: "Outreach sent", hint: "Track the conversation; evaluate when they reply" },
            { key: "lead", label: "Save as prospect", hint: "Add to the pipeline without running analysis" },
          ].map((o) => (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={stageChoice === o.key}
              onClick={() => setStageChoice(o.key)}
              className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                stageChoice === o.key
                  ? "border-brand bg-brand/5"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <span className="block text-xs font-semibold text-slate-800">{o.label}</span>
              <span className="block text-[11px] text-slate-500 mt-0.5">{o.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {known && (
        <div className="bg-brand/5 border border-brand/30 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-brand-dark" style={{ fontSize: 16 }}>
              history
            </span>
            <span className="text-sm font-semibold text-slate-900">
              {known.dealCount > 0
                ? `You've worked with ${known.name} ${known.dealCount === 1 ? "once" : `${known.dealCount} times`}`
                : `${known.name} is already in your partners`}
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1 ml-6">
            {known.lastAgreedPrice != null ? (
              <>
                Last time: {money(known.lastAgreedPrice)}
                {known.lastScope ? ` for ${known.lastScope}` : ""}
                {known.lastDealDate ? ` (${known.lastDealDate})` : ""}
                {known.lastActualCpm != null
                  ? ` · delivered at ${moneyCpm(known.lastActualCpm)} CPM`
                  : ""}
                . The Copilot will use this as your anchor.
              </>
            ) : (
              "Their channels and known stats have been filled in below."
            )}
          </p>
          {known.promisedContent > 0 && (
            <p className="text-xs text-slate-600 mt-1 ml-6">
              Delivery record: {known.deliveredContent}/{known.promisedContent} items published
              {known.onTimeRate != null
                ? ` · ${Math.round(known.onTimeRate * 100)}% on time`
                : ""}
              {known.averageRevisionRounds != null
                ? ` · ${known.averageRevisionRounds.toFixed(1)} draft rounds on average`
                : ""}
              .
            </p>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Creator name *{" "}
            {partners.length > 0 && (
              <span className="font-normal text-slate-500">— existing partners autocomplete</span>
            )}
          </label>
          {presetPartner && <input type="hidden" name="partner_id" value={presetPartner.partnerId} />}
          <input
            name="creator"
            list="partner-names"
            defaultValue={presetPartner?.name}
            placeholder="e.g. TechWithMarta"
            className={inputClass}
            required
            onBlur={(e) => recognisePartner(e.target.value)}
            onChange={(e) => {
              // Picking from the datalist fires change, not blur.
              if (partners.some((p) => p.name === e.target.value)) recognisePartner(e.target.value);
            }}
          />
          <datalist id="partner-names">
            {partners.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
          {categories.length > 0 && (
            <label className="block mt-3">
              <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                Category{" "}
                <span className="font-normal text-slate-500">
                  — what their channel is about; Benchmarks groups your real CPM by it
                </span>
              </span>
              <select
                name="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={inputClass}
              >
                <option value="">Not set</option>
                {categoryOptions(categories, known?.category ?? presetPartner?.category).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Platforms * <span className="font-normal text-slate-500">— pick all this deal covers</span>
          </label>
          <div className="flex gap-2 pt-1 flex-wrap">
            {PLATFORMS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => togglePlatform(p.value)}
                className={`text-sm font-semibold px-3.5 py-1.5 rounded-lg border transition-colors ${
                  selected.includes(p.value)
                    ? "border-brand text-brand-dark bg-brand/10"
                    : "border-slate-200 text-slate-500 hover:text-slate-800"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {selected.length > 1 && (
            <label className="block mt-3">
              <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                Report and audience stats belong to
              </span>
              <select
                name="primary_platform"
                value={primaryPlatform}
                onChange={(e) => setPrimaryPlatform(e.target.value)}
                className={inputClass}
              >
                {selected.map((value) => (
                  <option key={value} value={value}>
                    {PLATFORMS.find((p) => p.value === value)?.label ?? value}
                  </option>
                ))}
              </select>
              <span className="block text-xs font-normal text-slate-500 mt-1">
                The channel URL, known views, engagement and uploaded report are never reused
                for the other selected platforms.
              </span>
            </label>
          )}
        </div>
      </div>

      <section className="rounded-lg border border-brand/25 bg-brand/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-dark mb-3">
          Deal essentials
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Campaign{" "}
              <span className="font-normal text-slate-500">
                — sets the outcome this creator will be measured against
              </span>
            </label>
            {campaigns.length > 0 ? (
              <select name="campaign_id" className={inputClass} defaultValue="">
                <option value="">No campaign — use the global Playbook</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}{campaignGoalLabel(campaign) ? ` — ${campaignGoalLabel(campaign)}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input name="campaign" placeholder="e.g. Q3 DACH launch" className={inputClass} />
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Deliverables *{" "}
              <span className="font-normal text-slate-500">— platform, format, and quantity</span>
            </label>
            <input
              name="deliverables"
              placeholder="e.g. 1× YouTube integration + 2× Instagram reels + 1 story"
              className={inputClass}
              required={!isLeadCapture}
            />
            <p className="text-[11px] text-slate-500 mt-1">
              A clear scope prevents price comparisons between unlike packages.
            </p>
          </div>
        </div>
      </section>

      <details className="group border border-slate-200 rounded-lg bg-slate-50/60 px-4 py-3">
        <summary className="cursor-pointer list-none text-xs font-semibold text-slate-700 select-none flex items-center gap-2">
          <span className="text-slate-400 group-open:rotate-90 transition-transform">▸</span>
          Contact &amp; offer overrides
          <span className="font-normal text-slate-500">— your Playbook defaults apply unless set here</span>
        </summary>
        <div className="mt-3 space-y-5">
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          Email{" "}
          <span className="font-normal text-slate-500">
            — saved to the partner, so it&apos;s there for every future deal
          </span>
        </label>
        <input
          name="email"
          type="email"
          defaultValue={presetPartner?.email ?? ""}
          placeholder="creator@example.com"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          Commission{" "}
          <span className="font-normal text-slate-500">
            — CPA paid on top of the fee; the fee itself stays at market rate, and the Copilot checks total cost against your budget caps
          </span>
        </label>
        <div className="flex gap-2">
          <select
            name="commission_type"
            defaultValue={defaultCommissionType}
            className={`${inputClass} w-40`}
          >
            <option value="none">No commission</option>
            <option value="percent">% of order value</option>
            <option value="per_order">$ per order</option>
          </select>
          <input
            name="commission_value"
            type="number"
            min="0"
            step="0.5"
            defaultValue={defaultCommission > 0 ? String(defaultCommission) : ""}
            placeholder="e.g. 10"
            className={`${inputClass} w-32`}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          Audience discount{" "}
          <span className="font-normal text-slate-500">
            — their coupon code; counted in blended AOV, not against this deal
          </span>
        </label>
        <div className="flex gap-2">
          <select
            name="discount_type"
            defaultValue={defaultDiscountType}
            className={`${inputClass} w-40`}
          >
            <option value="none">No discount</option>
            <option value="percent">% off</option>
            <option value="fixed">$ off</option>
          </select>
          <input
            name="discount_value"
            type="number"
            min="0"
            step="0.5"
            defaultValue={defaultDiscount > 0 ? String(defaultDiscount) : ""}
            placeholder="e.g. 20"
            className={`${inputClass} w-32`}
          />
        </div>
      </div>
        </div>
      </details>

      {/* Marked at intake so the price can include them — the analysis prices each as a
          separate line item on top of the base fee, using the Playbook's uplift bands. */}
      <details className="group border border-slate-200 rounded-lg bg-slate-50/60 px-4 py-3">
        <summary className="cursor-pointer list-none text-xs font-semibold text-slate-700 select-none flex items-center gap-2">
          <span className="text-slate-400 group-open:rotate-90 transition-transform">▸</span>
          Rights &amp; extras
          <span className="font-normal text-slate-500">— usage, whitelisting, exclusivity; each is priced on top of the base fee</span>
        </summary>
        <div className="mt-3 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1.5">Usage rights</span>
              <select name="usage_kind" defaultValue="none" className={inputClass}>
                <option value="none">None — their channel only</option>
                <option value="organic">Organic — we may repost it</option>
                <option value="paid">Paid — we may run it as ads</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1.5">Usage duration (months)</span>
              <input name="usage_months" type="number" min="1" max="24" placeholder="e.g. 3" className={inputClass} />
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 py-2">
              <input name="whitelisting" type="checkbox" value="1" className="w-4 h-4 accent-[var(--brand,#0d7a5f)]" />
              Whitelisting — ads through their account
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1.5">Whitelisting duration (months)</span>
              <input name="whitelisting_months" type="number" min="1" max="24" placeholder="e.g. 2" className={inputClass} />
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1.5">Exclusivity</span>
              <select name="exclusivity_kind" defaultValue="none" className={inputClass}>
                <option value="none">None</option>
                <option value="category">Category — no competing brands</option>
                <option value="full">Full — no other sponsors</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1.5">Exclusivity duration (months)</span>
              <input name="exclusivity_months" type="number" min="1" max="24" placeholder="e.g. 3" className={inputClass} />
            </label>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Named competitors{" "}
              <span className="font-normal text-slate-500">
                — a named list is cheaper and clearer than &quot;no competing brands&quot;
              </span>
            </label>
            <input name="exclusivity_scope" type="text" placeholder="e.g. GlocalMe, TravelWifi, Solis" className={inputClass} />
          </div>
        </div>
      </details>

      <details open={!isLeadCapture} className="group border border-slate-200 rounded-lg bg-slate-50/60 px-4 py-3">
        <summary className="cursor-pointer list-none text-xs font-semibold text-slate-700 select-none flex items-center gap-2">
          <span className="text-slate-400 group-open:rotate-90 transition-transform">▸</span>
          Creator evidence
          <span className="font-normal text-slate-500">— add one reliable source for a sharper evaluation</span>
        </summary>
        <div className="mt-4 space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          Analytics report or screenshot{" "}
          <span className="font-normal text-slate-500">— PDF, or a PNG/JPEG screenshot of stats or a rate card (optional)</span>
        </label>
        <label className="flex flex-col items-center justify-center gap-1 border-[1.5px] border-dashed border-slate-300 rounded-lg bg-slate-50 px-6 py-6 text-center cursor-pointer hover:border-brand/60 transition-colors">
          <span className="material-symbols-outlined text-slate-400">upload_file</span>
          <span className="text-sm font-medium text-slate-700">
            {fileName ?? "Drop a PDF or screenshot here, or click to browse"}
          </span>
          <input
            type="file"
            name="report"
            accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
        </label>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          Their message or rate card{" "}
          <span className="font-normal text-slate-500">
            — optional; leave empty if you&apos;re making the first move
          </span>
        </label>
        <textarea
          name="message"
          rows={3}
          placeholder="Hi! My rate for a dedicated integration is…"
          className={`${inputClass} resize-y`}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Channel URL <span className="font-normal text-slate-500">— enables web research</span>
          </label>
          <input
            name="channel_url"
            type="url"
            defaultValue={presetPartner?.channelUrl ?? ""}
            placeholder="https://youtube.com/@channel"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Known avg views <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            name="known_avg_views"
            type="number"
            min="0"
            defaultValue={presetPartner?.avgViews ?? ""}
            placeholder="e.g. 60000"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Known engagement % <span className="font-normal text-slate-500">(optional)</span>
          </label>
          {/* Text, not number: a number input rejects the comma half of Europe types as
              the decimal mark, and step validation rejects two decimals outright. */}
          <input
            name="known_engagement"
            type="text"
            inputMode="decimal"
            defaultValue={presetPartner?.engagementRate ?? ""}
            placeholder="e.g. 11.45"
            className={inputClass}
          />
        </div>
      </div>
        </div>
      </details>

      <button
        type="submit"
        disabled={isPending || selected.length === 0}
        className="w-full bg-brand hover:bg-brand-dark text-white rounded-lg py-2.5 text-sm font-semibold transition-colors shadow-sm disabled:opacity-60"
      >
        {isPending
          ? isLeadCapture
            ? "Adding…"
            : "Creating deal…"
          : isLeadCapture
            ? stageChoice === "contacted" ? "Add contacted deal" : "Add prospect"
            : "Create deal & run analysis"}
      </button>
      <p className="text-xs text-slate-500 text-center">
        {isLeadCapture
          ? "Saved to the pipeline without spending an API call — run the analysis from the deal page when you're ready."
          : "No inputs at all? The analysis will be rough — add a channel URL so Counterpart can research the creator, or fill in known stats."}
      </p>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {warning && <p className="text-xs text-amber-600">{warning}</p>}
    </form>
  );
}
