import { PARTNER_STATUS_LABEL, type PartnerStatus } from "@/lib/partners";

const TONE: Record<PartnerStatus, string> = {
  prospect: "bg-slate-100 text-slate-600",
  negotiating: "bg-amber-50 text-amber-700",
  delivering: "bg-emerald-50 text-emerald-700",
  past: "bg-sky-50 text-sky-700",
  lapsed: "bg-slate-100 text-slate-400",
};

/** Derived from the deals, so it can't fall out of date the way a manual field would. */
export default function PartnerStatusPill({ status }: { status: PartnerStatus }) {
  return (
    <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${TONE[status]}`}>
      {PARTNER_STATUS_LABEL[status]}
    </span>
  );
}
