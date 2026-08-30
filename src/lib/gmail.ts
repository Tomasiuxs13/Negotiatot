import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import {
  deleteGmailConnection,
  findPartnerByEmail,
  getGmailConnection,
  getInboundEmail,
  getPartnerDeals,
  markGmailSync,
  saveGmailConnection,
  saveInboundEmail,
  updateGmailTokens,
} from "./db";
import { normalizeEmail } from "./creator-identity";
import type { GmailConnectionSummary, InboxMatchKind } from "./email-inbox";
import { TERMINAL_STAGES } from "./types";
import { gmailHeader, gmailMessageText, gmailSender, type GmailPayload } from "./gmail-parser";

export { gmailMessageText, gmailSender } from "./gmail-parser";

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_SCOPES = ["openid", "email", GMAIL_READONLY_SCOPE];
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

interface GmailConfig {
  clientId: string;
  clientSecret: string;
  tokenEncryptionKey: string;
  redirectUri: string;
}

interface StoredGmailTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface GmailMessage {
  id: string;
  threadId?: string;
  internalDate?: string;
  payload?: GmailPayload;
}

function config(origin: string): GmailConfig | null {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const tokenEncryptionKey = process.env.GMAIL_TOKEN_ENCRYPTION_KEY?.trim();
  if (!clientId || !clientSecret || !tokenEncryptionKey) return null;
  return {
    clientId,
    clientSecret,
    tokenEncryptionKey,
    redirectUri:
      process.env.GMAIL_REDIRECT_URI?.trim() ||
      `${origin.replace(/\/$/, "")}/api/integrations/gmail/callback`,
  };
}

export function gmailSetupStatus(origin: string): { configured: boolean; redirectUri: string; missing: string[] } {
  const configured = config(origin);
  const missing = [
    !process.env.GMAIL_CLIENT_ID?.trim() ? "GMAIL_CLIENT_ID" : null,
    !process.env.GMAIL_CLIENT_SECRET?.trim() ? "GMAIL_CLIENT_SECRET" : null,
    !process.env.GMAIL_TOKEN_ENCRYPTION_KEY?.trim() ? "GMAIL_TOKEN_ENCRYPTION_KEY" : null,
  ].filter((value): value is string => value != null);
  return {
    configured: Boolean(configured),
    redirectUri: configured?.redirectUri ?? `${origin.replace(/\/$/, "")}/api/integrations/gmail/callback`,
    missing,
  };
}

export function getGmailConnectionSummary(): GmailConnectionSummary | null {
  const connection = getGmailConnection();
  if (!connection) return null;
  return {
    accountEmail: connection.accountEmail,
    connectedAt: connection.connectedAt,
    lastSyncAt: connection.lastSyncAt,
    lastError: connection.lastError,
  };
}

function keyFromSecret(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function encryptTokens(tokens: StoredGmailTokens, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(tokens), "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

function decryptTokens(value: string, secret: string): StoredGmailTokens {
  const [iv, tag, ciphertext] = value.split(".");
  if (!iv || !tag || !ciphertext) throw new Error("Gmail credentials are unreadable. Reconnect the mailbox.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(secret), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plain = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(plain) as StoredGmailTokens;
    if (!parsed.accessToken || !parsed.refreshToken || !Number.isFinite(parsed.expiresAt)) throw new Error("Invalid token payload");
    return parsed;
  } catch {
    throw new Error("Gmail credentials are unreadable. Reconnect the mailbox.");
  }
}

function requiredConfig(origin: string): GmailConfig {
  const value = config(origin);
  if (!value) throw new Error("Gmail is not configured. Add the three Gmail variables in Settings first.");
  return value;
}

async function tokenRequest(params: URLSearchParams) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
    cache: "no-store",
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok || typeof payload.access_token !== "string") {
    throw new Error(typeof payload.error_description === "string" ? payload.error_description : "Google could not authorize Gmail access.");
  }
  return payload as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
}

