"use server";

import { revalidatePath } from "next/cache";
import { setPlaybook, setSetting } from "@/lib/db";

export interface PlaybookPayload {
  platforms: Record<string, Record<string, unknown>>;
  /** Market and budget — one set, not one per platform. */
  globalRules?: Record<string, unknown>;
  brandProfile?: Record<string, string>;
  unitEconomics: Record<string, unknown>;
  negotiationStyle: Record<string, unknown>;
  measurementWindows?: Record<string, number>;
}

export async function savePlaybookAction(payload: PlaybookPayload): Promise<{ error?: string }> {
  try {
    for (const [platform, rules] of Object.entries(payload.platforms)) {
      if (!["youtube", "instagram", "tiktok", "facebook"].includes(platform)) continue;
      setPlaybook(platform, rules);
    }
    if (payload.globalRules) setSetting("global_rules", payload.globalRules);
    if (payload.brandProfile) setSetting("brand_profile", payload.brandProfile);
    setSetting("unit_economics", payload.unitEconomics);
    setSetting("negotiation_style", payload.negotiationStyle);
    if (payload.measurementWindows) setSetting("measurement_windows", payload.measurementWindows);
    revalidatePath("/benchmarks");
    revalidatePath("/playbook");
    revalidatePath("/");
  revalidatePath("/pipeline");
    return {};
  } catch (err) {
    console.error("savePlaybookAction failed:", err);
    return { error: err instanceof Error ? err.message : "Failed to save" };
  }
}
