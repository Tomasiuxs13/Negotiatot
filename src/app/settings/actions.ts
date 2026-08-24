"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { getSetting, setSetting } from "@/lib/db";
import { generateApiKey } from "@/lib/api-auth";

/**
 * One key, held in the settings table like every other app-level setting. Generating a
 * new one replaces the old — which is also how "rotate a leaked key" works — and
 * revoking turns the API off entirely, back to its default state.
 */
export async function generateApiKeyAction(): Promise<{ key?: string; error?: string }> {
  const key = generateApiKey(randomBytes);
  setSetting("api_key", key);
  revalidatePath("/settings");
  return { key };
}

export async function revokeApiKeyAction(): Promise<{ error?: string }> {
  if (getSetting<string>("api_key") == null) return {};
  setSetting("api_key", null);
  revalidatePath("/settings");
  return {};
}
