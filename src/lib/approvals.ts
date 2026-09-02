import type { Deal } from "./types";
import { isDeliveringStage, isWonStage } from "./types";
import type {
  ContentItem,
  Contract,
  ParsedTerms,
  PaymentItem,
  Shipment,
} from "./fulfillment-types";
import { canCompleteDeal } from "./lifecycle";
import { parseRights, rightsMismatch } from "./rights";
import { daysToPublish } from "./timeline";

export type ApprovalGroup = "content" | "contracts" | "money" | "setup";
export type ApprovalKind =
  | "draft"
  | "date_change"
  | "contract"
  | "payment"
  | "setup"
  | "completion";
export type ApprovalSeverity = "critical" | "warning" | "info";

export const APPROVAL_GROUP_LABEL: Record<ApprovalGroup, string> = {
  content: "Content",
  contracts: "Contracts",
  money: "Money",
  setup: "Setup & completion",
};

export interface ApprovalItem {
  id: string;
  kind: ApprovalKind;
  group: ApprovalGroup;
  severity: ApprovalSeverity;
  creator: string;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  amount?: number;
  createdAt?: string | null;
}

export interface ApprovalInput {
  deals: Deal[];
  contentItems: ContentItem[];
  contracts: Contract[];
  payments: PaymentItem[];
  shipments: Shipment[];
  today?: string;
}

const GROUP_ORDER: ApprovalGroup[] = ["content", "contracts", "money", "setup"];
const SEVERITY_ORDER: Record<ApprovalSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function possessive(name: string): string {
  return `${name}${/s$/i.test(name) ? "’" : "’s"}`;
}

function parsedTerms(raw: string | null | undefined): ParsedTerms | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ParsedTerms;
    return parsed && Array.isArray(parsed.deliverables) && Array.isArray(parsed.payments)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/**
 * The latest uploaded contract is the active source. Older uploads remain history and
 * must never create duplicate approval work.
 */
function latestContracts(contracts: Contract[]): Map<number, Contract> {
  const byDeal = new Map<number, Contract>();
  for (const contract of contracts) {
    const current = byDeal.get(contract.deal_id);
    if (!current || contract.id > current.id) byDeal.set(contract.deal_id, contract);
  }
  return byDeal;
}

/**
 * Manager decisions only. Chasing a draft that has not arrived stays on the Dashboard;
 * once evidence is ready and a judgement is needed, it appears here.
 */
