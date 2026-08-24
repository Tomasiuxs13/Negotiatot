"use server";

import { revalidatePath } from "next/cache";
import db from "@/lib/db";
import { getCampaign, getDeal, logUsage } from "@/lib/db";
import { getContentItems } from "@/lib/fulfillment";
import { parseRequirements } from "@/lib/brief-requirements";
import { changesFromCheck, changeRequestEmail } from "@/lib/review-email";
import { parseCheck } from "@/lib/brief-requirements";

/**
 * Hands the browser a signed target so the video uploads straight to fal.
 *
 * Only the signing needs the key, and it stays here; the bytes never pass through this
 * server. Guarded on type and size so a mistaken upload fails before anyone waits for
 * half a gigabyte to move.
 */
export async function signVideoUpload(
  fileName: string,
  contentType: string,
  sizeBytes: number
): Promise<{ uploadUrl?: string; fileUrl?: string; error?: string }> {
  const { signUpload } = await import("@/lib/transcribe");
  if (!/^(video|audio)\//.test(contentType)) {
    return { error: "That doesn't look like a video or audio file." };
  }
  if (sizeBytes > 2 * 1024 * 1024 * 1024) {
    return { error: "That file is over 2 GB — export a smaller version or upload the audio only." };
  }
  try {
    const { uploadUrl, fileUrl } = await signUpload({ fileName, contentType });
    return { uploadUrl, fileUrl };
  } catch (err) {
    console.error("signVideoUpload failed:", err);
    return { error: err instanceof Error ? err.message : "Could not start the upload." };
  }
}

/**
 * Transcribe a posted video and grade it against the campaign brief.
 *
 * The upload itself goes straight to fal from the creator's browser, so a 500MB mp4
 * never passes through this server; what arrives here is the resulting media URL.
 */
export async function runIntegrationCheck(
  contentItemId: number,
  mediaUrl: string
): Promise<{ error?: string }> {
  const { transcribe, foldForPrompt, hasFalKey } = await import("@/lib/transcribe");
  const { checkIntegration, MODEL, hasApiKey } = await import("@/lib/claude");
  const { getBrandProfile } = await import("@/lib/db");

  if (!hasFalKey()) return { error: "No FAL_KEY configured — add it to .env.local." };
  if (!hasApiKey()) return { error: "No Anthropic API key configured." };

  const item = db
    .prepare("SELECT * FROM content_items WHERE id = ?")
    .get(contentItemId) as { id: number; deal_id: number; title: string } | undefined;
  if (!item) return { error: "Content item not found." };

  const deal = getDeal(item.deal_id);
  if (!deal) return { error: "Deal not found." };

  const campaign = deal.campaign_id != null ? getCampaign(deal.campaign_id) : null;
  const reqs = parseRequirements(campaign?.brief_requirements);
  if (reqs.requirements.length === 0 && reqs.minIntegrationSeconds == null) {
    return {
      error:
        "This deal's campaign has no video requirements yet — read them from the brief in the Playbook first.",
    };
  }

  const brand = getBrandProfile() as Record<string, string> | null;
  const brandName = brand?.brandName || brand?.productName || undefined;

  try {
    // Prime the decoder with the names the check turns on, plus the exact phrases the
    // requirements look for — this is the cheapest accuracy win available.
    const primer = [brandName, ...reqs.requirements.flatMap((r) => r.phrases).slice(0, 30)]
      .filter(Boolean)
      .join(", ")
      .slice(0, 800);

    const transcript = await transcribe({ audioUrl: mediaUrl, prompt: primer });
    const folded = foldForPrompt(transcript.chunks);

    const result = await checkIntegration({
      requirements: reqs.requirements,
      minIntegrationSeconds: reqs.minIntegrationSeconds,
      transcript: folded || transcript.text,
      creator: deal.creator,
      brandName,
    });

    db.prepare(
      `UPDATE content_items
         SET transcript = ?, transcript_chunks = ?, check_result = ?,
             checked_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      transcript.text,
      JSON.stringify(transcript.chunks),
      JSON.stringify(result.check),
      contentItemId
    );

    logUsage(deal.id, "integration_check", MODEL, result.usage.inputTokens, result.usage.outputTokens);
    // The transcription and the check are both already persisted by this point, so a
    // revalidation problem is a stale screen, not a failed check — reporting it as an
    // error would send the manager to re-run a job that actually succeeded, and pay for
    // it twice.
    try {
      revalidatePath(`/deals/${deal.id}`);
      // The check result is what flips the Content board's next action from "run the
      // check" to "log the results", so that board has to hear about it too.
      revalidatePath("/content");
      revalidatePath("/");
    } catch (err) {
      console.error("revalidate after integration check failed:", err);
    }
    return {};
  } catch (err) {
    console.error("runIntegrationCheck failed:", err);
    return { error: err instanceof Error ? err.message : "The check could not be completed." };
  }
}

/**
 * The change-request email for a failed check, prefilled and editable.
 *
 * Generated but never sent, and never applied on its own: the manager reads it, edits
 * it, and only then sends the item back. A finding is a machine's reading of a machine's
 * transcript, and the last judgement before a creator is told they got something wrong
 * should be a person's.
 */
export async function draftCheckChangeRequest(
  contentItemId: number
): Promise<{ email?: string; error?: string }> {
  const item = db
    .prepare("SELECT * FROM content_items WHERE id = ?")
    .get(contentItemId) as
    | { id: number; deal_id: number; title: string; check_result: string | null; revision_round: number }
    | undefined;
  if (!item) return { error: "Content item not found." };

  const check = parseCheck(item.check_result);
  if (!check) return { error: "Run the check first." };

  const deal = getDeal(item.deal_id);
  if (!deal) return { error: "Deal not found." };
  const campaign = deal.campaign_id != null ? getCampaign(deal.campaign_id) : null;
  const reqs = parseRequirements(campaign?.brief_requirements);

  const changes = changesFromCheck({
    check,
    requirements: reqs.requirements,
    minIntegrationSeconds: reqs.minIntegrationSeconds,
  });
  if (!changes) return { error: "Nothing failed — there is nothing to ask for." };

  const { getBrandProfile } = await import("@/lib/db");
  const brand = getBrandProfile() as Record<string, string> | null;
  const publishDate = getContentItems(deal.id).find((c) => c.id === contentItemId)?.due_date ?? null;

  return {
    email: changeRequestEmail({
      creator: deal.creator,
      itemTitle: item.title,
      publishDate,
      revisionRound: item.revision_round,
      senderName: brand?.senderName || undefined,
      changes,
      // This path only ever runs on a live video — the check needs a posted URL.
      alreadyPosted: true,
    }),
  };
}
