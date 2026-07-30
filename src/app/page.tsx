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
      value: money(kpis.committed),
      note: `of ${money(kpis.monthlyCap)} this month`,
      noteTone: "text-slate-500",
      href: "/pipeline",
    },
    {
      label: "Owed to creators",
      value: money(outstanding),
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

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="What needs you today"
        actions={<NewDealButton />}
      />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-5xl space-y-6">
          <AttentionPanel items={attention} />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {kpiCards.map((k) => (
              <Link
                key={k.label}
                href={k.href}
                className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm hover:border-slate-300 transition-colors"
              >
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                  {k.label}
                </div>
                <div className="text-2xl font-semibold text-slate-900 font-tabular mt-1">
                  {k.value}
                </div>
                <div className={`text-xs mt-0.5 ${k.noteTone}`}>{k.note}</div>
              </Link>
            ))}
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-headline text-sm font-semibold text-slate-900">Pipeline</h2>
              <Link href="/pipeline" className="text-xs font-medium text-brand-dark hover:underline">
                Open board →
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {counts.map((s) => (
                <Link
                  key={s.key}
                  href={`/pipeline?stage=${s.key}`}
                  className="flex items-baseline gap-2 border border-slate-200 rounded-lg px-3 py-2 hover:border-slate-300 transition-colors"
                >
                  <span className="text-lg font-semibold font-tabular text-slate-900">
                    {s.count}
                  </span>
                  <span className="text-xs text-slate-500">{s.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
