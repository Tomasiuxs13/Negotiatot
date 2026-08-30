"use server";

import { revalidatePath } from "next/cache";
import {
  createCreatorImportBatch,
  createDeal,
  createPartner,
  enrichPartnerFromImport,
  findPartnerByEmail,
  findPartnerByProfileUrl,
  findPartnerBySourceRecord,
  getPartnerDeals,
  getPartners,
  inTransaction,
  recordCreatorImport,
} from "@/lib/db";
import {
  candidateIdentityLabel,
  candidateIsUsable,
  IMPORT_SOURCES,
  sameNormalisedName,
  type CreatorImportCandidate,
  type CreatorImportPreviewRow,
  type ImportSource,
} from "@/lib/creator-import";
import { TERMINAL_STAGES, type Stage } from "@/lib/types";
import { normalizeEmail, normalizeHandle, normalizeProfileUrl } from "@/lib/creator-identity";

const MAX_IMPORT_ROWS = 500;

function validSource(value: unknown): value is ImportSource {
  return IMPORT_SOURCES.some((source) => source.key === value);
}

function compactRaw(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 40)
      .map(([key, cell]) => [key.slice(0, 120), String(cell ?? "").slice(0, 500)])
  );
}

/** Server actions are public mutation endpoints: accept a narrow, bounded candidate shape only. */
function safeCandidate(value: unknown): CreatorImportCandidate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const source = row.source;
  const string = (key: string) => (typeof row[key] === "string" ? row[key].trim().slice(0, 500) : null);
  const number = (key: string) =>
    typeof row[key] === "number" && Number.isFinite(row[key]) && row[key] >= 0 ? row[key] : null;
  const platform = ["youtube", "instagram", "tiktok", "facebook"].includes(String(row.platform))
    ? (row.platform as CreatorImportCandidate["platform"])
    : null;
  if (!validSource(source) || !Number.isInteger(row.rowNumber) || Number(row.rowNumber) < 1) return null;
  return {
    rowNumber: Number(row.rowNumber),
    source,
    sourceRecordId: string("sourceRecordId"),
    name: string("name"),
    email: normalizeEmail(string("email")),
    profileUrl: normalizeProfileUrl(string("profileUrl")),
    platform,
    platformLabel: string("platformLabel"),
    handle: normalizeHandle(string("handle")),
    followers: number("followers"),
    avgViews: number("avgViews"),
    engagementRate: number("engagementRate"),
    sourceStatus: string("sourceStatus"),
    raw: compactRaw(row.raw),
  };
}

function latestLiveDeal(partnerId: number) {
  const live = getPartnerDeals(partnerId).find((deal) => !TERMINAL_STAGES.includes(deal.stage));
  return live
    ? { id: live.id, stage: live.stage, statusLabel: live.status_label }
    : null;
}

function previewCandidate(candidate: CreatorImportCandidate): CreatorImportPreviewRow {
  if (!candidateIsUsable(candidate)) {
    return { candidate, kind: "invalid", reason: "No name, email, profile URL or handle was found.", partner: null, liveDeal: null };
  }

  const exact =
    (candidate.sourceRecordId
      ? findPartnerBySourceRecord(candidate.source, candidate.sourceRecordId)
      : undefined) ??
    (candidate.profileUrl ? findPartnerByProfileUrl(candidate.profileUrl) : undefined) ??
    (candidate.email ? findPartnerByEmail(candidate.email) : undefined);
  if (exact) {
    return {
      candidate,
      kind: "exact",
      reason: candidate.sourceRecordId
        ? "Matched a saved provider identity."
        : candidate.profileUrl
          ? "Matched a profile URL."
          : "Matched an email address.",
      partner: { id: exact.id, name: exact.name, email: exact.email },
      liveDeal: latestLiveDeal(exact.id),
    };
  }

  const byName = candidate.name
    ? getPartners(true).filter((partner) => sameNormalisedName(partner.name, candidate.name))
    : [];
  if (byName.length === 1) {
    const partner = byName[0];
    return {
      candidate,
      kind: "name_match",
      reason: "Possible name match — confirm it in Partners before merging evidence.",
      partner: { id: partner.id, name: partner.name, email: partner.email },
      liveDeal: latestLiveDeal(partner.id),
    };
  }
  return { candidate, kind: "new", reason: "No existing Counterpart record found.", partner: null, liveDeal: null };
}

