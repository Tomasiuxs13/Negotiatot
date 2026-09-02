import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { contractHasSignatureAnchor, SIGNATURE_ANCHOR } from "./contract-template";
import {
  createEsignEnvelope,
  disconnectEsign,
  getEsignConnection,
  getEsignEnvelope,
  markEsignError,
  saveEsignConnection,
  updateEsignEnvelope,
  updateEsignTokens,
  type EsignEnvelope,
} from "./db";

/**
 * DocuSign e-signature, wired the same way as the Gmail mailbox: a user-owned OAuth
 * connection whose refresh token is encrypted at rest, never a service account and never
 * a password held by the app.
 *
 * The integration deliberately stops at the envelope. When DocuSign reports an envelope
 * complete, the signed PDF is downloaded and filed through the existing contract upload
 * path — so parsing, the rights check and confirmation behave identically whether the
 * signature came from DocuSign or from a scan someone emailed back. Nothing downstream
 * knows or cares which.
 */

const DEMO_ACCOUNT_HOST = "https://account-d.docusign.com";
const PROD_ACCOUNT_HOST = "https://account.docusign.com";

/** `signature` creates envelopes; `extended` is what returns a refresh token. */
const SCOPES = ["signature", "extended"];

export interface DocusignConfig {
  integrationKey: string;
  secretKey: string;
  tokenEncryptionKey: string;
  accountHost: string;
  redirectUri: string;
}

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

function config(origin: string): DocusignConfig | null {
  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY?.trim();
  const secretKey = process.env.DOCUSIGN_SECRET_KEY?.trim();
  const tokenEncryptionKey = process.env.DOCUSIGN_TOKEN_ENCRYPTION_KEY?.trim();
  if (!integrationKey || !secretKey || !tokenEncryptionKey) return null;
  return {
    integrationKey,
    secretKey,
    tokenEncryptionKey,
    // Demo by default: sending real envelopes to real creators is not something a
    // missing environment variable should switch on.
    accountHost:
      process.env.DOCUSIGN_ENV?.trim().toLowerCase() === "production"
        ? PROD_ACCOUNT_HOST
        : DEMO_ACCOUNT_HOST,
    redirectUri:
      process.env.DOCUSIGN_REDIRECT_URI?.trim() ||
      `${origin.replace(/\/$/, "")}/api/integrations/docusign/callback`,
  };
}

export function docusignSetupStatus(origin: string): {
  configured: boolean;
  redirectUri: string;
  missing: string[];
  environment: "demo" | "production";
} {
  const value = config(origin);
  const missing = [
    !process.env.DOCUSIGN_INTEGRATION_KEY?.trim() ? "DOCUSIGN_INTEGRATION_KEY" : null,
    !process.env.DOCUSIGN_SECRET_KEY?.trim() ? "DOCUSIGN_SECRET_KEY" : null,
    !process.env.DOCUSIGN_TOKEN_ENCRYPTION_KEY?.trim() ? "DOCUSIGN_TOKEN_ENCRYPTION_KEY" : null,
  ].filter((v): v is string => v != null);
  return {
    configured: Boolean(value),
    redirectUri: value?.redirectUri ?? `${origin.replace(/\/$/, "")}/api/integrations/docusign/callback`,
    missing,
    environment: process.env.DOCUSIGN_ENV?.trim().toLowerCase() === "production" ? "production" : "demo",
  };
}

export interface DocusignConnectionSummary {
  accountName: string;
  accountId: string;
  connectedAt: string;
  lastError: string | null;
}

export function getDocusignConnectionSummary(): DocusignConnectionSummary | null {
  const row = getEsignConnection();
  if (!row) return null;
  return {
    accountName: row.accountName,
    accountId: row.accountId,
    connectedAt: row.connectedAt,
    lastError: row.lastError,
  };
}

export function disconnectDocusign() {
  disconnectEsign();
}

// ---------------------------------------------------------------------------------------
// Token handling — same shape as gmail.ts, deliberately
// ---------------------------------------------------------------------------------------

