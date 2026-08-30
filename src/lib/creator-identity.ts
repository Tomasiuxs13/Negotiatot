import type { Platform } from "./types";

/**
 * Normalising an identifier once keeps imports, manual entry and future mailbox matching
 * from treating `https://instagram.com/Creator/` and `@creator` as different people.
 * We retain the original value for display; these values are comparison keys only.
 */
export function normalizeEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function normalizeProfileUrl(value: string | null | undefined): string | null {
  const raw = value?.trim() ?? "";
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^@/, "")}`;
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "").toLowerCase();
    return path ? `${host}${path}` : host;
  } catch {
    return null;
  }
}

export function normalizeHandle(value: string | null | undefined): string | null {
  const handle = value?.trim().replace(/^@/, "").toLowerCase() ?? "";
  return handle || null;
}

export function normalizeCreatorName(value: string | null | undefined): string | null {
  const name = (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return name || null;
}

const PLATFORM_ALIASES: Record<string, Platform> = {
  youtube: "youtube",
  yt: "youtube",
  instagram: "instagram",
  ig: "instagram",
  tiktok: "tiktok",
  tik: "tiktok",
  facebook: "facebook",
  fb: "facebook",
};

/** The platforms Counterpart can currently price and move through a deal workflow. */
export function platformFromValue(value: string | null | undefined): Platform | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (PLATFORM_ALIASES[raw]) return PLATFORM_ALIASES[raw];
  const url = normalizeProfileUrl(value);
  if (!url) return null;
  if (url.startsWith("youtube.com/") || url.startsWith("youtu.be/")) return "youtube";
  if (url.startsWith("instagram.com/")) return "instagram";
  if (url.startsWith("tiktok.com/")) return "tiktok";
  if (url.startsWith("facebook.com/")) return "facebook";
  return null;
}

export function handleFromProfileUrl(value: string | null | undefined): string | null {
  const normalized = normalizeProfileUrl(value);
  if (!normalized) return null;
  const [, ...parts] = normalized.split("/");
  if (parts.length === 0) return null;
  const last = parts.at(-1);
  if (!last || ["channel", "user", "c", "@"].includes(last)) return null;
  return normalizeHandle(last);
}
