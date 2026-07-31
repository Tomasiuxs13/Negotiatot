"use server";

import { revalidatePath } from "next/cache";
import { archiveCampaign, createCampaign, updateCampaign } from "@/lib/db";
import type { CampaignOverrides } from "@/lib/campaigns";

function revalidateAll() {
  revalidatePath("/playbook");
  revalidatePath("/new");
  revalidatePath("/");
  revalidatePath("/pipeline");
}

export async function saveCampaignAction(payload: {
  id?: number;
  name: string;
  overrides: CampaignOverrides;
  budget: number | null;
}): Promise<{ id?: number; error?: string }> {
  const name = payload.name.trim();
  if (!name) return { error: "Campaign name is required." };
  try {
    if (payload.id != null) {
      updateCampaign(payload.id, { name, overrides: payload.overrides, budget: payload.budget });
      revalidateAll();
      return { id: payload.id };
    }
    const id = createCampaign(name, payload.overrides, payload.budget);
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
