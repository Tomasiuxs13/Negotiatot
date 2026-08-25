import Link from "next/link";
import { groupAttention, type AttentionItem } from "@/lib/attention";
import { money } from "@/lib/format";

const SEVERITY: Record<AttentionItem["severity"], { dot: string; label: string }> = {
  critical: { dot: "bg-red-500", label: "text-red-700" },
  warning: { dot: "bg-amber-400", label: "text-amber-700" },
  info: { dot: "bg-slate-300", label: "text-slate-600" },
};

export default function AttentionPanel({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm px-5 py-4 flex items-center gap-3">
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
  const theirs = items.filter((i) => i.owner === "creator").length;
  const buckets = groupAttention(items);

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <h2 className="font-headline text-sm font-semibold text-slate-900">
          Needs your attention{" "}
          <span className="font-normal text-slate-400 font-tabular">
            {items.length}
            {critical > 0 && <span className="text-red-600"> · {critical} urgent</span>}
          </span>
        </h2>
        {/* Stated once at the top, because "how much of this is even mine" is the first
            thing you want to know when the list is long. */}
        {theirs > 0 && (
          <span className="text-xs text-slate-500 font-tabular">
            {items.length - theirs} to do · {theirs} to chase
          </span>
        )}
      </div>

      <div className="space-y-4">
        {buckets.map((bucket) => (
          <section key={bucket.key}>
            <h3 className="label-caps text-slate-400 mb-1">
              {bucket.label}{" "}
              <span className="font-tabular text-slate-300">{bucket.items.length}</span>
            </h3>
            <div className="divide-y divide-slate-100">
              {bucket.items.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-center gap-3 py-2 group hover:bg-slate-50 -mx-2 px-2 rounded"
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${SEVERITY[item.severity].dot}`}
                  />
                  <span className={`text-sm font-medium ${SEVERITY[item.severity].label}`}>
                    {item.title}
                  </span>
                  {/* Only the chase-them items are marked. Everything else is yours, and
                      labelling the majority case is noise. */}
                  {item.owner === "creator" && (
                    <span className="label-caps text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 shrink-0">
                      chase
                    </span>
                  )}
                  <span className="text-xs text-slate-500 truncate flex-1">{item.detail}</span>
                  {item.amount != null && (
                    <span className="text-sm font-tabular font-semibold text-slate-900">
                      {money(item.amount)}
                    </span>
                  )}
                  <span
                    className="material-symbols-outlined text-slate-300 group-hover:text-slate-500"
                    style={{ fontSize: 16 }}
                  >
                    chevron_right
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
