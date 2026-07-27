"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import sharp from "sharp";
import {
  addMessage,
  createDeal,
  createPartner,
  findPartnerByName,
  getCampaign,
  getPartner,
  getPartnerChannels,
  getPartnerDeals,
  setJob,
  updateDeal,
  updatePartner,
  upsertPartnerChannel,
} from "@/lib/db";
import { hasApiKey, type ImageMediaType } from "@/lib/claude";
import { performAnalysis } from "@/lib/engine";
import { priorDeals } from "@/lib/partners";

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const IMAGE_TYPES: ImageMediaType[] = ["image/png", "image/jpeg", "image/webp", "image/gif"];
// Claude's hard limit is 8000px per side; ~2500px is plenty for reading stats and much cheaper.
const MAX_IMAGE_DIMENSION = 2500;

async function prepareImage(
  buffer: Buffer,
  originalType: ImageMediaType
): Promise<{ base64: string; mediaType: ImageMediaType }> {
  const meta = await sharp(buffer).metadata();
  const largest = Math.max(meta.width ?? 0, meta.height ?? 0);
  if (largest > MAX_IMAGE_DIMENSION || buffer.length > 4 * 1024 * 1024) {
    const resized = await sharp(buffer)
      .resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 88 })
      .toBuffer();
    return { base64: resized.toString("base64"), mediaType: "image/jpeg" };
  }
  return { base64: buffer.toString("base64"), mediaType: originalType };
}

export async function createDealAction(
  formData: FormData
): Promise<{ id?: number; error?: string; warning?: string }> {
  const creator = String(formData.get("creator") ?? "").trim();
  const platforms = formData
    .getAll("platforms")
    .map(String)
    .filter((p) => ["youtube", "instagram", "tiktok"].includes(p));
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
  const knownEngagement = Number(formData.get("known_engagement")) || null;
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
  const file = formData.get("report");
  if (file instanceof File && file.size > 0) {
    if (file.type.includes("pdf")) {
      if (file.size > MAX_PDF_BYTES) return { error: "Report PDF is too large (max 20 MB)." };
      pdfBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    } else if (IMAGE_TYPES.includes(file.type as ImageMediaType)) {
      if (file.size > MAX_IMAGE_BYTES) return { error: "Screenshot is too large (max 30 MB)." };
      try {
        reportImage = await prepareImage(
          Buffer.from(await file.arrayBuffer()),
          file.type as ImageMediaType
        );
      } catch (err) {
        console.error("prepareImage failed:", err);
        return { error: "Couldn't read that image — is the file corrupted?" };
      }
    } else {
      return { error: "Unsupported file type — upload a PDF report or a PNG/JPEG/WebP screenshot." };
    }
  }

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

export interface PartnerPrefill {
  partnerId: number;
  name: string;
  email: string | null;
  platforms: string[];
  channelUrl: string | null;
  avgViews: number | null;
  engagementRate: number | null;
  dealCount: number;
  lastAgreedPrice: number | null;
  lastDealDate: string | null;
  lastScope: string | null;
  lastActualCpm: number | null;
}

/**
 * Everything already known about a returning creator. Retyping a partner's reach for
 * the third collaboration is both tedious and a chance to enter it wrong.
 */
export async function lookupPartnerAction(name: string): Promise<PartnerPrefill | null> {
  const trimmed = name.trim();
  if (trimmed.length < 2) return null;

  const partner = findPartnerByName(trimmed);
  if (!partner) return null;

  const channels = getPartnerChannels(partner.id);
  const history = priorDeals(getPartnerDeals(partner.id));
  const last = history[0] ?? null;
  // A single "avg views" plus "engagement" pair has to describe one channel, or the
  // two numbers contradict each other. The biggest channel is the one to describe.
  const withViews = channels.filter((c) => c.avg_views != null);
  const primary =
    withViews.length > 0
      ? withViews.reduce((best, c) => (c.avg_views! > best.avg_views! ? c : best))
      : channels[0];

  return {
    partnerId: partner.id,
    name: partner.name,
    email: partner.email,
    platforms: channels.map((c) => c.platform),
    channelUrl: primary?.url ?? channels.find((c) => c.url)?.url ?? null,
    avgViews: primary?.avg_views ?? null,
    engagementRate: primary?.engagement_rate ?? null,
    dealCount: history.length,
    lastAgreedPrice: last?.agreedPrice ?? null,
    lastDealDate: last?.date ?? null,
    lastScope: last?.scope ?? null,
    lastActualCpm: last?.actualCpm ?? null,
  };
}
