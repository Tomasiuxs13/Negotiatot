"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import {
  addMessage,
  createDeal,
  createPartner,
  findPartnerByName,
  getCampaign,
  getPartner,
  setJob,
  updateDeal,
  updatePartner,
  upsertPartnerChannel,
} from "@/lib/db";
import { hasApiKey, type ImageMediaType } from "@/lib/claude";
import { performAnalysis } from "@/lib/engine";
import { partnerPrefillByName } from "@/lib/partner-prefill";
import type { PartnerPrefill } from "@/lib/partners";
import { parseDecimal } from "@/lib/format";
import { readReportFile } from "@/lib/report-upload";
import { hasRights, parseRights, type DealRights } from "@/lib/rights";

export async function createDealAction(
  formData: FormData
): Promise<{ id?: number; error?: string; warning?: string }> {
  const creator = String(formData.get("creator") ?? "").trim();
  const selectedPlatforms = formData
    .getAll("platforms")
    .map(String)
    .filter((p) => ["youtube", "instagram", "tiktok", "facebook"].includes(p));
  const primaryPlatform = String(formData.get("primary_platform") ?? "").trim();
  const platforms = selectedPlatforms.includes(primaryPlatform)
    ? [primaryPlatform, ...selectedPlatforms.filter((p) => p !== primaryPlatform)]
    : selectedPlatforms;
  const deliverables = String(formData.get("deliverables") ?? "").trim() || null;
  const campaignIdRaw = String(formData.get("campaign_id") ?? "").trim();
  const campaignId = campaignIdRaw ? Number(campaignIdRaw) : null;
  const campaign =
    (campaignId != null ? getCampaign(campaignId)?.name : null) ??
    String(formData.get("campaign") ?? "").trim() ??
    null;
  const message = String(formData.get("message") ?? "").trim();
  const channelUrl = String(formData.get("channel_url") ?? "").trim();
  const knownAvgViews = Number(formData.get("known_avg_views")) || null;
  // parseDecimal, not Number: the form field is free text so "11,45" can be typed,
  // which means the comma has to be understood here too.
  const knownEngagement = parseDecimal(String(formData.get("known_engagement") ?? ""));
  const stageRaw = String(formData.get("stage") ?? "").trim();
  // Leads and contacted deals are captured now and analyzed later, so we skip the API call.
  const isPreAnalysis = stageRaw === "lead" || stageRaw === "contacted";

  if (!creator) return { error: "Creator name is required." };
  if (platforms.length === 0) return { error: "Pick at least one platform." };

  const email = String(formData.get("email") ?? "").trim();

  // A CPA alongside the fee changes what the fee can be, so it's captured up front.
  const commissionTypeRaw = String(formData.get("commission_type") ?? "none").trim();
  const commissionValue = Number(formData.get("commission_value")) || 0;
  const commissionType =
    (commissionTypeRaw === "percent" || commissionTypeRaw === "per_order") && commissionValue > 0
      ? commissionTypeRaw
      : null;

  // Rights & extras — stored as one JSON blob and parsed by rights.ts everywhere else,
  // so the form's flat field names stop existing past this point.
  const usageKind = String(formData.get("usage_kind") ?? "none");
  const exclusivityKind = String(formData.get("exclusivity_kind") ?? "none");
  const whitelistingOn = formData.get("whitelisting") === "1";
  const rightsMonths = (name: string) => Math.max(0, Math.round(Number(formData.get(name)) || 0));
  const rights: DealRights = {
    usage: {
      kind: usageKind === "organic" || usageKind === "paid" ? usageKind : "none",
      months: rightsMonths("usage_months"),
    },
    whitelisting: { enabled: whitelistingOn, months: rightsMonths("whitelisting_months") },
    exclusivity: {
      kind: exclusivityKind === "category" || exclusivityKind === "full" ? exclusivityKind : "none",
      months: rightsMonths("exclusivity_months"),
      scope: String(formData.get("exclusivity_scope") ?? "").trim(),
    },
  };

  // The audience coupon: their benefit, our cost.
  const discountTypeRaw = String(formData.get("discount_type") ?? "none").trim();
  const discountValue = Number(formData.get("discount_value")) || 0;
  const discountType =
    (discountTypeRaw === "percent" || discountTypeRaw === "fixed") && discountValue > 0
      ? discountTypeRaw
      : null;

  // Resolve the partner: an explicit pick, an existing name match, or a new record.
  // Email is a contact attribute, so it lives on the partner rather than the deal.
  const partnerIdRaw = String(formData.get("partner_id") ?? "").trim();
  const picked = partnerIdRaw ? getPartner(Number(partnerIdRaw)) : undefined;
  const partner = picked ?? findPartnerByName(creator);
  const partnerId = partner?.id ?? createPartner({ name: creator, email: email || null });
  const partnerName = partner?.name ?? creator;
  // Fill an existing partner's email only when it's blank — never clobber what's there.
  if (partner && email && !partner.email) {
    updatePartner(partner.id, { email });
  }

  let pdfBase64: string | undefined;
  let reportImage: { base64: string; mediaType: ImageMediaType } | undefined;
  const report = await readReportFile(formData.get("report"));
  if (report.kind === "error") return { error: report.error };
  if (report.kind === "pdf") pdfBase64 = report.pdfBase64;
  if (report.kind === "image") reportImage = report.image;

  const id = createDeal({
    creator: partnerName,
    platforms,
    deliverables,
    campaign: campaign || null,
    campaignId,
    partnerId,
    avg_views: knownAvgViews,
    engagement_rate: knownEngagement,
    stage: isPreAnalysis ? stageRaw : "analyzing",
    status_label: stageRaw === "contacted" ? "Reached out · awaiting reply" : undefined,
  });
  if (commissionType) {
    updateDeal(id, { commission_type: commissionType, commission_value: commissionValue });
  }
  if (discountType) {
    updateDeal(id, { discount_type: discountType, discount_value: discountValue });
  }
  // parseRights round-trip normalises: a switched-off right loses its months, an
  // unchecked box its scope, so "none" always serialises to the same thing.
  const normalisedRights = parseRights(JSON.stringify(rights));
  if (hasRights(normalisedRights)) {
    updateDeal(id, { rights: JSON.stringify(normalisedRights) });
  }

  // Keep the partner's channel list in step with the deal's platforms.
  for (const platform of platforms) {
    upsertPartnerChannel({
      partnerId,
      platform,
      url: platform === platforms[0] ? channelUrl || undefined : undefined,
      avgViews: platform === platforms[0] ? knownAvgViews : undefined,
      engagementRate: platform === platforms[0] ? knownEngagement : undefined,
    });
  }
  if (message) addMessage(id, "them", message);
  if (channelUrl) updateDeal(id, { channel_url: channelUrl });
  revalidatePath("/");
  revalidatePath("/pipeline");

  // Pre-analysis stages: capture the lead now, analyze when it's worth the spend.
  if (isPreAnalysis) {
    updateDeal(id, {
      status_label: stageRaw === "contacted" ? "Reached out · awaiting reply" : "New lead",
      status_tone: "neutral",
    });
    return { id };
  }

  if (!hasApiKey()) {
    updateDeal(id, { status_label: "Awaiting analysis (no API key)", status_tone: "warn" });
    return {
      id,
      warning: "Deal created, but no ANTHROPIC_API_KEY is configured — analysis was skipped.",
    };
  }

  // The analysis runs in the background; the deal page shows live progress.
  setJob(id, "analyzing");
  updateDeal(id, { status_label: "Analyzing…", status_tone: "neutral" });
  after(() =>
    performAnalysis(id, {
      reportPdfBase64: pdfBase64,
      reportImage,
      channelUrl: channelUrl || undefined,
      knownAvgViews,
      knownEngagement,
    })
  );
  return { id };
}

/**
 * Everything already known about a returning creator. Retyping a partner's reach for
 * the third collaboration is both tedious and a chance to enter it wrong.
 */
export async function lookupPartnerAction(name: string): Promise<PartnerPrefill | null> {
  const trimmed = name.trim();
  if (trimmed.length < 2) return null;
  return partnerPrefillByName(trimmed);
}