export async function previewCreatorImportAction(
  rows: unknown
): Promise<{ rows?: CreatorImportPreviewRow[]; error?: string }> {
  if (!Array.isArray(rows)) return { error: "Import rows were invalid." };
  if (rows.length === 0) return { error: "Choose a file or add a creator first." };
  if (rows.length > MAX_IMPORT_ROWS) return { error: `Import at most ${MAX_IMPORT_ROWS} rows at a time.` };
  const candidates = rows.map(safeCandidate).filter((row): row is CreatorImportCandidate => row != null);
  if (candidates.length !== rows.length) return { error: "One or more imported rows were invalid." };
  return { rows: candidates.map(previewCandidate) };
}

export async function commitCreatorImportAction(input: {
  rows: unknown;
  source: ImportSource;
  filename?: string | null;
  newRecordStage: "partner" | "lead" | "contacted";
}): Promise<{
  createdPartners?: number;
  createdDeals?: number;
  enriched?: number;
  skipped?: number;
  error?: string;
}> {
  if (!validSource(input.source)) return { error: "Unknown import source." };
  if (!Array.isArray(input.rows) || input.rows.length === 0) return { error: "Choose rows to import." };
  if (input.rows.length > MAX_IMPORT_ROWS) return { error: `Import at most ${MAX_IMPORT_ROWS} rows at a time.` };
  if (!["partner", "lead", "contacted"].includes(input.newRecordStage)) {
    return { error: "Choose how new creators should enter Counterpart." };
  }
  const candidates = input.rows.map(safeCandidate).filter((row): row is CreatorImportCandidate => row != null);
  if (candidates.length !== input.rows.length) return { error: "One or more selected rows were invalid." };
  if (candidates.some((candidate) => candidate.source !== input.source)) {
    return { error: "Selected rows do not match the import source." };
  }

  let batchId = 0;
  let createdPartners = 0;
  let createdDeals = 0;
  let enriched = 0;
  let skipped = 0;

  const write = () => {
    batchId = createCreatorImportBatch(input.source, input.filename ?? null, candidates.length);
    for (const candidate of candidates) {
      const preview = previewCandidate(candidate);
      if (preview.kind === "invalid" || preview.kind === "name_match") {
        skipped += 1;
        recordCreatorImport({
          batchId,
          rowNumber: candidate.rowNumber,
          sourceRecordId: candidate.sourceRecordId,
          result: preview.kind === "invalid" ? "skipped_invalid" : "skipped_name_match",
          raw: candidate.raw,
        });
        continue;
      }

      let partnerId: number;
      let dealId: number | null = null;
      if (preview.partner) {
        partnerId = preview.partner.id;
        enrichPartnerFromImport(partnerId, candidate);
        enriched += 1;
      } else {
        partnerId = createPartner({
          name: candidateIdentityLabel(candidate),
          email: candidate.email,
          tags: ["imported", candidate.source],
        });
        enrichPartnerFromImport(partnerId, candidate);
        createdPartners += 1;
        if (input.newRecordStage !== "partner" && candidate.platform) {
          const stage = input.newRecordStage as Extract<Stage, "lead" | "contacted">;
          dealId = createDeal({
            creator: candidateIdentityLabel(candidate),
            platforms: [candidate.platform],
            partnerId,
            stage,
            status_label: stage === "contacted" ? "Reached out · awaiting reply" : "New lead",
            avg_views: candidate.avgViews,
            engagement_rate: candidate.engagementRate,
          });
          createdDeals += 1;
        }
      }
      recordCreatorImport({
        batchId,
        rowNumber: candidate.rowNumber,
        sourceRecordId: candidate.sourceRecordId,
        result: dealId ? `created_${input.newRecordStage}` : preview.partner ? "matched_enriched" : "created_partner",
        partnerId,
        dealId,
        raw: candidate.raw,
      });
    }
  };
  // All record writes belong together: an import should never leave a half-created row after
  // a malformed value later in the same selected batch.
  inTransaction(write);

  revalidatePath("/");
  revalidatePath("/imports");
  revalidatePath("/partners");
  revalidatePath("/pipeline");
  return { createdPartners, createdDeals, enriched, skipped };
}