export function approvalItems({
  deals,
  contentItems,
  contracts,
  payments,
  shipments,
  today = new Date().toISOString().slice(0, 10),
}: ApprovalInput): ApprovalItem[] {
  const items: ApprovalItem[] = [];
  const dealById = new Map(deals.map((deal) => [deal.id, deal]));
  const contractByDeal = latestContracts(contracts);
  const contentByDeal = new Map<number, ContentItem[]>();
  const paymentsByDeal = new Map<number, PaymentItem[]>();
  const shipmentsByDeal = new Map<number, Shipment[]>();

  for (const content of contentItems) {
    const rows = contentByDeal.get(content.deal_id) ?? [];
    rows.push(content);
    contentByDeal.set(content.deal_id, rows);
  }
  for (const payment of payments) {
    const rows = paymentsByDeal.get(payment.deal_id) ?? [];
    rows.push(payment);
    paymentsByDeal.set(payment.deal_id, rows);
  }
  for (const shipment of shipments) {
    const rows = shipmentsByDeal.get(shipment.deal_id) ?? [];
    rows.push(shipment);
    shipmentsByDeal.set(shipment.deal_id, rows);
  }

  for (const content of contentItems) {
    const deal = dealById.get(content.deal_id);
    if (!deal || !isWonStage(deal.stage)) continue;

    if (content.status === "submitted") {
      const days = content.due_date ? daysToPublish(content.due_date, today) : null;
      items.push({
        id: `draft-${content.id}`,
        kind: "draft",
        group: "content",
        severity: days != null && days <= 5 ? "critical" : "warning",
        creator: deal.creator,
        title: `Review ${possessive(deal.creator)} draft`,
        detail:
          `${content.title}${(content.revision_round ?? 0) > 1 ? ` · revision ${content.revision_round}` : ""}` +
          (content.due_date ? ` · publishes ${content.due_date}` : ""),
        href: `/deals/${deal.id}?tab=fulfillment#content-${content.id}`,
        actionLabel: "Review draft",
        createdAt: content.draft_submitted_at,
      });
    }

    if (content.requested_due_date) {
      items.push({
        id: `date-change-${content.id}`,
        kind: "date_change",
        group: "content",
        severity: "warning",
        creator: deal.creator,
        title: `Decide ${possessive(deal.creator)} date request`,
        detail:
          `${content.title}: ${content.due_date ?? "no current date"} → ${content.requested_due_date}` +
          (content.due_date_request_reason ? ` · ${content.due_date_request_reason}` : ""),
        href: `/deals/${deal.id}?tab=fulfillment#content-${content.id}`,
        actionLabel: "Approve or keep date",
        createdAt: content.due_date_requested_at,
      });
    }
  }

  for (const payment of payments) {
    if (payment.status !== "approvable") continue;
    const deal = dealById.get(payment.deal_id);
    if (!deal || !isDeliveringStage(deal.stage)) continue;
    items.push({
      id: `payment-${payment.id}`,
      kind: "payment",
      group: "money",
      severity: "warning",
      creator: deal.creator,
      title: `Approve ${possessive(deal.creator)} payment`,
      detail: payment.description,
      href: `/deals/${deal.id}?tab=fulfillment#payment-${payment.id}`,
      actionLabel: "Review payment",
      amount: payment.amount,
      createdAt: payment.created_at,
    });
  }

  for (const deal of deals) {
    if (!isDeliveringStage(deal.stage)) continue;
    const dealContent = contentByDeal.get(deal.id) ?? [];
    const dealPayments = paymentsByDeal.get(deal.id) ?? [];
    const dealShipments = shipmentsByDeal.get(deal.id) ?? [];
    const contract = contractByDeal.get(deal.id);
    const terms = parsedTerms(contract?.parsed_terms);
    const mismatch = terms
      ? rightsMismatch(parseRights(deal.rights), terms)
      : [];

    if (contract?.status === "parsed") {
      items.push({
        id: `contract-${contract.id}`,
        kind: "contract",
        group: "contracts",
        severity: mismatch.length > 0 ? "critical" : "warning",
        creator: deal.creator,
        title:
          mismatch.length > 0
            ? `Resolve ${possessive(deal.creator)} contract mismatch`
            : `Confirm ${possessive(deal.creator)} signed contract`,
        detail:
          mismatch.length > 0
            ? `${mismatch.length} pricing/right${mismatch.length === 1 ? "" : "s"} discrepancy` +
              ` · ${mismatch[0]}`
            : `${contract.filename} has been parsed and is ready for source confirmation`,
        href: `/deals/${deal.id}?tab=fulfillment#paperwork`,
        actionLabel: "Review extracted terms",
        createdAt: contract.created_at,
      });
    } else if (contract?.status === "uploaded") {
      items.push({
        id: `contract-${contract.id}`,
        kind: "contract",
        group: "contracts",
        severity: "warning",
        creator: deal.creator,
        title: `Review ${possessive(deal.creator)} contract manually`,
        detail: contract.parse_error ?? `${contract.filename} still needs its terms entered`,
        href: `/deals/${deal.id}?tab=fulfillment#paperwork`,
        actionLabel: "Enter contract terms",
        createdAt: contract.created_at,
      });
    } else if (contract?.status === "confirmed" && mismatch.length > 0) {
      items.push({
        id: `contract-mismatch-${contract.id}`,
        kind: "contract",
        group: "contracts",
        severity: "critical",
        creator: deal.creator,
        title: `Resolve ${possessive(deal.creator)} contract mismatch`,
        detail: `${mismatch.length} pricing/right${mismatch.length === 1 ? "" : "s"} discrepancy · ${mismatch[0]}`,
        href: `/deals/${deal.id}?tab=fulfillment#paperwork`,
        actionLabel: "Review contract and pricing",
        createdAt: contract.created_at,
      });
    }

    // Do not repeat an actionable contract review as a generic setup gap. Other missing
    // records remain one consolidated exception for this collaboration.
    const missing: string[] = [];
    if (!contract) missing.push("signed contract");
    if (dealContent.length === 0) missing.push("content plan");
    if ((deal.agreed_price ?? deal.current_offer ?? 0) > 0 && dealPayments.length === 0) {
      missing.push("payment schedule");
    }
    if (missing.length > 0) {
      items.push({
        id: `setup-${deal.id}`,
        kind: "setup",
        group: "setup",
        severity: "warning",
        creator: deal.creator,
        title: `Finish ${possessive(deal.creator)} agreement setup`,
        detail: `Missing ${missing.join(", ")}`,
        href: `/deals/${deal.id}?tab=fulfillment#setup-content`,
        actionLabel: "Complete setup",
        createdAt: deal.agreed_at ?? deal.updated_at,
      });
    }

    const completion = canCompleteDeal({
      currentStage: deal.stage,
      content: dealContent,
      payments: dealPayments,
      shipments: dealShipments,
    });
    if (missing.length === 0 && completion.ok) {
      items.push({
        id: `completion-${deal.id}`,
        kind: "completion",
        group: "setup",
        severity: "info",
        creator: deal.creator,
        title: `Close ${possessive(deal.creator)} completed collaboration`,
        detail: "All tracked content, payments and shipments are complete",
        href: `/deals/${deal.id}?tab=fulfillment`,
        actionLabel: "Review and complete",
        createdAt: deal.updated_at,
      });
    }
  }

  return items.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) ||
      (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
  );
}

export function approvalCounts(items: ApprovalItem[]): Record<ApprovalGroup, number> {
  return Object.fromEntries(
    (Object.keys(APPROVAL_GROUP_LABEL) as ApprovalGroup[]).map((group) => [
      group,
      items.filter((item) => item.group === group).length,
    ])
  ) as Record<ApprovalGroup, number>;
}
