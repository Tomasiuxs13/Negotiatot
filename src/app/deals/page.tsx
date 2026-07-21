import Link from "next/link";
import PageHeader, { NewDealButton } from "@/components/PageHeader";
import { getDeals } from "@/lib/db";
import { PLATFORM_META, STAGES } from "@/lib/types";
import { euro } from "@/lib/format";

export const dynamic = "force-dynamic";

const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));

export default function DealsPage() {
  const deals = getDeals();

  return (
    <>
      <PageHeader title="Deals" subtitle="All deals across stages" actions={<NewDealButton />} />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <th className="px-4 py-3 font-medium">Creator</th>
                <th className="px-4 py-3 font-medium">Platform</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 font-medium text-right">Their ask</th>
                <th className="px-4 py-3 font-medium text-right">Our offer</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/deals/${d.id}`} className="font-medium text-slate-900 hover:text-brand">
                      {d.creator}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{PLATFORM_META[d.platform].label}</td>
                  <td className="px-4 py-3 text-slate-600">{STAGE_LABEL[d.stage] ?? d.stage}</td>
                  <td className="px-4 py-3 text-right font-tabular">{euro(d.current_ask)}</td>
                  <td className="px-4 py-3 text-right font-tabular">
                    {euro(d.agreed_price ?? d.current_offer)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{d.status_label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
