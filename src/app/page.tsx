import Link from "next/link";
import PageHeader, { NewDealButton } from "@/components/PageHeader";
import PipelineBoard from "@/components/pipeline/PipelineBoard";
import { getDeals, getPipelineKpis } from "@/lib/db";
import { dealPlatforms } from "@/lib/types";
import { euro, euroCpm } from "@/lib/format";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "", label: "All" },
  { key: "youtube", label: "YouTube" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
];

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string }>;
}) {
  const { platform = "" } = await searchParams;
  const allDeals = getDeals();
  const deals = platform
    ? allDeals.filter((d) => dealPlatforms(d).includes(platform as never))
    : allDeals;
  const kpis = getPipelineKpis();

  return (
    <>
      <PageHeader
        title="Pipeline"
        subtitle="Every deal, its stage, and what needs your attention"
        actions={
          <>
            <div className="flex gap-1.5 mr-2">
              {FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={f.key ? `/?platform=${f.key}` : "/"}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                    platform === f.key
                      ? "bg-slate-900 text-white border-slate-900"
                      : "border-slate-200 text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {f.label}
                </Link>
              ))}
            </div>
            <NewDealButton />
          </>
        }
      />

      <main className="flex-1 overflow-x-auto overflow-y-auto p-8">
        {/* KPI cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm flex flex-col">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
              Active deals
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-semibold text-slate-900 font-tabular">
                {kpis.activeDeals}
              </span>
              {kpis.waitingOnYou > 0 && (
                <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  {kpis.waitingOnYou} waiting on you
                </span>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm flex flex-col">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
              Committed / cap
            </span>
            <div className="flex items-baseline gap-1 mt-1 font-tabular">
              <span className="text-2xl font-semibold text-slate-900">{euro(kpis.committed)}</span>
              <span className="text-sm text-slate-500">/ {euro(kpis.monthlyCap)}</span>
            </div>
          </div>

          <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm flex flex-col">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
              Avg closed CPM
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-semibold text-slate-900 font-tabular">
                {kpis.avgClosedCpm != null ? euroCpm(kpis.avgClosedCpm) : "—"}
              </span>
              <span className="text-xs font-medium text-slate-500">
                target ≤ {euro(kpis.targetCpm)}
              </span>
            </div>
          </div>

          <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm flex flex-col">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
              Saved vs first ask
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-semibold text-emerald-600 font-tabular">
                {euro(kpis.savedVsFirstAsk)}
              </span>
              <span className="text-xs font-medium text-slate-500">this month</span>
            </div>
          </div>
        </div>

        {/* Kanban board — drag cards between stages */}
        <PipelineBoard deals={deals} />
      </main>
    </>
  );
}
