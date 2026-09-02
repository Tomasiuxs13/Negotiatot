import type { Deal } from "./types";
import { parseRights, rightsContractClause } from "./rights";
import type { Commission } from "./commission";
import type { ContentItem, PaymentItem, Shipment } from "./fulfillment-types";
import type { Partner } from "./partners";
import { money } from "./format";

/**
 * Attribution and payout terms for commission. Written down here rather than left to
 * the draft's reader, because "10% commission" without a window, a basis and a payout
 * date is the clause that gets argued about after the content is already live.
 */
export const COMMISSION_ATTRIBUTION_DAYS = 30;

/**
 * The compensation clause, built from everything the creator actually receives.
 *
 * A gifted or commission-only deal used to fall through every branch here and print
 * "[payment schedule]" — a contract that named no money at all for the one deal shape
 * where the creator's entire upside lives outside the fee. Commission and gifted
 * product are therefore first-class lines, and the absence of a fee is stated rather
 * than left as a gap someone has to notice.
 */
export function compensationClauses(params: {
  agreedPrice: number | null;
  payments: PaymentItem[];
  commission: Commission | null;
  shipments: Pick<Shipment, "product" | "value">[];
}): { lines: string[]; hasCashFee: boolean } {
  const { agreedPrice, payments, commission, shipments } = params;
  const items: string[] = [];

  const hasCashFee = payments.length > 0 || (agreedPrice != null && agreedPrice > 0);
  if (payments.length > 0) {
    for (const p of payments) {
      items.push(
        `${money(p.amount)} — ${p.description}${
          p.required_verified != null
            ? ` (payable after ${p.required_verified} deliverables are live and verified)`
            : ""
        }`
      );
    }
  } else if (agreedPrice != null && agreedPrice > 0) {
    items.push(`Fixed fee: ${money(agreedPrice)}`);
  }

  if (commission && commission.type !== "none" && commission.value > 0) {
    const rate =
      commission.type === "percent"
        ? `${commission.value}% of net sales`
        : `${money(commission.value)} per order`;
    items.push(
      `Commission: ${rate} attributed to the Creator's tracked link or discount code. ` +
        `Attribution window: ${COMMISSION_ATTRIBUTION_DAYS} days from click. Net sales ` +
        `exclude tax, shipping, refunds and cancellations. Paid monthly in arrears, ` +
        `within 30 days of month end.`
    );
  }

  for (const s of shipments) {
    items.push(
      `Gifted product: ${s.product}${
        s.value != null && s.value > 0 ? ` (retail value ${money(s.value)})` : ""
      } — supplied by Brand at no charge to the Creator, for use in the deliverables above.`
    );
  }

  // Silence is how a commission-only deal ends up looking like an oversight. Say it.
  if (!hasCashFee && items.length > 0) {
    items.unshift(
      `No fixed fee. The Creator's compensation is set out below and is earned on performance.`
    );
  }
  if (items.length === 0) items.push(`[compensation to be agreed]`);

  return { lines: items.map((t, i) => `  2.${i + 1} ${t}`), hasCashFee };
}

/**
 * A working draft, not legal advice: generated deterministically from the negotiated
 * terms so it appears instantly, then edited freely in the platform until marked
 * signed. The signed original still arrives through the upload-and-parse flow.
 */
export function generateContractText(params: {
  deal: Deal;
  partner: Partner | null;
  items: ContentItem[];
  payments: PaymentItem[];
  brand: Record<string, string>;
  /**
   * The commission actually in play — the deal's own terms if it has any, else the
   * Playbook's standard offer. Resolved by the caller (`resolveOffer`) so this stays a
   * pure template and so the contract cannot promise a rate the pricing never used.
   */
  commission?: Commission | null;
  /** Product being sent, so a gifted deal states what the creator receives. */
  shipments?: Pick<Shipment, "product" | "value">[];
}): string {
  const { deal, partner, items, payments, brand } = params;
  const creatorParty = partner?.company_name
    ? `${partner.company_name}${partner?.legal_name ? `, represented by ${partner.legal_name}` : ""}`
    : partner?.legal_name || deal.creator;
  const compensation = compensationClauses({
    agreedPrice: deal.agreed_price,
    payments,
    commission: params.commission ?? null,
    shipments: params.shipments ?? [],
  });
  const lines: string[] = [
    `INFLUENCER COLLABORATION AGREEMENT`,
    ``,
    `Between: ${brand.brandName || "[Brand legal name]"} ("Brand")`,
    `And: ${creatorParty} ("Creator")${partner?.tax_id ? ` · Tax ID: ${partner.tax_id}` : ""}`,
    partner?.legal_address ? `Creator address: ${partner.legal_address}` : `Creator address: [to be filled — request via the partner portal]`,
    ``,
    `1. DELIVERABLES`,
    ...(items.length > 0
      ? items.map((c, i) => `  1.${i + 1} ${c.title}${c.due_date ? ` — publish by ${c.due_date}` : ""}`)
      : [`  1.1 ${deal.deliverables ?? deal.format ?? "[deliverables]"}`]),
    ``,
    `2. COMPENSATION`,
    ...compensation.lines,
    // Net-30 from invoice describes a cash fee. On a commission-only deal there is no
    // invoice to count from, and the payout date is already in the commission clause.
    ...(compensation.hasCashFee ? [`  Payment terms: Net-30 from invoice.`] : []),
    ``,
    `3. REVIEW & APPROVAL`,
    `  Draft submitted at least 10 days before each publish date; Brand responds within`,
    `  48 hours; maximum two revision rounds. Content goes live only in its approved form.`,
    ``,
    `4. TRACKING`,
    `  All links and codes provided by Brand must be used as supplied.`,
    ``,
    `5. USAGE RIGHTS & EXCLUSIVITY`,
    `  ${rightsContractClause(parseRights(deal.rights))}`,
    ``,
    `Signed for the Brand: ____________________  Date: ________`,
    `Signed by the Creator: ____________________  Date: ________`,
  ];
  return lines.join("\n");
}
