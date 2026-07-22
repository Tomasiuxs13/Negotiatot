import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import FilterPills from "@/components/FilterBar";
import PaymentsQueue from "@/components/payments/PaymentsQueue";
import { getAllPaymentItems } from "@/lib/fulfillment";
import { filterPayments, paymentTotals } from "@/lib/payment-filters";
import { PAYMENT_STATUS_LABEL, type PaymentStatus } from "@/lib/fulfillment-types";
import { buildQuery, nextDir, sortBy, type SortDir } from "@/lib/table-sort";
import { euro } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUSES: PaymentStatus[] = ["approvable", "approved", "pending", "paid"];

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    creator?: string;
    from?: string;
    to?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const params = await searchParams;
  const { status = "", creator = "", from = "", to = "", sort = "", dir = "desc" } = params;

  const all = getAllPaymentItems();
  const rows = filterPayments(all, { status, creator, from, to });

  const sorted = sort
    ? sortBy(
        rows,
        (p) =>
          sort === "amount" ? p.amount : sort === "creator" ? p.creator : (p.paid_at ?? p.due_date),
        dir as SortDir
      )
    : rows;

  const totals = paymentTotals(rows);
  const href = (changes: Record<string, string>) =>
    buildQuery("/payments", params as Record<string, string>, changes, { dir: "desc" });

  const creators = [...new Set(all.map((p) => p.creator))].sort((a, b) => a.localeCompare(b));

  const kpis = [
    { label: "Ready to approve", value: euro(totals.approvable), tone: "text-amber-600" },
    { label: "Approved, unpaid", value: euro(totals.approved), tone: "text-sky-600" },
    { label: "Not yet earned", value: euro(totals.pending), tone: "text-slate-900" },
    { label: "Paid", value: euro(totals.paid), tone: "text-emerald-600" },
  ];

  const filtered = Boolean(status || creator || from || to);

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Everything owed across deals"
        actions={
          <Link
            href={buildQuery("/payments/export", params as Record<string, string>, {})}
            prefetch={false}
            className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>
            Export {filtered ? "these" : "CSV"}
          </Link>
        }
      />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-5xl space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map((k) => (
              <div key={k.label} className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                  {k.label}
                </div>
                <div className={`text-xl font-semibold font-tabular mt-1 ${k.tone}`}>{k.value}</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-3 flex items-center gap-3 flex-wrap">
            <FilterPills
              active={status}
              href={(v) => href({ status: v })}
              options={[
                { value: "", label: "All", count: all.length },
                ...STATUSES.map((s) => ({
                  value: s,
                  label: PAYMENT_STATUS_LABEL[s],
                  count: all.filter((p) => p.status === s).length,
                })),
              ]}
            />

            <form className="flex items-center gap-2 ml-auto" method="get">
              {status && <input type="hidden" name="status" value={status} />}
              {sort && <input type="hidden" name="sort" value={sort} />}
              <select
                name="creator"
                defaultValue={creator}
                className="border border-slate-200 rounded-md px-2 py-1.5 text-xs text-slate-700 max-w-40"
              >
                <option value="">All creators</option>
                {creators.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <label className="text-xs text-slate-500">from</label>
              <input
                type="date"
                name="from"
                defaultValue={from}
                className="border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-700"
              />
              <label className="text-xs text-slate-500">to</label>
              <input
                type="date"
                name="to"
                defaultValue={to}
                className="border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-700"
              />
              <button className="text-xs font-medium bg-slate-900 text-white rounded-md px-3 py-1.5 hover:bg-slate-800">
                Apply
              </button>
              {filtered && (
                <Link href="/payments" className="text-xs text-slate-500 hover:text-slate-800">
                  Clear
                </Link>
              )}
            </form>
          </div>

          {filtered && (
            <p className="text-xs text-slate-500">
              Showing {rows.length} of {all.length} payments · {euro(totals.total)} total. The
              export follows this filter.
            </p>
          )}

          <PaymentsQueue
            payments={sorted}
            sort={sort}
            dir={dir as SortDir}
            sortHrefs={{
              creator: href({ sort: "creator", dir: nextDir(sort === "creator", dir as SortDir) }),
              amount: href({ sort: "amount", dir: nextDir(sort === "amount", dir as SortDir) }),
            }}
          />
        </div>
      </main>
    </>
  );
}
