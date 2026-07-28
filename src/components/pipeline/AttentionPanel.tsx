import Link from "next/link";
import type { AttentionItem } from "@/lib/attention";
import { money } from "@/lib/format";

const SEVERITY: Record<AttentionItem["severity"], { dot: string; label: string }> = {
  critical: { dot: "bg-red-500", label: "text-red-700" },
  warning: { dot: "bg-amber-400", label: "text-amber-700" },
  info: { dot: "bg-slate-300", label: "text-slate-600" },
};

export default function AttentionPanel({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm px-5 py-4 mb-6 flex items-center gap-3">
        <span className="material-symbols-outlined text-emerald-600" style={{ fontSize: 18 }}>
          check_circle
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">Nothing needs you right now</p>
          <p className="text-xs text-slate-500">
            No overdue content, stuck shipments, payments to approve, or replies to chase.
          </p>
        </div>
      </div>
    );
  }

  const critical = items.filter((i) => i.severity === "critical").length;

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 mb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-headline text-sm font-semibold text-slate-900">
          Needs your attention{" "}
          <span className="font-normal text-slate-400 font-tabular">
            {items.length}
            {critical > 0 && <span className="text-red-600"> · {critical} urgent</span>}
          </span>
        </h2>
      </div>

      <div className="divide-y divide-slate-100">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="flex items-center gap-3 py-2 group hover:bg-slate-50 -mx-2 px-2 rounded"
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${SEVERITY[item.severity].dot}`} />
            <span className={`text-sm font-medium ${SEVERITY[item.severity].label}`}>
              {item.title}
            </span>
            <span className="text-xs text-slate-500 truncate flex-1">{item.detail}</span>
            {item.amount != null && (
              <span className="text-sm font-tabular font-semibold text-slate-900">
                {money(item.amount)}
              </span>
            )}
            <span className="material-symbols-outlined text-slate-300 group-hover:text-slate-500" style={{ fontSize: 16 }}>
              chevron_right
            </span>
          </Link>
        ))}
      </div>

    </div>
  );
}
