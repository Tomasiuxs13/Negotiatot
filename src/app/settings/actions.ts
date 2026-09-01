"use server";

import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSetting, setSetting } from "@/lib/db";
import { parseCategories } from "@/lib/categories";
import { parseRecordLayout, type RecordLayout } from "@/lib/record-layout";
import { generateApiKey } from "@/lib/api-auth";
import { disconnectGmail } from "@/lib/gmail";
import { normalizeIgnoredDomains } from "@/lib/email-triage";

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

export async function disconnectGmailAction(): Promise<{ error?: string }> {
  try {
    const requestHeaders = await headers();
    const origin = requestHeaders.get("origin") ?? `http://${requestHeaders.get("host") ?? "localhost:3000"}`;
    await disconnectGmail(origin);
    revalidatePath("/settings");
    revalidatePath("/inbox");
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Gmail could not be disconnected." };
  }
}

export async function saveGmailIgnoredDomainsAction(value: string): Promise<{
  domains?: string[];
  error?: string;
}> {
  const domains = normalizeIgnoredDomains(value);
  setSetting("gmail_ignored_domains", domains);
  revalidatePath("/settings");
  revalidatePath("/inbox");
  return { domains };
}

/**
 * The creator-category taxonomy. Stored normalised — trimmed, de-duplicated — so the
 * list itself can never contain the split spellings it exists to prevent.
 */
export async function saveCreatorCategoriesAction(raw: string): Promise<{ error?: string }> {
  const list = parseCategories(raw);
  setSetting("creator_categories", list);
  revalidatePath("/settings");
  revalidatePath("/new");
  revalidatePath("/partners");
  revalidatePath("/benchmarks");
  return {};
}

/**
 * The record-page layout. Every page that reads it is revalidated, so the switch takes
 * effect on the next click rather than after a deploy — which is the whole point of it
 * being a setting.
 */
export async function saveRecordLayoutAction(value: RecordLayout): Promise<{ error?: string }> {
  setSetting("record_layout", parseRecordLayout(value));
  revalidatePath("/settings");
  revalidatePath("/deals", "layout");
  revalidatePath("/partners", "layout");
  return {};
}