function keyFromSecret(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function encryptTokens(tokens: StoredTokens, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(tokens), "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

function decryptTokens(value: string, secret: string): StoredTokens {
  const [iv, tag, ciphertext] = value.split(".");
  if (!iv || !tag || !ciphertext) throw new Error("DocuSign credentials are unreadable. Reconnect the account.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(secret), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plain = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(plain) as StoredTokens;
    if (!parsed.accessToken || !parsed.refreshToken || !Number.isFinite(parsed.expiresAt)) {
      throw new Error("Invalid token payload");
    }
    return parsed;
  } catch {
    throw new Error("DocuSign credentials are unreadable. Reconnect the account.");
  }
}

function requiredConfig(origin: string): DocusignConfig {
  const value = config(origin);
  if (!value) throw new Error("DocuSign is not configured. Add its environment variables first.");
  return value;
}

function basicAuth(value: DocusignConfig): string {
  return Buffer.from(`${value.integrationKey}:${value.secretKey}`).toString("base64");
}

async function tokenRequest(value: DocusignConfig, body: URLSearchParams) {
  const response = await fetch(`${value.accountHost}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth(value)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof payload.access_token !== "string") {
    throw new Error(
      typeof payload.error_description === "string"
        ? payload.error_description
        : "DocuSign could not authorize this account."
    );
  }
  return payload as { access_token: string; refresh_token?: string; expires_in?: number };
}

export function docusignAuthorizationUrl(origin: string, state: string): string {
  const value = requiredConfig(origin);
  const params = new URLSearchParams({
    response_type: "code",
    scope: SCOPES.join(" "),
    client_id: value.integrationKey,
    redirect_uri: value.redirectUri,
    state,
  });
  return `${value.accountHost}/oauth/auth?${params.toString()}`;
}

interface UserInfoAccount {
  account_id: string;
  account_name: string;
  base_uri: string;
  is_default: boolean;
}

async function userInfo(value: DocusignConfig, accessToken: string): Promise<UserInfoAccount> {
  const response = await fetch(`${value.accountHost}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("DocuSign did not return the account for this login.");
  const payload = (await response.json()) as { accounts?: UserInfoAccount[] };
  const accounts = payload.accounts ?? [];
  const account = accounts.find((a) => a.is_default) ?? accounts[0];
  if (!account) throw new Error("This DocuSign login has no account attached to it.");
  return account;
}

export async function completeDocusignAuthorization(origin: string, code: string): Promise<void> {
  const value = requiredConfig(origin);
  const token = await tokenRequest(
    value,
    new URLSearchParams({ grant_type: "authorization_code", code })
  );
  if (!token.refresh_token) {
    throw new Error("DocuSign returned no refresh token — the integration needs the `extended` scope.");
  }
  const account = await userInfo(value, token.access_token);
  saveEsignConnection({
    accountName: account.account_name,
    accountId: account.account_id,
    baseUri: account.base_uri,
    encryptedTokens: encryptTokens(
      {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
      },
      value.tokenEncryptionKey
    ),
  });
}

/** A valid access token, refreshed a minute early so a slow request cannot expire mid-flight. */
async function accessToken(origin: string): Promise<{ token: string; apiBase: string }> {
  const value = requiredConfig(origin);
  const connection = getEsignConnection();
  if (!connection) throw new Error("DocuSign is not connected. Connect it in Settings.");
  const stored = decryptTokens(connection.encrypted_tokens, value.tokenEncryptionKey);
  const apiBase = `${connection.baseUri}/restapi/v2.1/accounts/${connection.accountId}`;

  if (stored.expiresAt > Date.now() + 60_000) return { token: stored.accessToken, apiBase };

  const refreshed = await tokenRequest(
    value,
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: stored.refreshToken })
  );
  const next: StoredTokens = {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? stored.refreshToken,
    expiresAt: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
  };
  updateEsignTokens(encryptTokens(next, value.tokenEncryptionKey));
  return { token: next.accessToken, apiBase };
}

async function api(origin: string, path: string, init?: RequestInit): Promise<Response> {
  const { token, apiBase } = await accessToken(origin);
  return fetch(`${apiBase}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    cache: "no-store",
  });
}

// ---------------------------------------------------------------------------------------
// Envelopes
// ---------------------------------------------------------------------------------------

export interface SendResult {
  envelope: EsignEnvelope;
}

export async function sendForSignature(params: {
  origin: string;
  dealId: number;
  body: string;
  subject: string;
  recipientName: string;
  recipientEmail: string;
}): Promise<SendResult> {
  if (!contractHasSignatureAnchor(params.body)) {
    throw new Error(
      `The contract has no "${SIGNATURE_ANCHOR}" line, so there is nowhere to place the signature. Add one and regenerate.`
    );
  }
  const response = await api(params.origin, "/envelopes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      emailSubject: params.subject,
      status: "sent",
      documents: [
        {
          documentId: "1",
          name: "Collaboration agreement",
          fileExtension: "txt",
          documentBase64: Buffer.from(params.body, "utf8").toString("base64"),
        },
      ],
      recipients: {
        signers: [
          {
            recipientId: "1",
            routingOrder: "1",
            name: params.recipientName,
            email: params.recipientEmail,
            tabs: {
              signHereTabs: [
                {
                  anchorString: SIGNATURE_ANCHOR,
                  anchorUnits: "pixels",
                  anchorXOffset: "150",
                  anchorYOffset: "-6",
                },
              ],
            },
          },
        ],
      },
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof payload.envelopeId !== "string") {
    const message =
      typeof payload.message === "string" ? payload.message : "DocuSign refused the envelope.";
    markEsignError(message);
    throw new Error(message);
  }
  markEsignError(null);
  return {
    envelope: createEsignEnvelope({
      dealId: params.dealId,
      envelopeId: payload.envelopeId,
      recipientEmail: params.recipientEmail,
      recipientName: params.recipientName,
    }),
  };
}

export interface EnvelopeStatus {
  status: string;
  completedAt: string | null;
  /** The signed PDF, present only once DocuSign reports the envelope complete. */
  signedPdf: Buffer | null;
}

export async function fetchEnvelopeStatus(origin: string, envelopeId: string): Promise<EnvelopeStatus> {
  const response = await api(origin, `/envelopes/${encodeURIComponent(envelopeId)}`);
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof payload.status !== "string") {
    throw new Error(
      typeof payload.message === "string" ? payload.message : "DocuSign did not return the envelope."
    );
  }
  const status = payload.status;
  const completedAt = typeof payload.completedDateTime === "string" ? payload.completedDateTime : null;
  if (status !== "completed") return { status, completedAt, signedPdf: null };

  const pdf = await api(origin, `/envelopes/${encodeURIComponent(envelopeId)}/documents/combined`);
  if (!pdf.ok) throw new Error("The envelope is signed but its PDF could not be downloaded.");
  return { status, completedAt, signedPdf: Buffer.from(await pdf.arrayBuffer()) };
}

export { getEsignEnvelope, updateEsignEnvelope };
export { contractHasSignatureAnchor, SIGNATURE_ANCHOR };
