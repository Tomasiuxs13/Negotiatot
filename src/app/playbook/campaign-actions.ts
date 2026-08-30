"use server";

import { revalidatePath } from "next/cache";
import { archiveCampaign, createCampaign, updateCampaign } from "@/lib/db";
import {
  CAMPAIGN_KPIS,
  CAMPAIGN_OBJECTIVES,
  type CampaignKpi,
  type CampaignObjective,
  type CampaignOverrides,
} from "@/lib/campaigns";

function revalidateAll() {
  revalidatePath("/playbook");
  revalidatePath("/new");
  revalidatePath("/");
  revalidatePath("/pipeline");
}

export async function saveCampaignAction(payload: {
  id?: number;
  name: string;
  objective: CampaignObjective;
  primaryKpi: CampaignKpi;
  kpiTarget: number | null;
  overrides: CampaignOverrides;
  budget: number | null;
}): Promise<{ id?: number; error?: string }> {
  const name = payload.name.trim();
  if (!name) return { error: "Campaign name is required." };
  if (!CAMPAIGN_OBJECTIVES.some((objective) => objective.key === payload.objective)) {
    return { error: "Choose a campaign objective." };
  }
  if (!CAMPAIGN_KPIS[payload.primaryKpi]?.objectives.includes(payload.objective)) {
    return { error: "Choose a primary KPI that matches the campaign objective." };
  }
  if (payload.kpiTarget != null && (!Number.isFinite(payload.kpiTarget) || payload.kpiTarget < 0)) {
    return { error: "KPI target must be a positive number." };
  }
  if (payload.budget != null && (!Number.isFinite(payload.budget) || payload.budget < 0)) {
    return { error: "Campaign budget must be a positive number." };
  }
  try {
    if (payload.id != null) {
      updateCampaign(payload.id, {
        name,
        objective: payload.objective,
        primaryKpi: payload.primaryKpi,
        kpiTarget: payload.kpiTarget,
        overrides: payload.overrides,
        budget: payload.budget,
      });
      revalidateAll();
      return { id: payload.id };
    }
    const id = createCampaign(name, payload.overrides, payload.budget, {
      objective: payload.objective,
      primaryKpi: payload.primaryKpi,
      kpiTarget: payload.kpiTarget,
    });
    revalidateAll();
    return { id };
  } catch (err) {
    console.error("saveCampaignAction failed:", err);
    return { error: err instanceof Error ? err.message : "Failed to save campaign" };
  }
}

export async function archiveCampaignAction(id: number) {
  archiveCampaign(id);
  revalidateAll();
  return {};
}

/** Attach the brand's existing creator brief (HTML or PDF) to a campaign. */
export async function uploadCampaignBriefAction(campaignId: number, formData: FormData) {
  const { getCampaign, setCampaignBrief } = await import("@/lib/db");
  const { saveFile } = await import("@/lib/files");
  if (!getCampaign(campaignId)) return { error: "Campaign not found" };
  const file = formData.get("brief");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a brief file." };
  if (file.size > 10 * 1024 * 1024) return { error: "Too large (max 10 MB)." };
  const ok = ["text/html", "application/pdf"].includes(file.type);
  if (!ok) return { error: "Upload the brief as HTML or PDF." };
  const rel = saveFile(`briefs/campaign-${campaignId}`, file.name, Buffer.from(await file.arrayBuffer()));
  setCampaignBrief(campaignId, { path: rel, filename: file.name, mime: file.type });
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/playbook");
  return {};
}

/**
 * Read the attached brief into the obligations a posted video can be checked against.
 *
 * Separate from the upload on purpose: extraction costs a model call and the manager
 * should be able to re-run it after editing the list, or skip it entirely for a campaign
 * where nobody intends to check videos.
 */
export async function extractBriefRequirementsAction(
  campaignId: number
): Promise<{ error?: string }> {
  const { getCampaign, setCampaignBriefRequirements, getBrandProfile, logUsage } = await import(
    "@/lib/db"
  );
  const { readFile } = await import("@/lib/files");
  const { parseBrief, MODEL, hasApiKey } = await import("@/lib/claude");

  if (!hasApiKey()) return { error: "No Anthropic API key configured." };
  const campaign = getCampaign(campaignId);
  if (!campaign?.brief_path) return { error: "Attach a brief first." };

  try {
    const buffer = readFile(campaign.brief_path);
    const brand = getBrandProfile() as Record<string, string> | null;
    const isPdf = campaign.brief_mime === "application/pdf";

    const result = await parseBrief({
      pdfBase64: isPdf ? buffer.toString("base64") : undefined,
      // HTML briefs go in as text: the markup carries no obligation the prose doesn't,
      // and stripping it keeps the model from reading nav links as requirements.
      text: isPdf ? undefined : stripHtml(buffer.toString("utf8")),
      brandName: brand?.brandName || brand?.productName || undefined,
    });

    setCampaignBriefRequirements(campaignId, JSON.stringify(result.requirements));
    logUsage(null, "brief", MODEL, result.usage.inputTokens, result.usage.outputTokens);
    revalidatePath("/playbook");
    return {};
  } catch (err) {
    console.error("extractBriefRequirementsAction failed:", err);
    return { error: err instanceof Error ? err.message : "Could not read the brief." };
  }
}

/** Manager edits — the extracted list is a starting point, not the authority. */
export async function saveBriefRequirementsAction(
  campaignId: number,
  json: string
): Promise<{ error?: string }> {
  const { getCampaign, setCampaignBriefRequirements } = await import("@/lib/db");
  if (!getCampaign(campaignId)) return { error: "Campaign not found" };
  try {
    JSON.parse(json);
  } catch {
    return { error: "Requirements are not valid JSON." };
  }
  setCampaignBriefRequirements(campaignId, json);
  revalidatePath("/playbook");
  return {};
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60000);
}
