/**
 * Normalisation for the bulk deal import (POST /api/deals/bulk).
 *
 * Pure: JSON in, either form-ready fields or a reason out. The route stays thin and the
 * rules — what a row must carry, what defaults fill in, what gets rejected — live here
 * where they can be tested without HTTP.
 *
 * The output is deliberately the same flat field names the New Deal form posts, so the
 * route can feed createDealAction and the API can never drift from the form: one code
 * path decides what creating a deal means.
 */

import { parseDecimal } from "./format";

export interface ProgramDefaults {
  commissionType: "none" | "percent" | "per_order";
  commissionValue: number;
  discountType: "none" | "percent" | "fixed";
  discountValue: number;
}

const PLATFORMS = ["youtube", "instagram", "tiktok", "facebook"] as const;

/** Aliases people naturally write for the audience discount ("$20 off" → fixed). */
const DISCOUNT_ALIASES: Record<string, "percent" | "fixed"> = {
  percent: "percent",
  "%": "percent",
  fixed: "fixed",
  off: "fixed",
  amount: "fixed",
};

export type NormalizedItem =
  | {
      ok: true;
      creatorName: string;
      platforms: string[];
      /** Flat fields, named exactly as the New Deal form posts them. */
      fields: Record<string, string>;
    }
  | { ok: false; creatorName: string | null; error: string };

export function normalizeBulkItem(raw: unknown, defaults: ProgramDefaults): NormalizedItem {
  if (typeof raw !== "object" || raw == null || Array.isArray(raw)) {
    return { ok: false, creatorName: null, error: "Each item must be a JSON object." };
  }
  const r = raw as Record<string, unknown>;
  const str = (k: string) => (typeof r[k] === "string" ? (r[k] as string).trim() : "");
  const creatorName = str("creatorName") || str("creator");
  if (!creatorName) return { ok: false, creatorName: null, error: "creatorName is required." };

  // The whole point of bulk import is outreach capture, so "contacted" is the default —
  // and "analyzing" is refused outright rather than honoured: a 20-row file silently
  // kicking off 20 model analyses is a bill nobody reviewed. Analysis stays a per-deal,
  // deliberate click on the deal page.
  const stage = str("stage") || "contacted";
  if (stage !== "lead" && stage !== "contacted") {
    return {
      ok: false,
      creatorName,
      error: `stage must be "lead" or "contacted" — analysis is run from the deal page, not from an import.`,
    };
  }

  const rawPlatforms = Array.isArray(r.platforms)
    ? (r.platforms as unknown[]).map(String)
    : str("platform")
      ? [str("platform")]
      : [];
  const platforms = rawPlatforms
    .map((p) => p.toLowerCase().trim())
    .filter((p): p is (typeof PLATFORMS)[number] => (PLATFORMS as readonly string[]).includes(p));
  if (platforms.length === 0) {
    return {
      ok: false,
      creatorName,
      error: `platform must be one of: ${PLATFORMS.join(", ")}.`,
    };
  }

  const num = (k: string): number | null => {
    const v = r[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
    if (typeof v === "string") {
      const parsed = parseDecimal(v);
      if (parsed != null && parsed >= 0) return parsed;
    }
    return null;
  };

  // Commission and discount fall back to the Playbook's program rate when the item
  // doesn't mention them — same as the form, which preloads those inputs. An explicit
  // value of 0 or type "none" is an opt-out, not an omission.
  const hasCommission = "commissionType" in r || "commissionValue" in r;
  const commissionTypeRaw = str("commissionType").toLowerCase();
  const commissionType = hasCommission
    ? commissionTypeRaw === "percent" || commissionTypeRaw === "per_order"
      ? commissionTypeRaw
      : "none"
    : defaults.commissionType;
  const commissionValue = hasCommission ? (num("commissionValue") ?? 0) : defaults.commissionValue;

  const hasDiscount = "audienceDiscountType" in r || "audienceDiscountValue" in r;
  const discountType = hasDiscount
    ? (DISCOUNT_ALIASES[str("audienceDiscountType").toLowerCase()] ?? "none")
    : defaults.discountType;
  const discountValue = hasDiscount ? (num("audienceDiscountValue") ?? 0) : defaults.discountValue;

  const fields: Record<string, string> = {
    creator: creatorName,
    primary_platform: platforms[0],
    stage,
    email: str("email"),
    deliverables: str("deliverables"),
    campaign: str("campaign"),
    channel_url: str("channelUrl"),
    message: str("message"),
    known_avg_views: num("knownAvgViews") != null ? String(num("knownAvgViews")) : "",
    // Passed through as text: createDealAction runs parseDecimal, so "4,8" works here
    // exactly as it does in the form.
    known_engagement: str("knownEngagement") || (num("knownEngagement") != null ? String(num("knownEngagement")) : ""),
    commission_type: commissionType,
    commission_value: commissionValue > 0 ? String(commissionValue) : "",
    discount_type: discountType,
    discount_value: discountValue > 0 ? String(discountValue) : "",
  };

  return { ok: true, creatorName, platforms, fields };
}

/** The hard ceiling on one request — beyond this it's a migration, not an import. */
export const BULK_MAX_ITEMS = 200;
