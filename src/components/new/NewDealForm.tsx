"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDealAction, lookupPartnerAction, type PartnerPrefill } from "@/app/new/actions";
import { money, moneyCpm } from "@/lib/format";

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
  presetPartner,
  stage,
  defaultCommission = 0,
  defaultDiscount = 0,
  defaultDiscountType = "none",
}: {
  campaigns?: { id: number; name: string }[];
  partners?: { id: number; name: string }[];
  presetPartner?: { id: number; name: string };
  stage?: string;
  /** Your standard affiliate rate, from the Playbook. */
  defaultCommission?: number;
  /** Your standard audience coupon, from the Playbook. */
  defaultDiscount?: number;
  defaultDiscountType?: string;
}) {
  const isLeadCapture = stage === "lead" || stage === "contacted";
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(["youtube"]);
  const [known, setKnown] = useState<PartnerPrefill | null>(null);

  /**
   * Recognises a returning creator and fills in what we already hold on them, so the
   * second collaboration starts from the record rather than from a blank form.
   */
  const recognisePartner = (name: string) => {
    startTransition(async () => {
      const found = await lookupPartnerAction(name);
      setKnown(found);
      if (found) {
        if (found.platforms.length > 0) setSelected(found.platforms);
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
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value]
    );
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
      {stage && <input type="hidden" name="stage" value={stage} />}

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
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Creator name *{" "}
            {partners.length > 0 && (
              <span className="font-normal text-slate-500">— existing partners autocomplete</span>
            )}
          </label>
          {presetPartner && <input type="hidden" name="partner_id" value={presetPartner.id} />}
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
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Platforms * <span className="font-normal text-slate-500">— pick all this deal covers</span>
          </label>
          <div className="flex gap-2 pt-1">
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
        </div>
      </div>

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
            defaultValue={defaultCommission > 0 ? "percent" : "none"}
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

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          Deliverables <span className="font-normal text-slate-500">— what you want from them</span>
        </label>
        <input
          name="deliverables"
          placeholder="e.g. 1× YouTube integration + 2× Instagram reels + 1 story"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          Campaign{" "}
          <span className="font-normal text-slate-500">
            — its rule overrides apply to this deal
          </span>
        </label>
        {campaigns.length > 0 ? (
          <select name="campaign_id" className={inputClass} defaultValue="">
            <option value="">No campaign — use the global Playbook</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            name="campaign"
            placeholder="e.g. Q3 DACH launch"
            className={inputClass}
          />
        )}
      </div>

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

      <details className="group border border-slate-200 rounded-lg bg-slate-50/60 px-4 py-3">
        <summary className="cursor-pointer list-none text-xs font-semibold text-slate-700 select-none flex items-center gap-2">
          <span className="text-slate-400 group-open:rotate-90 transition-transform">▸</span>
          Their message or rate card
          <span className="font-normal text-slate-500">— paste it if they wrote first</span>
        </summary>
        <div className="mt-3">
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
        </div>
      </details>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Channel URL <span className="font-normal text-slate-500">— enables web research</span>
          </label>
          <input name="channel_url" type="url" placeholder="https://youtube.com/@channel" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Known avg views <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input name="known_avg_views" type="number" min="0" placeholder="e.g. 60000" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Known engagement % <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input name="known_engagement" type="number" min="0" step="0.1" placeholder="e.g. 4.5" className={inputClass} />
        </div>
      </div>

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
            ? `Add ${stage === "contacted" ? "contacted deal" : "lead"}`
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
