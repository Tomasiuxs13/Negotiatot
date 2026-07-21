"use server";

import { revalidatePath } from "next/cache";
import { archiveCampaign, createCampaign, updateCampaign } from "@/lib/db";
import type { CampaignOverrides } from "@/lib/campaigns";

function revalidateAll() {
  revalidatePath("/playbook");
  revalidatePath("/new");
  revalidatePath("/");
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