export function gmailAuthorizationUrl(origin: string, state: string): string {
  const value = requiredConfig(origin);
  const params = new URLSearchParams({
    client_id: value.clientId,
    redirect_uri: value.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

export async function completeGmailAuthorization(origin: string, code: string) {
  const value = requiredConfig(origin);
  const token = await tokenRequest(
    new URLSearchParams({
      code,
      client_id: value.clientId,
      client_secret: value.clientSecret,
      redirect_uri: value.redirectUri,
      grant_type: "authorization_code",
    })
  );
  if (!token.refresh_token) {
    throw new Error("Google did not return an offline Gmail connection. Try connecting again and approve access.");
  }
  const grantedScopes = new Set((token.scope ?? "").split(/\s+/).filter(Boolean));
  if (!grantedScopes.has(GMAIL_READONLY_SCOPE)) {
    throw new Error("Google did not grant the required read-only Gmail permission.");
  }
  const profile = await fetch(`${GMAIL_API}/profile`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: "no-store",
  });
  const payload = (await profile.json()) as { emailAddress?: string };
  const accountEmail = normalizeEmail(payload.emailAddress);
  if (!profile.ok || !accountEmail) throw new Error("Google did not return a valid mailbox address.");
  saveGmailConnection({
    accountEmail,
    encryptedTokens: encryptTokens(
      {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
      },
      value.tokenEncryptionKey
    ),
    scopes: token.scope ?? GMAIL_SCOPES.join(" "),
  });
}

async function accessToken(origin: string): Promise<string> {
  const value = requiredConfig(origin);
  const connection = getGmailConnection();
  if (!connection) throw new Error("Connect Gmail before syncing your inbox.");
  const stored = decryptTokens(connection.encrypted_tokens, value.tokenEncryptionKey);
  if (stored.expiresAt > Date.now() + 60_000) return stored.accessToken;
  const refreshed = await tokenRequest(
    new URLSearchParams({
      client_id: value.clientId,
      client_secret: value.clientSecret,
      refresh_token: stored.refreshToken,
      grant_type: "refresh_token",
    })
  );
  const next = {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? stored.refreshToken,
    expiresAt: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
  };
  updateGmailTokens(encryptTokens(next, value.tokenEncryptionKey));
  return next.accessToken;
}

async function gmailJson<T>(token: string, url: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const payload = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || "Gmail could not read the inbox.");
  return payload;
}

export async function syncGmailInbox(origin: string): Promise<{ added: number; matched: number; unmatched: number }> {
  try {
    const token = await accessToken(origin);
    const query = new URLSearchParams({ labelIds: "INBOX", q: "in:inbox newer_than:30d", maxResults: "50" });
    const list = await gmailJson<{ messages?: { id: string; threadId?: string }[] }>(token, `${GMAIL_API}/messages?${query}`);
    let added = 0;
    let matched = 0;
    let unmatched = 0;
    for (const message of list.messages ?? []) {
      if (getInboundEmail("gmail", message.id)) continue;
      const full = await gmailJson<GmailMessage>(token, `${GMAIL_API}/messages/${encodeURIComponent(message.id)}?format=full`);
      const sender = gmailSender(gmailHeader(full.payload, "From"));
      const partner = sender.email ? findPartnerByEmail(sender.email) : undefined;
      const liveDeals = partner
        ? getPartnerDeals(partner.id).filter((deal) => !TERMINAL_STAGES.includes(deal.stage))
        : [];
      const dealId = liveDeals.length === 1 ? liveDeals[0].id : null;
      const matchKind: InboxMatchKind = dealId ? "deal" : partner ? "partner_only" : "unmatched";
      const internalDate = Number(full.internalDate);
      saveInboundEmail({
        provider: "gmail",
        providerMessageId: full.id,
        providerThreadId: full.threadId ?? message.threadId ?? null,
        fromEmail: sender.email,
        fromName: sender.name,
        subject: gmailHeader(full.payload, "Subject"),
        body: gmailMessageText(full.payload) || "(No readable plain-text message body.)",
        receivedAt: Number.isFinite(internalDate) ? new Date(internalDate).toISOString() : new Date().toISOString(),
        partnerId: partner?.id ?? null,
        dealId,
        matchKind,
      });
      added += 1;
      if (dealId) matched += 1;
      else unmatched += 1;
    }
    markGmailSync({});
    return { added, matched, unmatched };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Inbox sync failed.";
    markGmailSync({ error: message });
    throw new Error(message);
  }
}

export async function disconnectGmail(origin: string) {
  const value = config(origin);
  const connection = getGmailConnection();
  if (value && connection) {
    try {
      const tokens = decryptTokens(connection.encrypted_tokens, value.tokenEncryptionKey);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokens.refreshToken)}`, {
        method: "POST",
        cache: "no-store",
      });
    } catch {
      // Local removal still prevents this app from accessing the mailbox if Google is unavailable.
    }
  }
  deleteGmailConnection();
}
