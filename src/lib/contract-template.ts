import type { Deal } from "./types";
import type { ContentItem, PaymentItem } from "./fulfillment-types";
import type { Partner } from "./partners";
import { money } from "./format";

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
  productOffer?: string;
}): string {
  const { deal, partner, items, payments, brand } = params;
  const creatorParty = partner?.company_name
    ? `${partner.company_name}${partner?.legal_name ? `, represented by ${partner.legal_name}` : ""}`
    : partner?.legal_name || deal.creator;
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
    ...(payments.length > 0
      ? payments.map(
          (p, i) =>
            `  2.${i + 1} ${money(p.amount)} — ${p.description}${
              p.required_verified != null ? ` (payable after ${p.required_verified} deliverables are live and verified)` : ""
            }`
        )
      : deal.agreed_price != null
        ? [`  2.1 Fixed fee: ${money(deal.agreed_price)}`]
        : [`  2.1 [payment schedule]`]),
    `  Payment terms: Net-30 from invoice.`,
    ``,
    `3. REVIEW & APPROVAL`,
    `  Draft submitted at least 10 days before each publish date; Brand responds within`,
    `  48 hours; maximum two revision rounds. Content goes live only in its approved form.`,
    ``,
    `4. TRACKING`,
    `  All links and codes provided by Brand must be used as supplied.`,
    ``,
    `5. USAGE RIGHTS & EXCLUSIVITY`,
    `  [usage rights — e.g. 60 days paid amplification] · [exclusivity — e.g. category, 30 days]`,
    ``,
    `Signed for the Brand: ____________________  Date: ________`,
    `Signed by the Creator: ____________________  Date: ________`,
  ];
  return lines.join("\n");
}
