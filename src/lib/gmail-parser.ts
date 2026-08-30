/** The small, pure part of Gmail parsing is isolated for test coverage and reuse. */
export interface GmailPayload {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPayload[];
  headers?: { name?: string; value?: string }[];
}

function decodeBody(data: string | undefined): string | null {
  if (!data) return null;
  try {
    return Buffer.from(data, "base64url").toString("utf8").replace(/\u0000/g, "").trim() || null;
  } catch {
    return null;
  }
}

function bodyForMime(payload: GmailPayload | undefined, wanted: "text/plain" | "text/html"): string | null {
  if (!payload) return null;
  if (payload.mimeType?.toLowerCase() === wanted) return decodeBody(payload.body?.data);
  for (const part of payload.parts ?? []) {
    const found = bodyForMime(part, wanted);
    if (found) return found;
  }
  return null;
}

function plainText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/p\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function gmailMessageText(payload: GmailPayload | undefined): string {
  return (bodyForMime(payload, "text/plain") ?? plainText(bodyForMime(payload, "text/html") ?? "")).slice(0, 40_000);
}

export function gmailSender(value: string | null): { email: string | null; name: string | null } {
  if (!value) return { email: null, name: null };
  const rawEmail = value.match(/<([^>]+)>/)?.[1] ?? value.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0];
  const email = rawEmail?.trim().toLowerCase();
  const validEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  const name = value
    .replace(/<[^>]+>/, "")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/, "")
    .trim()
    .replace(/^"|"$/g, "");
  return { email: validEmail, name: name || null };
}

export function gmailHeader(payload: GmailPayload | undefined, name: string): string | null {
  return payload?.headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value?.trim() || null;
}
