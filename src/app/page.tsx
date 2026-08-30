import Link from "next/link";
import PageHeader, { NewDealButton } from "@/components/PageHeader";
import AttentionPanel from "@/components/pipeline/AttentionPanel";
import { getDeals, getFollowUpMessages, getFollowUpStates, getOpenReminders, getPipelineKpis, getSetting } from "@/lib/db";
import type { MeasurementWindows } from "@/lib/measurement";
import { attentionItems } from "@/lib/attention";
import { getFollowUpCandidates } from "@/lib/followups";
import {
  getAllContentItems,
  getAllContracts,
  getAllOnboardingTasks,
  getAllPaymentItems,
  getAllShipments,
} from "@/lib/fulfillment";
import { STAGES, TERMINAL_STAGES, type Message } from "@/lib/types";
import { money, moneyCpm } from "@/lib/format";
import { PAGE_WIDTH } from "@/lib/layout";
import { DEAL_STAGE_TONE } from "@/lib/status-tones";

export const dynamic = "force-dynamic";

/** "2h ago" — when scanning what just moved, elapsed time beats a timestamp. */
function ago(stamp: string): string {
  const then = new Date(stamp.replace(" ", "T") + "Z").getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export default function DashboardPage() {
  const deals = getDeals();
  const payments = getAllPaymentItems();
  const kpis = getPipelineKpis();
  const messagesByDeal = new Map<number, Message[]>();
  for (const message of getFollowUpMessages()) {
    const thread = messagesByDeal.get(message.deal_id);
    if (thread) thread.push(message);
    else messagesByDeal.set(message.deal_id, [message]);
  }
  const followUps = getFollowUpCandidates(
    deals,
    messagesByDeal,
    new Map(getFollowUpStates().map((state) => [state.deal_id, state]))
  );
  const attention = attentionItems({
    deals,
    contentItems: getAllContentItems(),
    shipments: getAllShipments(),
    payments,
    onboarding: getAllOnboardingTasks(),
    contracts: getAllContracts(),
    reminders: getOpenReminders(),
    followUps,
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
      label: "Committed",
      // money(0) reads "$0" — a real, calm answer. The em-dash it replaced looked like
      // a rendering failure on every fresh month.
      value: money(kpis.committed),
      note: `of ${money(kpis.monthlyCap)} this month`,
      noteTone: "text-slate-500",
      href: "/pipeline",
    },
    {
      label: "Owed to creators",
      value: money(outstanding),
      note: toApprove.length > 0 ? `${toApprove.length} ready to approve` : "nothing to approve",
      noteTone: toApprove.length > 0 ? "text-amber-600" : "text-slate-500",
      href: "/payments",
    },
    {
      label: "Avg closed CPM",
      // The only genuine unknown: with no closed deals there IS no average yet.
      value: kpis.avgClosedCpm != null ? moneyCpm(kpis.avgClosedCpm) : "—",
      note:
        kpis.avgClosedCpm != null
          ? `target ≤ ${money(kpis.targetCpm)}`
          : `no closed deals yet · target ≤ ${money(kpis.targetCpm)}`,
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
        subtitle="Your priorities, performance, and pipeline at a glance"
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
                className="bg-white rounded-lg p-5 border border-slate-200 hover:border-brand/40 transition-colors group"
              >
                <div className="label-caps text-slate-500 group-hover:text-brand-dark transition-colors">
                  {k.label}
                </div>
                <div className="stat-value text-slate-900 mt-2">{k.value}</div>
                <div className={`text-xs mt-1.5 ${k.noteTone}`}>{k.note}</div>
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
                          <span className="block text-xs text-slate-400 font-data">
                            {ago(d.updated_at!)}
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
                    className={`stat-value ${s.count > 0 ? "text-slate-900" : "text-slate-300"}`}
                  >
                    {s.count}
                  </div>
                  <div className="label-caps text-slate-500 mt-1 mb-2">{s.label}</div>
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
