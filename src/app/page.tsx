import Link from "next/link";
import PageHeader, { NewDealButton } from "@/components/PageHeader";
import AttentionPanel from "@/components/pipeline/AttentionPanel";
import { getDeals, getOpenReminders, getPipelineKpis, getSetting } from "@/lib/db";
import type { MeasurementWindows } from "@/lib/measurement";
import { attentionItems } from "@/lib/attention";
import {
  getAllContentItems,
  getAllOnboardingTasks,
  getAllPaymentItems,
  getAllShipments,
} from "@/lib/fulfillment";
import { STAGES, TERMINAL_STAGES } from "@/lib/types";
import { money, moneyCpm } from "@/lib/format";
import { PAGE_WIDTH } from "@/lib/layout";
import { DEAL_STAGE_TONE } from "@/lib/status-tones";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const deals = getDeals();
  const payments = getAllPaymentItems();
  const kpis = getPipelineKpis();
  const attention = attentionItems({
    deals,
    contentItems: getAllContentItems(),
    shipments: getAllShipments(),
    payments,
    onboarding: getAllOnboardingTasks(),
    reminders: getOpenReminders(),
    draftLeadDays: Number(getSetting<Record<string, number>>("workflow")?.draftLeadDays ?? 10),
    windows: getSetting<MeasurementWindows>("measurement_windows") ?? {},
  });

  const outstanding = payments
    .filter((p) => p.status !== "paid")
    .reduce((sum, p) => sum + p.amount, 0);
  const toApprove = payments.filter((p) => p.status === "approvable");

  const kpiCards = [
    {
      label: "Active deals",
      value: String(kpis.activeDeals),
      note:
        kpis.waitingOnYou > 0
          ? `${kpis.waitingOnYou} waiting on you`
          : "none waiting on you",
      noteTone: kpis.waitingOnYou > 0 ? "text-amber-600" : "text-slate-500",
      href: "/pipeline",
    },
    {
      label: "Committed / cap",
      value: kpis.committed > 0 ? money(kpis.committed) : "—",
      note:
        kpis.committed > 0
          ? `of ${money(kpis.monthlyCap)} this month`
          : `nothing committed yet · cap ${money(kpis.monthlyCap)}`,
      noteTone: "text-slate-500",
      href: "/pipeline",
    },
    {
      label: "Owed to creators",
      value: outstanding > 0 ? money(outstanding) : "—",
      note:
        toApprove.length > 0
          ? `${toApprove.length} ready to approve`
          : "nothing to approve",
      noteTone: toApprove.length > 0 ? "text-amber-600" : "text-slate-500",
      href: "/payments",
    },
    {
      label: "Avg closed CPM",
      value: kpis.avgClosedCpm != null ? moneyCpm(kpis.avgClosedCpm) : "—",
      note: `target ≤ ${money(kpis.targetCpm)}`,
      noteTone: "text-slate-500",
      href: "/benchmarks",
    },
  ];

  // Stage counts, so the dashboard hints at the board without duplicating it.
  const boardStages = STAGES.filter((s) => !TERMINAL_STAGES.includes(s.key));
  const counts = boardStages.map((s) => ({
    ...s,
    count: deals.filter((d) => d.stage === s.key).length,
  }));

  // The right rail. Reminders deliberately aren't repeated here — they already surface
  // in "Needs your attention" — so this shows what actually moved, from the deals'
  // own updated_at rather than a separate activity log the app doesn't keep.
  const recent = [...deals]
    .filter((d) => d.updated_at)
    .sort((a, b) => (a.updated_at! < b.updated_at! ? 1 : -1))
    .slice(0, 6);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="What needs you today"
        actions={<NewDealButton />}
      />
      <main className="flex-1 overflow-y-auto p-8">
        <div className={`${PAGE_WIDTH} space-y-6`}>
          {/* KPIs lead: four equal columns across the full width, so the numbers get
              room instead of being quarter-width cards beside empty space. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {kpiCards.map((k) => (
              <Link
                key={k.label}
                href={k.href}
                className="bg-white rounded-lg p-5 border border-slate-200 shadow-sm hover:border-slate-300 transition-colors"
              >
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                  {k.label}
                </div>
                <div className="text-3xl font-semibold text-slate-900 font-tabular mt-2">
                  {k.value}
                </div>
                <div className={`text-xs mt-1 ${k.noteTone}`}>{k.note}</div>
              </Link>
            ))}
          </div>

          {/* The work split: what needs doing on the left, what just happened on the
              right. Previously both were full-width bands stacked down a narrow column. */}
          <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-6 items-start">
            <AttentionPanel items={attention} />

            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
              <h2 className="font-headline text-sm font-semibold text-slate-900 mb-3">
                Recent activity
              </h2>
              {recent.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Nothing yet — activity appears as deals are analyzed and negotiated.
                </p>
              ) : (
                <ol className="space-y-3">
                  {recent.map((d) => (
                    <li key={d.id}>
                      <Link href={`/deals/${d.id}`} className="flex gap-3 group">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${
                            DEAL_STAGE_TONE[d.stage] === "action"
                              ? "bg-amber-400"
                              : DEAL_STAGE_TONE[d.stage] === "done"
                                ? "bg-emerald-500"
                                : DEAL_STAGE_TONE[d.stage] === "problem"
                                  ? "bg-red-500"
                                  : DEAL_STAGE_TONE[d.stage] === "active"
                                    ? "bg-sky-500"
                                    : "bg-slate-300"
                          }`}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm text-slate-900 group-hover:text-brand truncate">
                            <span className="font-medium">{d.status_label ?? "Updated"}</span>
                            <span className="text-slate-500"> · {d.creator}</span>
                          </span>
                          <span className="block text-xs text-slate-400 font-tabular">
                            {d.updated_at?.slice(0, 16).replace("T", " ")}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          {/* Pipeline: counters spread evenly across the whole width with a tone bar
              under each, rather than small pills bunched at the left edge. */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-headline text-sm font-semibold text-slate-900">Pipeline</h2>
              <Link href="/pipeline" className="text-xs font-medium text-brand-dark hover:underline">
                Open board →
              </Link>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
              {counts.map((s) => (
                <Link
                  key={s.key}
                  href={`/pipeline?stage=${s.key}`}
                  className="group"
                  aria-label={`${s.count} deals in ${s.label}`}
                >
                  <div
                    className={`text-3xl font-semibold font-tabular ${
                      s.count > 0 ? "text-slate-900" : "text-slate-300"
                    }`}
                  >
                    {s.count}
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500 mt-1 mb-2">
                    {s.label}
                  </div>
                  <div
                    className={`h-1 rounded-full transition-colors ${
                      s.count === 0
                        ? "bg-slate-100"
                        : DEAL_STAGE_TONE[s.key] === "action"
                          ? "bg-amber-400"
                          : DEAL_STAGE_TONE[s.key] === "done"
                            ? "bg-emerald-500"
                            : DEAL_STAGE_TONE[s.key] === "active"
                              ? "bg-sky-500"
                              : "bg-slate-300"
                    }`}
                  />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
