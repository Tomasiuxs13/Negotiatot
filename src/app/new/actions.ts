"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import sharp from "sharp";
import { addMessage, createDeal, setJob, updateDeal } from "@/lib/db";
import { hasApiKey, type ImageMediaType } from "@/lib/claude";
import { performAnalysis } from "@/lib/engine";

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
  const campaign = String(formData.get("campaign") ?? "").trim() || null;
  const message = String(formData.get("message") ?? "").trim();
  const channelUrl = String(formData.get("channel_url") ?? "").trim();
  const knownAvgViews = Number(formData.get("known_avg_views")) || null;
  const knownEngagement = Number(formData.get("known_engagement")) || null;

  if (!creator) return { error: "Creator name is required." };
  if (platforms.length === 0) return { error: "Pick at least one platform." };

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
    creator,
    platforms,
    deliverables,
    campaign,
    avg_views: knownAvgViews,
    engagement_rate: knownEngagement,
  });
  if (message) addMessage(id, "them", message);
  revalidatePath("/");

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
