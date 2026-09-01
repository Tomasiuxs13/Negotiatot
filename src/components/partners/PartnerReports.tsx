import Link from "next/link";
import type { PartnerReport } from "@/lib/db";

function size(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}

/**
 * The documents this creator's numbers came from.
 *
 * A report used to be read once and discarded, so the evidence behind a price was gone
 * the moment the analysis finished — and the next deal with the same creator began by
 * asking them for it again.
 */
export default function PartnerReports({ reports }: { reports: PartnerReport[] }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
      <h3 className="font-headline text-sm font-semibold text-slate-900">Analytics reports</h3>
      {reports.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">
          Nothing on file yet — a report uploaded on a deal is kept here.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-slate-500">
            {reports.length} document{reports.length === 1 ? "" : "s"}, newest first.
          </p>
          <div className="mt-2 divide-y divide-slate-100">
            {reports.map((report) => (
              <div key={report.id} className="flex items-baseline gap-2 py-2 first:pt-0 last:pb-0">
                <span
                  className="material-symbols-outlined shrink-0 text-slate-400"
                  style={{ fontSize: 16 }}
                  aria-hidden
                >
                  {report.mime.includes("pdf") ? "picture_as_pdf" : "image"}
                </span>
                <a
                  href={`/api/reports/${report.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-xs font-medium text-brand-dark hover:underline"
                  title={report.filename}
                >
                  {report.filename}
                </a>
                <span className="shrink-0 font-data text-[11px] text-slate-400">
                  {report.created_at.slice(0, 10)} · {size(report.bytes)}
                </span>
                {report.deal_id && (
                  <Link
                    href={`/deals/${report.deal_id}`}
                    className="shrink-0 text-[11px] font-medium text-slate-400 hover:text-brand"
                  >
                    deal →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
