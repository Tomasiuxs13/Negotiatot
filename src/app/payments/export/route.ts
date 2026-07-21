import { getAllPaymentItems } from "@/lib/fulfillment";
import { PAYMENT_TRIGGER_LABEL } from "@/lib/fulfillment-types";

/** Escapes a value for CSV: quotes it and doubles any inner quotes. */
function cell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET() {
  const payments = getAllPaymentItems();
  const header = [
    "Partner",
    "Payment",
    "Amount EUR",
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
      p.status,
      p.approved_at ?? "",
      p.paid_at ?? "",
      p.deal_id,
    ]
      .map(cell)
      .join(",")
  );

  const csv = [header.map(cell).join(","), ...rows].join("\n");
  const filename = `counterpart-payments-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
