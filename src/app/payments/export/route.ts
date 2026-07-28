import { getAllPaymentItems } from "@/lib/fulfillment";
import { PAYMENT_STATUS_LABEL, PAYMENT_TRIGGER_LABEL } from "@/lib/fulfillment-types";
import { filterPayments } from "@/lib/payment-filters";

/**
 * Escapes a value for CSV: quotes it, doubles inner quotes, and defuses formulas.
 *
 * Partner names and payment descriptions are free text (typed at intake, or parsed out
 * of a contract by the model), and this file is opened in Excel by whoever pays the
 * invoices. A value starting with = + - @ or a tab is a live formula there — a partner
 * named `=HYPERLINK(...)` would execute on the finance machine. A leading apostrophe
 * makes Excel treat it as text; numbers pass through untouched so amounts stay sortable.
 */
function cell(value: unknown): string {
  if (typeof value === "number") return `"${value}"`;
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  // The export answers the same question the screen is showing. Exporting everything
  // while the page displays one month is how the wrong figure reaches accounting.
  const url = new URL(request.url);
  const filters = {
    status: url.searchParams.get("status") ?? "",
    creator: url.searchParams.get("creator") ?? "",
    from: url.searchParams.get("from") ?? "",
    to: url.searchParams.get("to") ?? "",
  };
  const payments = filterPayments(getAllPaymentItems(), filters);

  const header = [
    "Partner",
    "Payment",
    "Amount USD",
    "Trigger",
    "Status",
    "Approved at",
    "Paid at",
    "Deal ID",
  ];

  const rows = payments.map((p) =>
    [
      p.creator,
      p.description,
      p.amount,
      PAYMENT_TRIGGER_LABEL[p.trigger] ?? p.trigger,
      PAYMENT_STATUS_LABEL[p.status] ?? p.status,
      p.approved_at ?? "",
      p.paid_at ?? "",
      p.deal_id,
    ]
      .map(cell)
      .join(",")
  );

  const csv = [header.map(cell).join(","), ...rows].join("\n");

  // Name the file after what's in it, so two exports never look alike on disk.
  const scope = [filters.status, filters.creator, filters.from && `${filters.from}_${filters.to || "on"}`]
    .filter(Boolean)
    .join("-")
    .replace(/[^a-zA-Z0-9_-]/g, "");
  const filename = `counterpart-payments${scope ? `-${scope}` : ""}-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
