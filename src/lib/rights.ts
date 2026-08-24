/**
 * Rights and extras: usage rights, whitelisting, exclusivity.
 *
 * These are the terms that change what a fee can be without changing the content —
 * industry practice prices each as a separate line item on top of the base fee, scaled
 * by duration and scope. Marking them at intake is the whole point: the system today
 * learns about exclusivity from the signed contract, which is exactly too late for it
 * to affect the price.
 *
 * Pure, like commission.ts — the same shape of problem, riding the same rails: fields
 * on the deal → described into both prompts → checked against the contract at the end.
 */

export type UsageKind = "none" | "organic" | "paid";
export type ExclusivityKind = "none" | "category" | "full";

export interface DealRights {
  /** Brand reuse of the content: organic reposting, or paid ads from brand channels. */
  usage: { kind: UsageKind; months: number };
  /** Ads run through the creator's own account/handle. */
  whitelisting: { enabled: boolean; months: number };
  /** What the creator may not promote elsewhere, and for how long. */
  exclusivity: { kind: ExclusivityKind; months: number; scope: string };
}

/**
 * Deterministic percentage uplifts applied to the content fee for each 30 days granted.
 *
 * The prose guidance in the Playbook is still useful negotiation context, but prose is
 * not a safe source for the four hard guardrails. These numbers are the machine-readable
 * counterpart: editable by the manager and consumed by pricing.ts.
 */
export interface RightsPricing {
  organicUsagePerMonthPct: number;
  paidUsagePerMonthPct: number;
  whitelistingPerMonthPct: number;
  categoryExclusivityPerMonthPct: number;
  fullExclusivityPerMonthPct: number;
  maxTotalPct: number;
}

export const DEFAULT_RIGHTS_PRICING: RightsPricing = {
  organicUsagePerMonthPct: 25,
  paidUsagePerMonthPct: 37.5,
  whitelistingPerMonthPct: 37.5,
  categoryExclusivityPerMonthPct: 25,
  fullExclusivityPerMonthPct: 60,
  maxTotalPct: 250,
};

function boundedPct(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 1000) : fallback;
}

export function parseRightsPricing(style: Record<string, unknown> | null | undefined): RightsPricing {
  const raw =
    style?.rightsPricing && typeof style.rightsPricing === "object"
      ? (style.rightsPricing as Partial<RightsPricing>)
      : {};
  return {
    organicUsagePerMonthPct: boundedPct(
      raw.organicUsagePerMonthPct,
      DEFAULT_RIGHTS_PRICING.organicUsagePerMonthPct
    ),
    paidUsagePerMonthPct: boundedPct(
      raw.paidUsagePerMonthPct,
      DEFAULT_RIGHTS_PRICING.paidUsagePerMonthPct
    ),
    whitelistingPerMonthPct: boundedPct(
      raw.whitelistingPerMonthPct,
      DEFAULT_RIGHTS_PRICING.whitelistingPerMonthPct
    ),
    categoryExclusivityPerMonthPct: boundedPct(
      raw.categoryExclusivityPerMonthPct,
      DEFAULT_RIGHTS_PRICING.categoryExclusivityPerMonthPct
    ),
    fullExclusivityPerMonthPct: boundedPct(
      raw.fullExclusivityPerMonthPct,
      DEFAULT_RIGHTS_PRICING.fullExclusivityPerMonthPct
    ),
    maxTotalPct: boundedPct(raw.maxTotalPct, DEFAULT_RIGHTS_PRICING.maxTotalPct),
  };
}

export interface RightsPremium {
  percent: number;
  lines: string[];
}

