"use server";

import { revalidatePath } from "next/cache";
import { setPlaybook, setSetting } from "@/lib/db";

export interface PlaybookPayload {
  platforms: Record<string, Record<string, unknown>>;
  unitEconomics: Record<string, unknown>;
  negotiationStyle: Record<string, unknown>;
  measurementWindows?: Record<string, number>;
}

export async function savePlaybookAction(payload: PlaybookPayload): Promise<{ error?: string }> {
  try {
    for (const [platform, rules] of Object.entries(payload.platforms)) {
      if (!["youtube", "instagram", "tiktok"].includes(platform)) continue;
      setPlaybook(platform, rules);
    }
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
