import { normalizeEmail } from "./creator-identity";

export type InboxBucket = "priority" | "other" | "noise";

export function emailDomain(value: string | null | undefined): string | null {
  return normalizeEmail(value)?.split("@")[1] ?? null;
}

export function normalizeIgnoredDomains(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,;]+/) : [];
  return [
    ...new Set(
      entries
        .map((entry) => String(entry).trim().toLowerCase().replace(/^@/, ""))
        .filter((entry) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(entry))
    ),
  ];
}

export function inboxBucket(input: {
  senderEmail: string | null;
  accountEmail: string;
  ignoredDomains: string[];
  hasRelationshipMatch: boolean;
  labelIds?: string[];
  autoSubmitted?: string | null;
  precedence?: string | null;
  listUnsubscribe?: string | null;
}): InboxBucket {
  if (input.hasRelationshipMatch) return "priority";

  const sender = normalizeEmail(input.senderEmail);
  const domain = emailDomain(sender);
  const internalDomains = new Set([
    ...normalizeIgnoredDomains(input.ignoredDomains),
    ...normalizeIgnoredDomains([emailDomain(input.accountEmail)]),
  ]);
  if (domain && internalDomains.has(domain)) return "noise";

  const local = sender?.split("@")[0] ?? "";
  if (/^(?:no[._-]?reply|do[._-]?not[._-]?reply|mailer-daemon|postmaster|notifications?|security)$/i.test(local)) {
    return "noise";
  }
  if ((input.autoSubmitted ?? "").toLowerCase() !== "" && (input.autoSubmitted ?? "").toLowerCase() !== "no") {
    return "noise";
  }
  if (/^(?:bulk|junk|list)$/i.test(input.precedence?.trim() ?? "")) return "noise";
  if (input.listUnsubscribe?.trim()) return "noise";
  if (
    new Set(input.labelIds ?? []).has("CATEGORY_PROMOTIONS") ||
    new Set(input.labelIds ?? []).has("CATEGORY_SOCIAL") ||
    new Set(input.labelIds ?? []).has("CATEGORY_FORUMS")
  ) {
    return "noise";
  }
  return "other";
}
