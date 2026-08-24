"use server";

import { revalidatePath } from "next/cache";
import { setPlaybook, setSetting } from "@/lib/db";
import { commissionModeError } from "@/lib/commission";

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
    const commissionError = commissionModeError({
      commissionPercent: Number(payload.unitEconomics.commissionPercent ?? 0),
      commissionPerOrder: Number(payload.unitEconomics.commissionPerOrder ?? 0),
    });
    if (commissionError) return { error: commissionError };

    for (const [platform, rules] of Object.entries(payload.platforms)) {
      if (!["youtube", "instagram", "tiktok", "facebook"].includes(platform)) continue;
      setPlaybook(platform, rules);
    }
    if (payload.globalRules) setSetting("global_rules", payload.globalRules);
    if (payload.brandProfile) setSetting("brand_profile", payload.brandProfile);
    setSetting("unit_economics", payload.unitEconomics);
    setSetting("negotiation_style", payload.negotiationStyle);
    if (payload.measurementWindows) setSetting("measurement_windows", payload.measurementWindows);
    // Stored analyses are snapshots. This marker lets every deal say when its verdict
    // predates the rules now on screen instead of presenting old math as current.
    setSetting("playbook_updated_at", new Date().toISOString());
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
