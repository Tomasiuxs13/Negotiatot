"use server";
import {
  deleteContractTemplate,
  getContractTemplate,
  getDeal,
  logUsage,
  saveContractTemplate,
  setDefaultContractTemplate,
  type ContractTemplate,
} from "@/lib/db";
import { CONTRACT_SLOTS, validateTemplate, type TemplateReport } from "@/lib/contract-slots";
import { generateContractText } from "@/lib/contract-template";
import { contractInputsFor } from "@/lib/contract-draft";
import { hasApiKey, MODEL, proposeContractSlots, type SlotProposal } from "@/lib/claude";
import {
  clearDocusignSettings,
  disconnectDocusign,
  getDocusignConnectionSummary,
  saveDocusignSettings,
} from "@/lib/docusign";
import { normalizeEnvironment } from "@/lib/docusign-config";

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

// ---------------------------------------------------------------------------------------
// Contract templates
// ---------------------------------------------------------------------------------------

/**
 * Saves a template. Syntax errors refuse the save — a template that cannot be parsed
 * cannot render — but a missing requirement group only marks it incomplete, so a company
 * can save half-mapped work and come back to it.
 */
export async function saveContractTemplateAction(input: {
  id?: number | null;
  name: string;
  body: string;
}): Promise<{ error?: string; template?: ContractTemplate; report?: TemplateReport }> {
  const name = input.name.trim();
  const body = input.body.replace(/\r\n/g, "\n");
  if (!name) return { error: "Give the template a name." };
  if (name.length > 80) return { error: "Keep the name under 80 characters." };
  if (!body.trim()) return { error: "The template is empty." };
  if (body.length > 200_000) return { error: "That template is too long." };
  const report = validateTemplate(body);
  if (report.errors.length > 0) {
    const first = report.errors[0];
    return { error: `Line ${first.line}: ${first.message}`, report };
  }
  if (input.id) {
    if (!getContractTemplate(input.id)) return { error: "That template no longer exists." };
  }
  const template = saveContractTemplate({
    id: input.id ?? null,
    name,
    body,
    incomplete: report.missing.length > 0,
  });
  revalidatePath("/settings");
  return { template, report };
}

export async function deleteContractTemplateAction(id: number): Promise<{ error?: string }> {
  if (!getContractTemplate(id)) return { error: "That template no longer exists." };
  deleteContractTemplate(id);
  revalidatePath("/settings");
  return {};
}

/** Null makes the built-in agreement the default again. */
export async function setDefaultContractTemplateAction(id: number | null): Promise<{ error?: string }> {
  if (id != null) {
    const t = getContractTemplate(id);
    if (!t) return { error: "That template no longer exists." };
    if (t.incomplete) {
      return { error: "An incomplete template cannot be the default — it cannot state every required part of an agreement." };
    }
  }
  setDefaultContractTemplate(id);
  revalidatePath("/settings");
  return {};
}

/**
 * The one-time mapping pass over a pasted contract: Claude keeps the wording and marks
 * what the app can fill. The result is a proposal for the person to review, never saved
 * on its own.
 */
export async function proposeContractSlotsAction(
  text: string
): Promise<{ error?: string; proposal?: SlotProposal; report?: TemplateReport }> {
  if (!hasApiKey()) return { error: "No Claude API key is configured, so the contract cannot be read." };
  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (trimmed.length < 200) return { error: "Paste the whole agreement — that is too short to be one." };
  if (trimmed.length > 80_000) return { error: "That is longer than a contract this can convert in one pass. Trim the schedules and try again." };
  try {
    const { proposal, usage } = await proposeContractSlots({ text: trimmed, catalog: CONTRACT_SLOTS });
    logUsage(null, "contract_template", MODEL, usage.inputTokens, usage.outputTokens);
    // The catalog is shown to the model as {{path}}, and it tends to echo the braces back
    // in `slot`. The UI adds its own, so strip them here rather than in every renderer.
    const mapped = proposal.mapped.map((m) => ({
      ...m,
      slot: m.slot.replace(/^\{\{\s*#?(?:if|each)?\s*|\s*\}\}$/g, "").trim(),
    }));
    return { proposal: { ...proposal, mapped }, report: validateTemplate(proposal.template) };
  } catch (error) {
    console.error("proposeContractSlots failed:", error);
    return { error: error instanceof Error ? error.message : "The contract could not be converted." };
  }
}

/** Renders a template body against a real deal so the mapping can be judged on a case. */
export async function previewContractTemplateAction(
  body: string,
  dealId: number
): Promise<{ error?: string; text?: string }> {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  const report = validateTemplate(body);
  if (report.errors.length > 0) {
    const first = report.errors[0];
    return { error: `Line ${first.line}: ${first.message}` };
  }
  return { text: generateContractText({ ...contractInputsFor(deal), templateBody: body }) };
}

export async function disconnectDocusignAction(): Promise<{ error?: string }> {
  disconnectDocusign();
  revalidatePath("/settings");
  return {};
}

/**
 * Saves DocuSign credentials entered in Settings.
 *
 * `secret` is undefined when the field was left untouched, which keeps the stored one —
 * the form never receives the secret back, so it cannot resubmit it. Changing the key or
 * the secret invalidates any live connection, so the account is disconnected in the same
 * step rather than left looking connected against credentials that no longer apply.
 */
export async function saveDocusignSettingsAction(input: {
  integrationKey: string;
  secret?: string;
  environment: string;
  redirectUri: string;
}): Promise<{ error?: string; disconnected?: boolean }> {
  const integrationKey = input.integrationKey.trim();
  const redirectUri = input.redirectUri.trim();
  if (integrationKey.length > 200) return { error: "That integration key is too long." };
  if ((input.secret?.length ?? 0) > 500) return { error: "That secret key is too long." };
  if (redirectUri) {
    try {
      const url = new URL(redirectUri);
      if (url.protocol !== "https:" && url.hostname !== "localhost") {
        return { error: "The redirect URI must be https (localhost may use http)." };
      }
    } catch {
      return { error: "That redirect URI is not a valid URL." };
    }
  }

  let credentialChanged = false;
  try {
    credentialChanged = saveDocusignSettings({
      integrationKey,
      secret: input.secret,
      environment: normalizeEnvironment(input.environment),
      redirectUri,
    }).credentialChanged;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The credentials could not be saved." };
  }

  let disconnected = false;
  if (credentialChanged && getDocusignConnectionSummary() != null) {
    disconnectDocusign();
    disconnected = true;
  }
  revalidatePath("/settings");
  return { disconnected };
}

/** Forgets the Settings credentials; an environment-configured deployment still works. */
export async function clearDocusignSettingsAction(): Promise<{ error?: string }> {
  if (getDocusignConnectionSummary() != null) disconnectDocusign();
  clearDocusignSettings();
  revalidatePath("/settings");
  return {};
}