/** The exact rights uplift used by pricing, with an auditable line per grant. */
export function rightsPremiumFor(
  rights: DealRights,
  style: Record<string, unknown> | null | undefined
): RightsPremium {
  const pricing = parseRightsPricing(style);
  const lines: string[] = [];
  let percent = 0;
  const add = (label: string, months: number, monthlyPct: number) => {
    // A selected right with no duration is incomplete, but pricing it as free is the
    // dangerous outcome. Reserve one month and keep the missing duration visible in UI.
    const pricedMonths = Math.max(1, months);
    const amount = pricedMonths * monthlyPct;
    percent += amount;
    lines.push(`${label}: ${pricedMonths}mo × ${monthlyPct}% = +${amount}%`);
  };

  if (rights.usage.kind === "organic") {
    add("Organic usage", rights.usage.months, pricing.organicUsagePerMonthPct);
  } else if (rights.usage.kind === "paid") {
    add("Paid usage", rights.usage.months, pricing.paidUsagePerMonthPct);
  }
  if (rights.whitelisting.enabled) {
    add("Whitelisting", rights.whitelisting.months, pricing.whitelistingPerMonthPct);
  }
  if (rights.exclusivity.kind === "category") {
    add("Category exclusivity", rights.exclusivity.months, pricing.categoryExclusivityPerMonthPct);
  } else if (rights.exclusivity.kind === "full") {
    add("Full exclusivity", rights.exclusivity.months, pricing.fullExclusivityPerMonthPct);
  }

  const capped = Math.min(percent, pricing.maxTotalPct);
  if (capped < percent) lines.push(`Rights premium capped at +${pricing.maxTotalPct}%`);
  return { percent: capped, lines };
}

export const NO_RIGHTS: DealRights = {
  usage: { kind: "none", months: 0 },
  whitelisting: { enabled: false, months: 0 },
  exclusivity: { kind: "none", months: 0, scope: "" },
};

/** Tolerant of old rows and hand-edited JSON — anything unreadable is "no rights". */
export function parseRights(raw: string | null | undefined): DealRights {
  if (!raw) return NO_RIGHTS;
  try {
    const p = JSON.parse(raw) as Partial<DealRights>;
    const usageKind: UsageKind =
      p.usage?.kind === "organic" || p.usage?.kind === "paid" ? p.usage.kind : "none";
    const exclusivityKind: ExclusivityKind =
      p.exclusivity?.kind === "category" || p.exclusivity?.kind === "full"
        ? p.exclusivity.kind
        : "none";
    const months = (n: unknown) =>
      typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
    return {
      usage: { kind: usageKind, months: usageKind === "none" ? 0 : months(p.usage?.months) },
      whitelisting: {
        enabled: p.whitelisting?.enabled === true,
        months: p.whitelisting?.enabled === true ? months(p.whitelisting?.months) : 0,
      },
      exclusivity: {
        kind: exclusivityKind,
        months: exclusivityKind === "none" ? 0 : months(p.exclusivity?.months),
        scope: typeof p.exclusivity?.scope === "string" ? p.exclusivity.scope.trim() : "",
      },
    };
  } catch {
    return NO_RIGHTS;
  }
}

export function hasRights(r: DealRights): boolean {
  return r.usage.kind !== "none" || r.whitelisting.enabled || r.exclusivity.kind !== "none";
}

function monthsLabel(n: number): string {
  if (n <= 0) return "duration not set";
  return n === 1 ? "1 month" : `${n} months`;
}

/**
 * The rights as prompt facts, one per line. Written so the model can price and *name*
 * them — the negotiation advice the industry gives ("precise scope, named competitors,
 * short durations") only works if the draft states the scope precisely.
 */
export function describeRights(r: DealRights): string[] {
  const lines: string[] = [];
  if (r.usage.kind === "organic") {
    lines.push(`Usage rights: brand may repost the content organically for ${monthsLabel(r.usage.months)}.`);
  } else if (r.usage.kind === "paid") {
    lines.push(`Usage rights: brand may run the content as paid ads for ${monthsLabel(r.usage.months)}.`);
  }
  if (r.whitelisting.enabled) {
    lines.push(`Whitelisting: ads run through the creator's own account for ${monthsLabel(r.whitelisting.months)}.`);
  }
  if (r.exclusivity.kind === "category") {
    lines.push(
      `Exclusivity: category lock-out for ${monthsLabel(r.exclusivity.months)}` +
        (r.exclusivity.scope ? ` (${r.exclusivity.scope})` : " (competitors not yet named — name them in the agreement)") +
        `.`
    );
  } else if (r.exclusivity.kind === "full") {
    lines.push(`Exclusivity: full exclusivity (no other sponsors) for ${monthsLabel(r.exclusivity.months)}.`);
  }
  return lines;
}

