import Link from "next/link";
import { money, moneyCpm } from "@/lib/format";
import { PARTNER_STATUS_LABEL, type PartnerStatus } from "@/lib/partners";
import { STAGE_LABELS, type Stage } from "@/lib/types";

/**
 * Who you are actually negotiating with — the associated-record card the deal page never
 * had. The app knew all of this and showed none of it here: whether you have worked with
 * them before, what you paid last time, whether they delivered on time, and what else is
 * running with them right now.
 *
 * That last one is the expensive omission. Two live deals with one creator is how the
 * same person gets two different offers in a week, and nothing on this page mentioned it.
 */
export default function DealPartnerCard({
  partnerId,
  name,
  category,
  email,
  status,
  priorCount,
  lastAgreedPrice,
  lastDealDate,
  lastActualCpm,
  onTimeRate,
  promisedContent,
  deliveredContent,
  otherLive,
}: {
  partnerId: number;
  name: string;
  category: string | null;
  email: string | null;
  status: PartnerStatus;
  priorCount: number;
  lastAgreedPrice: number | null;
  lastDealDate: string | null;
  lastActualCpm: number | null;
  onTimeRate: number | null;
  promisedContent: number;
  deliveredContent: number;
  otherLive: { id: number; stage: Stage; label: string | null }[];
}) {
  const facts: { label: string; value: string; tone?: string }[] = [];
  if (lastAgreedPrice != null) {
    facts.push({
      label: "Last agreed",
      value: money(lastAgreedPrice) + (lastDealDate ? ` · ${lastDealDate}` : ""),
    });
  }
  if (lastActualCpm != null) {
    facts.push({ label: "Their real CPM", value: moneyCpm(lastActualCpm) });
  }
  if (onTimeRate != null) {
    facts.push({
      label: "Delivered on time",
      value: `${Math.round(onTimeRate * 100)}%`,
      tone: onTimeRate >= 0.8 ? "text-emerald-600" : "text-amber-600",
    });
  }
  if (promisedContent > 0) {
    facts.push({ label: "Content delivered", value: `${deliveredContent}/${promisedContent}` });
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="font-headline text-sm font-semibold text-slate-900">Creator</h3>
        <Link
          href={`/partners/${partnerId}`}
          className="text-xs font-medium text-brand-dark hover:underline"
        >
          Profile →
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold text-slate-900">{name}</span>
        <span className="text-[11px] font-medium bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
          {PARTNER_STATUS_LABEL[status]}
        </span>
        {category && (
          <span className="text-[11px] font-semibold bg-brand-soft text-brand-dark rounded-full px-2 py-0.5">
            {category}
          </span>
        )}
      </div>
      {email && (
        <a
          href={`mailto:${email}`}
          className="mt-1 block truncate text-xs text-slate-500 hover:text-brand"
          title={email}
        >
          {email}
        </a>
      )}

      {/* History earns its place by changing the next offer: what you paid before is the
          number this creator will expect again. */}
      <p className="mt-2.5 text-xs text-slate-500">
        {priorCount === 0
          ? "First collaboration — no history to price against."
          : `${priorCount} previous deal${priorCount === 1 ? "" : "s"}`}
      </p>
      {facts.length > 0 && (
        <div className="mt-1.5 divide-y divide-slate-100">
          {facts.map((f) => (
            <div key={f.label} className="flex items-baseline justify-between gap-2 py-1.5 text-xs">
              <span className="text-slate-500">{f.label}</span>
              <span className={`font-data font-semibold ${f.tone ?? "text-slate-900"}`}>
                {f.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {otherLive.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <p className="text-[11px] font-bold text-amber-700 mb-1">
            Also live with {name}
          </p>
          <div className="space-y-1">
            {otherLive.map((d) => (
              <Link
                key={d.id}
                href={`/deals/${d.id}`}
                className="block text-xs text-slate-700 hover:text-brand truncate"
              >
                {STAGE_LABELS[d.stage]}
                {d.label ? ` · ${d.label}` : ""}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
