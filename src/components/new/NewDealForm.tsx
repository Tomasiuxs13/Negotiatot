"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDealAction } from "@/app/new/actions";

const inputClass =
  "w-full border border-slate-200 rounded-lg bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand";

const PLATFORMS = [
  { value: "youtube", label: "YouTube" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
];

export default function NewDealForm({
  campaigns = [],
}: {
  campaigns?: { id: number; name: string }[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(["youtube"]);

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
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Creator name *</label>
          <input name="creator" placeholder="e.g. TechWithMarta" className={inputClass} required />
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
        {isPending ? "Creating deal…" : "Create deal & run analysis"}
      </button>
      <p className="text-xs text-slate-500 text-center">
        No inputs at all? The analysis will be rough — add a channel URL so Counterpart can research
        the creator, or fill in known stats.
      </p>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {warning && <p className="text-xs text-amber-600">{warning}</p>}
    </form>
  );
}
