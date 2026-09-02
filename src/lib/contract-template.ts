import type { Deal } from "./types";
import { parseRights, rightsContractClause } from "./rights";
import type { Commission } from "./commission";
import type { ContentItem, PaymentItem, Shipment } from "./fulfillment-types";
import type { Partner } from "./partners";
import { money } from "./format";
import { PLATFORM_META } from "./types";
import { renderTemplate, type SlotValue } from "./contract-slots";

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
      items.push(`${money(p.amount)} — ${p.description}${paymentCondition(p)}`);
    }
  } else if (agreedPrice != null && agreedPrice > 0) {
    items.push(`Fixed fee: ${money(agreedPrice)}`);
  }

  const commissionText = commissionClause(commission);
  if (commissionText) items.push(commissionText);

  for (const s of shipments) {
    items.push(
      `Gifted product: ${productSummary(s)} — supplied by Brand at no charge to the Creator, for use in the deliverables above.`
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

function paymentCondition(p: PaymentItem): string {
  return p.required_verified != null
    ? ` (payable after ${p.required_verified} deliverables are live and verified)`
    : "";
}

function commissionRate(commission: Commission): string {
  return commission.type === "percent"
    ? `${commission.value}% of net sales`
    : `${money(commission.value)} per order`;
}

function commissionClause(commission: Commission | null): string | null {
  if (!commission || commission.type === "none" || commission.value <= 0) return null;
  return (
    `Commission: ${commissionRate(commission)} attributed to the Creator's tracked link or discount code. ` +
    `Attribution window: ${COMMISSION_ATTRIBUTION_DAYS} days from click. Net sales ` +
    `exclude tax, shipping, refunds and cancellations. Paid monthly in arrears, ` +
    `within 30 days of month end.`
  );
}

function productSummary(s: Pick<Shipment, "product" | "value">): string {
  return `${s.product}${s.value != null && s.value > 0 ? ` (retail value ${money(s.value)})` : ""}`;
}

export interface ContractInputs {
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
  /** Fixed for tests; defaults to today. */
  today?: string;
}

/**
 * Everything a template may say about a deal, computed once. The slot catalog in
 * contract-slots.ts documents each field; the two must agree, and the test suite holds
 * them to it.
 */
export function contractContext(params: ContractInputs): Record<string, SlotValue> {
  const { deal, partner, items, payments, brand } = params;
  const commission =
    params.commission && params.commission.type !== "none" && params.commission.value > 0
      ? params.commission
      : null;
  const shipments = params.shipments ?? [];
  const compensation = compensationClauses({
    agreedPrice: deal.agreed_price,
    payments,
    commission,
    shipments,
  });

  const creatorParty = partner?.company_name
    ? `${partner.company_name}${partner?.legal_name ? `, represented by ${partner.legal_name}` : ""}`
    : partner?.legal_name || deal.creator;

  const scope = deal.deliverables ?? deal.format ?? null;
  const deliverableLines =
    items.length > 0
      ? items.map((c, i) => `  1.${i + 1} ${c.title}${c.due_date ? ` — publish by ${c.due_date}` : ""}`)
      : [`  1.1 ${scope ?? "[deliverables]"}`];

  const platforms = (() => {
    try {
      const list = JSON.parse(deal.platforms ?? "[]") as string[];
      return list.map((p) => PLATFORM_META[p as keyof typeof PLATFORM_META]?.label ?? p);
    } catch {
      return [];
    }
  })();

  return {
    brand: {
      name: brand.brandName || "[Brand legal name]",
      signatory: brand.senderName || "",
      product: brand.productName || "",
    },
    creator: {
      party: creatorParty,
      legalName: partner?.legal_name ?? "",
      companyName: partner?.company_name ?? "",
      handle: deal.creator,
      email: partner?.email ?? "",
      taxId: partner?.tax_id ?? "",
      address: partner?.legal_address || "[to be filled — request via the partner portal]",
    },
    deliverables: {
      lines: deliverableLines.join("\n"),
      text: scope ?? "[deliverables]",
      count: items.length > 0 ? items.length : 0,
      items: items.map((c) => ({
        title: c.title,
        platform: c.platform ?? "",
        dueDate: c.due_date ?? "",
      })),
    },
    platforms: platforms.join(", "),
    compensation: { lines: compensation.lines.join("\n") },
    fee: deal.agreed_price != null && deal.agreed_price > 0 ? money(deal.agreed_price) : "",
    hasFee: compensation.hasCashFee,
    payments: {
      items: payments.map((p) => ({
        amount: money(p.amount),
        description: p.description,
        condition: paymentCondition(p).replace(/^ \(|\)$/g, ""),
      })),
    },
    commission: commission
      ? {
          rate: commissionRate(commission),
          attributionDays: COMMISSION_ATTRIBUTION_DAYS,
          clause: commissionClause(commission) ?? "",
        }
      : null,
    product:
      shipments.length > 0
        ? {
            items: shipments.map((s) => ({
              name: s.product,
              value: s.value != null && s.value > 0 ? money(s.value) : "",
            })),
            summary: shipments.map(productSummary).join(", "),
          }
        : null,
    rights: { clause: rightsContractClause(parseRights(deal.rights)) },
    today: params.today ?? new Date().toISOString().slice(0, 10),
  };
}

/**
 * Counterpart's own agreement, written in the same slot language a company's template
 * uses. That is deliberate: if this vocabulary can express a fee deal, a commission-only
 * deal and a gifted one here, it can express them in someone else's wording too, and a
 * gap in the vocabulary shows up in our template first.
 */
export const DEFAULT_CONTRACT_TEMPLATE = `INFLUENCER COLLABORATION AGREEMENT

Between: {{brand.name}} ("Brand")
And: {{creator.party}} ("Creator"){{#if creator.taxId}} · Tax ID: {{creator.taxId}}{{/if}}
Creator address: {{creator.address}}

1. DELIVERABLES
{{deliverables.lines}}

2. COMPENSATION
{{compensation.lines}}
{{#if hasFee}}
  Payment terms: Net-30 from invoice.
{{/if}}

3. REVIEW & APPROVAL
  Draft submitted at least 10 days before each publish date; Brand responds within
  48 hours; maximum two revision rounds. Content goes live only in its approved form.

4. TRACKING
  All links and codes provided by Brand must be used as supplied.

5. USAGE RIGHTS & EXCLUSIVITY
  {{rights.clause}}

Signed for the Brand: ____________________  Date: ________
Signed by the Creator: ____________________  Date: ________
`;

/**
 * A working draft, not legal advice: generated deterministically from the negotiated
 * terms so it appears instantly, then edited freely in the platform until marked
 * signed. The signed original still arrives through the upload-and-parse flow.
 *
 * `templateBody` is a company's own template in slot form; without one the built-in
 * agreement is used.
 */
export function generateContractText(params: ContractInputs & { templateBody?: string | null }): string {
  const body = params.templateBody?.trim() ? params.templateBody : DEFAULT_CONTRACT_TEMPLATE;
  return renderTemplate(body, contractContext(params)).replace(/\n+$/, "");
}
