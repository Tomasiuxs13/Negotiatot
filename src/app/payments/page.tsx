import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import PaymentsQueue from "@/components/payments/PaymentsQueue";
import { getAllPaymentItems } from "@/lib/fulfillment";
import { euro } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function PaymentsPage() {
  const payments = getAllPaymentItems();

  const sum = (status: string) =>
    payments.filter((p) => p.status === status).reduce((s, p) => s + p.amount, 0);

  const kpis = [
    { label: "Ready to approve", value: euro(sum("approvable")), tone: "text-amber-600" },
    { label: "Approved, unpaid", value: euro(sum("approved")), tone: "text-sky-600" },
    { label: "Not yet earned", value: euro(sum("pending")), tone: "text-slate-900" },
    { label: "Paid", value: euro(sum("paid")), tone: "text-emerald-600" },
  ];

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Everything owed across deals — approvable only once the content is verified"
        actions={
          <Link
            href="/payments/export"
            prefetch={false}
            className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>
            Export CSV
          </Link>
        }
      />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="grid grid-cols-4 gap-4 mb-6 max-w-4xl">
          {kpis.map((k) => (
            <div key={k.label} className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                {k.label}
              </div>
              <div className={`text-xl font-semibold font-tabular mt-1 ${k.tone}`}>{k.value}</div>
            </div>
          ))}
        </div>

        <PaymentsQueue payments={payments} />
      </main>
    </>
  );
}
