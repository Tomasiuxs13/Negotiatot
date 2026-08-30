import type { Platform, Stage } from "./types";
import {
  handleFromProfileUrl,
  normalizeCreatorName,
  normalizeEmail,
  normalizeHandle,
  normalizeProfileUrl,
  platformFromValue,
} from "./creator-identity";

export type ImportSource = "modash" | "hypeauditor" | "spreadsheet" | "manual";

export const IMPORT_SOURCES: { key: ImportSource; label: string; description: string }[] = [
  { key: "modash", label: "Modash", description: "A list or search export" },
  { key: "hypeauditor", label: "HypeAuditor", description: "A list or discovery export" },
  { key: "spreadsheet", label: "Generic file", description: "Any CSV, TSV or XLSX" },
  { key: "manual", label: "Manual", description: "Add a lightweight creator record" },
];

export type ImportField =
  | "name"
  | "email"
  | "profileUrl"
  | "platform"
  | "handle"
  | "followers"
  | "avgViews"
  | "engagementRate"
  | "externalId"
  | "sourceStatus";

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  name: "Creator name",
  email: "Email",
  profileUrl: "Profile URL",
  platform: "Social platform",
  handle: "Handle / username",
  followers: "Followers",
  avgViews: "Average views",
  engagementRate: "Engagement rate",
  externalId: "Provider record ID",
  sourceStatus: "Provider status",
};

export interface CreatorImportCandidate {
  rowNumber: number;
  source: ImportSource;
  sourceRecordId: string | null;
  name: string | null;
  email: string | null;
  profileUrl: string | null;
  platform: Platform | null;
  platformLabel: string | null;
  handle: string | null;
  followers: number | null;
  avgViews: number | null;
  engagementRate: number | null;
  sourceStatus: string | null;
  /** A compact, user-visible raw record, retained with the import for auditability. */
  raw: Record<string, string>;
}

export interface ImportMatchPartner {
  id: number;
  name: string;
  email: string | null;
}

export interface ImportMatchDeal {
  id: number;
  stage: Stage;
  statusLabel: string | null;
}

export type ImportMatchKind = "exact" | "name_match" | "new" | "invalid";

export interface CreatorImportPreviewRow {
  candidate: CreatorImportCandidate;
  kind: ImportMatchKind;
  reason: string;
  partner: ImportMatchPartner | null;
  liveDeal: ImportMatchDeal | null;
}

export interface HeaderMapping {
  [field: string]: string | null;
}

const HEADER_ALIASES: Record<ImportField, string[]> = {
  name: ["creator", "creator name", "influencer", "influencer name", "name", "full name", "fullname", "channel name"],
  email: ["email", "emails", "contact email", "business email", "email address"],
  profileUrl: ["profile url", "profile link", "url", "channel url", "account url", "social url", "link"],
  platform: ["platform", "social platform", "social network", "network", "channel platform"],
  handle: ["handle", "username", "user name", "account", "channel handle"],
  followers: ["followers", "follower count", "followers count", "audience size"],
  avgViews: ["average views", "avg views", "avg. views", "views average", "average video views"],
  engagementRate: ["engagement rate", "engagement", "er", "er %"],
  externalId: ["id", "creator id", "influencer id", "profile id", "user id"],
  sourceStatus: ["status", "outreach status", "relationship status", "campaign status"],
};

function headerKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

/** Pre-fills a mapping but leaves every choice visible and editable before import. */
export function suggestHeaderMapping(headers: string[]): HeaderMapping {
  const keyed = new Map(headers.map((header) => [headerKey(header), header]));
  return Object.fromEntries(
    (Object.keys(HEADER_ALIASES) as ImportField[]).map((field) => [
      field,
      HEADER_ALIASES[field].map((alias) => keyed.get(alias)).find(Boolean) ?? null,
    ])
  );
}

export function detectImportSource(headers: string[], filename = ""): ImportSource {
  const joined = `${headers.join(" ")} ${filename}`.toLowerCase();
  if (/hypeauditor|audience quality score|\baqs\b/.test(joined)) return "hypeauditor";
  if (/modash|quality audience|creator email/.test(joined)) return "modash";
  return "spreadsheet";
}

function parseNumber(value: string | null | undefined): number | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const compact = raw.replace(/[$€£\s]/g, "");
  const abbreviated = compact.match(/^(\d+(?:[.,]\d+)?)([kKmM])$/);
  const unabridged = abbreviated ? abbreviated[1] : compact;
  // Exports vary by locale: 12,500; 12.500; 12,5 and 12.5 should all remain
  // readable. When both separators exist, the last one is the decimal separator.
  const lastComma = unabridged.lastIndexOf(",");
  const lastDot = unabridged.lastIndexOf(".");
  const numberText =
    lastComma >= 0 && lastDot >= 0
      ? lastComma > lastDot
        ? unabridged.replace(/\./g, "").replace(",", ".")
        : unabridged.replace(/,/g, "")
      : lastComma >= 0
        ? /,\d{1,2}$/.test(unabridged)
          ? unabridged.replace(",", ".")
          : unabridged.replace(/,/g, "")
        : lastDot >= 0 && /\.\d{3}$/.test(unabridged)
          ? unabridged.replace(/\./g, "")
          : unabridged;
  const multiplier = abbreviated?.[2].toLowerCase() === "m" ? 1_000_000 : abbreviated ? 1_000 : 1;
  const parsed = Number(numberText) * multiplier;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseRate(value: string | null | undefined): number | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const isPercent = raw.includes("%");
  const parsed = parseNumber(raw.replace(/%/g, ""));
  if (parsed == null) return null;
  return isPercent || parsed > 1 ? parsed : parsed * 100;
}

/** Turns mapped spreadsheet cells into a provider-neutral, validation-ready row. */
export function candidateFromRow(
  rowNumber: number,
  raw: Record<string, string>,
  mapping: HeaderMapping,
  source: ImportSource
): CreatorImportCandidate {
  const get = (field: ImportField) => {
    const header = mapping[field];
    return header ? raw[header]?.trim() || null : null;
  };
  const profileUrl = get("profileUrl");
  const platformValue = get("platform") ?? profileUrl;
  const platform = platformFromValue(platformValue);
  const rawName = get("name");
  const handle = normalizeHandle(get("handle")) ?? handleFromProfileUrl(profileUrl);

  return {
    rowNumber,
    source,
    sourceRecordId: get("externalId"),
    name: rawName?.trim() || handle || null,
    email: normalizeEmail(get("email")),
    profileUrl: normalizeProfileUrl(profileUrl),
    platform,
    platformLabel: platformValue?.trim() || null,
    handle,
    followers: parseNumber(get("followers")),
    avgViews: parseNumber(get("avgViews")),
    engagementRate: parseRate(get("engagementRate")),
    sourceStatus: get("sourceStatus"),
    raw,
  };
}

export function candidateIsUsable(candidate: CreatorImportCandidate): boolean {
  return Boolean(candidate.name || candidate.email || candidate.profileUrl || candidate.handle);
}

export function candidateIdentityLabel(candidate: CreatorImportCandidate): string {
  return candidate.name ?? candidate.handle ?? candidate.email ?? candidate.profileUrl ?? "Unnamed row";
}

export function sameNormalisedName(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeCreatorName(a);
  const right = normalizeCreatorName(b);
  return left != null && left === right;
}
