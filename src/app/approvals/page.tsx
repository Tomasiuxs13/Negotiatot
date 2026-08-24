import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import FilterPills from "@/components/FilterBar";
import {
  APPROVAL_GROUP_LABEL,
  approvalCounts,
  approvalItems,
  type ApprovalGroup,
  type ApprovalItem,
} from "@/lib/approvals";
import { getDeals } from "@/lib/db";
import {
  getAllContentItems,
  getAllContracts,
  getAllPaymentItems,
  getAllShipments,
} from "@/lib/fulfillment";
import { money } from "@/lib/format";
import { PAGE_WIDTH } from "@/lib/layout";

export const dynamic = "force-dynamic";

const GROUPS = Object.keys(APPROVAL_GROUP_LABEL) as ApprovalGroup[];

const GROUP_ICON: Record<ApprovalGroup, string> = {
  content: "movie_edit",
  contracts: "contract_edit",
  money: "approval_delegation",
  setup: "task_alt",
};

const SEVERITY_STYLE: Record<ApprovalItem["severity"], string> = {
  critical: "border-red-200 bg-red-50/50",
  warning: "border-amber-200 bg-amber-50/40",
  info: "border-slate-200 bg-white",
};

const DOT_STYLE: Record<ApprovalItem["severity"], string> = {
  critical: "bg-red-500",
  warning: "bg-amber-400",
  info: "bg-slate-300",
};

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; creator?: string }>;
}) {
  const params = await searchParams;
  const selectedGroup = GROUPS.includes(params.group as ApprovalGroup)
    ? (params.group as ApprovalGroup)
    : "";
  const selectedCreator = params.creator?.trim() ?? "";

  const all = approvalItems({
    deals: getDeals(),
    contentItems: getAllContentItems(),
    contracts: getAllContracts(),
    payments: getAllPaymentItems(),
    shipments: getAllShipments(),
  });
  const counts = approvalCounts(all);
  const creators = [...new Set(all.map((item) => item.creator))].sort((a, b) =>
    a.localeCompare(b)
  );
  const shown = all.filter(
    (item) =>
      (!selectedGroup || item.group === selectedGroup) &&
      (!selectedCreator || item.creator === selectedCreator)
  );
  const urgent = all.filter((item) => item.severity === "critical").length;
  const readyMoney = all
    .filter((item) => item.kind === "payment")
    .reduce((sum, item) => sum + (item.amount ?? 0), 0);

  const href = (changes: { group?: string; creator?: string }) => {
    const query = new URLSearchParams();
    const group = changes.group ?? selectedGroup;
    const creator = changes.creator ?? selectedCreator;
    if (group) query.set("group", group);
    if (creator) query.set("creator", creator);
    return `/approvals${query.size > 0 ? `?${query.toString()}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle="Every decision waiting on you, with the evidence beside it"
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className={`${PAGE_WIDTH} space-y-5`}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {[
              { label: "Waiting for you", value: String(all.length), tone: "text-slate-900" },
              { label: "Urgent", value: String(urgent), tone: urgent ? "text-red-600" : "text-slate-300" },
              { label: "Contracts", value: String(counts.contracts), tone: "text-amber-700" },
              { label: "Money ready", value: readyMoney > 0 ? money(readyMoney) : "—", tone: "text-brand-dark" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  {stat.label}
                </p>
                <p className={`mt-1 text-2xl font-semibold font-tabular ${stat.tone}`}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <FilterPills
              active={selectedGroup}
              href={(group) => href({ group })}
              options={[
                { value: "", label: "All decisions", count: all.length },
                ...GROUPS.map((group) => ({
                  value: group,
                  label: APPROVAL_GROUP_LABEL[group],
                  count: counts[group],
                })),
              ]}
            />
            <form method="get" className="ml-auto flex items-center gap-2">
              {selectedGroup && <input type="hidden" name="group" value={selectedGroup} />}
              <label htmlFor="approval-creator" className="text-xs font-medium text-slate-500">
                Creator
              </label>
              <select
                id="approval-creator"
                name="creator"
                defaultValue={selectedCreator}
                className="max-w-48 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
              >
                <option value="">Everyone</option>
                {creators.map((creator) => (
                  <option key={creator} value={creator}>
                    {creator}
                  </option>
                ))}
              </select>
              <button className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800">
                Apply
              </button>
              {selectedCreator && (
                <Link href={href({ creator: "" })} className="text-xs text-slate-500 hover:text-slate-800">
                  Clear
                </Link>
              )}
            </form>
          </div>

          {shown.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
              <span className="material-symbols-outlined text-emerald-600" style={{ fontSize: 28 }}>
                task_alt
              </span>
              <p className="mt-2 text-sm font-semibold text-slate-800">
                {all.length === 0 ? "Nothing needs approval" : "Nothing matches these filters"}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {all.length === 0
                  ? "Creator follow-ups remain on the Dashboard; this page only shows decisions that are ready for you."
                  : "Clear a filter to see the rest of the decision queue."}
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {GROUPS.filter((group) => shown.some((item) => item.group === group)).map((group) => {
                const groupItems = shown.filter((item) => item.group === group);
                return (
                  <section key={group} aria-labelledby={`approval-${group}`}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 18 }}>
                        {GROUP_ICON[group]}
                      </span>
                      <h2 id={`approval-${group}`} className="text-sm font-semibold text-slate-800">
                        {APPROVAL_GROUP_LABEL[group]}
                      </h2>
                      <span className="text-xs font-tabular text-slate-400">{groupItems.length}</span>
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                      {groupItems.map((item) => (
                        <Link
                          key={item.id}
                          href={item.href}
                          className={`group rounded-lg border p-4 shadow-sm transition-colors hover:border-slate-400 ${SEVERITY_STYLE[item.severity]}`}
                        >
                          <div className="flex items-start gap-3">
                            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_STYLE[item.severity]}`} />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-start justify-between gap-3">
                                <span className="text-sm font-semibold text-slate-900">{item.title}</span>
                                {item.amount != null && (
                                  <span className="shrink-0 text-sm font-semibold font-tabular text-slate-900">
                                    {money(item.amount)}
                                  </span>
                                )}
                              </span>
                              <span className="mt-1 block text-xs leading-5 text-slate-600">
                                {item.detail}
                              </span>
                              <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-dark">
                                {item.actionLabel}
                                <span className="material-symbols-outlined transition-transform group-hover:translate-x-0.5" style={{ fontSize: 15 }}>
                                  arrow_forward
                                </span>
                              </span>
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