/** Compact chips for the UI: "paid usage 3mo · whitelisting 2mo · category excl. 3mo". */
export function rightsSummary(r: DealRights): string | null {
  const parts: string[] = [];
  if (r.usage.kind !== "none") parts.push(`${r.usage.kind} usage ${r.usage.months || "?"}mo`);
  if (r.whitelisting.enabled) parts.push(`whitelisting ${r.whitelisting.months || "?"}mo`);
  if (r.exclusivity.kind !== "none")
    parts.push(`${r.exclusivity.kind} excl. ${r.exclusivity.months || "?"}mo`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The contract clause, generated from the same structure the price was based on. */
export function rightsContractClause(r: DealRights): string {
  if (!hasRights(r)) {
    return "Organic posting on the Creator's own channels only. No reuse, amplification or exclusivity beyond this agreement.";
  }
  const parts: string[] = [];
  if (r.usage.kind === "organic")
    parts.push(`Brand may repost the content on its own channels (organic only) for ${monthsLabel(r.usage.months)} from publication.`);
  if (r.usage.kind === "paid")
    parts.push(`Brand may use the content in paid advertising for ${monthsLabel(r.usage.months)} from publication.`);
  if (r.whitelisting.enabled)
    parts.push(`Creator grants ad access to their account (whitelisting) for ${monthsLabel(r.whitelisting.months)} from publication.`);
  if (r.exclusivity.kind === "category")
    parts.push(
      `Creator will not promote competing products${r.exclusivity.scope ? ` (${r.exclusivity.scope})` : ""} for ${monthsLabel(r.exclusivity.months)} from the final publish date.`
    );
  if (r.exclusivity.kind === "full")
    parts.push(`Creator will not accept other sponsorships for ${monthsLabel(r.exclusivity.months)} from the final publish date.`);
  return parts.join(" ");
}

/**
 * Where the signed contract and the priced deal disagree about rights.
 *
 * The contract side is free text from the parser, so this is deliberately a presence
 * check, not a text comparison: a right the deal was priced for that the contract never
 * mentions (the creator can argue it was never agreed), or a grant in the contract the
 * price never accounted for (the classic unpriced-exclusivity failure). Anything subtler
 * than presence would be guessing against prose.
 */
export function rightsMismatch(
  rights: DealRights,
  terms: { usageRights: string | null; exclusivity: string | null }
): string[] {
  const warnings: string[] = [];
  const contractUsage = Boolean(terms.usageRights?.trim());
  const contractExcl = Boolean(terms.exclusivity?.trim());
  const dealUsage = rights.usage.kind !== "none" || rights.whitelisting.enabled;
  const dealExcl = rights.exclusivity.kind !== "none";

  if (dealUsage && !contractUsage)
    warnings.push(
      "This deal was priced with usage/whitelisting rights, but the contract's usage clause is empty — without it in writing, the grant doesn't exist."
    );
  if (!dealUsage && contractUsage)
    warnings.push(
      `The contract grants usage rights ("${terms.usageRights!.trim()}") that this deal was never priced for.`
    );
  if (dealExcl && !contractExcl)
    warnings.push(
      "This deal was priced with exclusivity, but the contract has no exclusivity clause — the lock-out you paid for isn't in writing."
    );
  if (!dealExcl && contractExcl)
    warnings.push(
      `The contract contains an exclusivity clause ("${terms.exclusivity!.trim()}") that this deal was never priced for.`
    );
  return warnings;
}
