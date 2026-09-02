import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { contractHasSignatureAnchor, SIGNATURE_ANCHOR } from "./contract-template";
import {
  defaultRedirectUri,
  normalizeEnvironment,
  resolveDocusign,
  type DocusignEnvironment,
  type DocusignSettings,
} from "./docusign-config";
import {
  createEsignEnvelope,
  disconnectEsign,
  getEsignConnection,
  getEsignEnvelope,
  markEsignError,
  getSetting,
  saveEsignConnection,
  setSetting,
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

/** `signature` creates envelopes; `extended` is what returns a refresh token. */
const SCOPES = ["signature", "extended"];

/** The settings-table key holding what an operator entered in Settings. */
const SETTINGS_KEY = "docusign_config";

export interface DocusignConfig {
  integrationKey: string;
  secretKey: string;
  accountHost: string;
  redirectUri: string;
}

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/** What is written to the settings table. The secret is never stored in the clear. */
interface StoredDocusignSettings {
  integrationKey: string;
  secretCipher: string;
  environment: DocusignEnvironment;
  redirectUri: string;
}

/**
 * The key everything DocuSign is encrypted with.
 *
 * `DOCUSIGN_TOKEN_ENCRYPTION_KEY` if a deployment sets one, else the app password — which
 * production already requires, so credentials entered in Settings are encrypted at rest
 * without asking anyone to invent and deploy a second secret. The cost is stated plainly
 * in Settings: change the app password and DocuSign has to be reconnected, because what
 * was encrypted under the old one can no longer be read.
 */
function encryptionSecret(): string {
  const value =
    process.env.DOCUSIGN_TOKEN_ENCRYPTION_KEY?.trim() || process.env.COUNTERPART_PASSWORD?.trim();
  if (!value) {
    throw new Error(
      "No encryption key available. Set COUNTERPART_PASSWORD (or DOCUSIGN_TOKEN_ENCRYPTION_KEY) before storing DocuSign credentials."
    );
  }
  return value;
}

function readStoredSettings(): Partial<DocusignSettings> | null {
  const row = getSetting<StoredDocusignSettings>(SETTINGS_KEY);
  if (!row) return null;
  let secret = "";
  if (row.secretCipher) {
    try {
      secret = decryptString(row.secretCipher, encryptionSecret());
    } catch {
      // An unreadable secret is treated as absent rather than thrown: Settings must still
      // render so the operator can re-enter it, and the environment fallback still works.
      secret = "";
    }
  }
  return {
    integrationKey: row.integrationKey ?? "",
    secret,
    environment: normalizeEnvironment(row.environment),
    redirectUri: row.redirectUri ?? "",
  };
}

/** True when a secret is on file, even if it currently cannot be decrypted. */
function hasStoredSecret(): boolean {
  return Boolean(getSetting<StoredDocusignSettings>(SETTINGS_KEY)?.secretCipher);
}

function envVars() {
  return {
    integrationKey: process.env.DOCUSIGN_INTEGRATION_KEY,
    secret: process.env.DOCUSIGN_SECRET_KEY,
    environment: process.env.DOCUSIGN_ENV,
    redirectUri: process.env.DOCUSIGN_REDIRECT_URI,
  };
}

function config(origin: string): DocusignConfig | null {
  const resolved = resolveDocusign({ stored: readStoredSettings(), env: envVars(), origin });
  if (!resolved.configured) return null;
  return {
    integrationKey: resolved.integrationKey,
    secretKey: resolved.secret,
    accountHost: resolved.accountHost,
    redirectUri: resolved.redirectUri,
  };
}

export interface DocusignSetupStatus {
  configured: boolean;
  redirectUri: string;
  missing: string[];
  environment: DocusignEnvironment;
  /** Which source the credentials in effect came from. */
  source: "settings" | "environment" | "none";
  /** The integration key in effect, for display. The secret is never sent to the client. */
  integrationKey: string;
  /** Whether a secret is saved in Settings, so the form can show it without revealing it. */
  secretStored: boolean;
  /** A redirect URI pinned in Settings or the environment, as opposed to derived. */
  redirectUriIsPinned: boolean;
  /** Set when credentials cannot be stored at all, e.g. no app password configured. */
  encryptionError: string | null;
}

export function docusignSetupStatus(origin: string): DocusignSetupStatus {
  const resolved = resolveDocusign({ stored: readStoredSettings(), env: envVars(), origin });
  let encryptionError: string | null = null;
  try {
    encryptionSecret();
  } catch (error) {
    encryptionError = error instanceof Error ? error.message : "No encryption key available.";
  }
  return {
    configured: resolved.configured,
    redirectUri: resolved.redirectUri,
    missing: resolved.missing,
    environment: resolved.environment,
    source: resolved.source,
    integrationKey: resolved.integrationKey,
    secretStored: hasStoredSecret(),
    redirectUriIsPinned: resolved.redirectUri !== defaultRedirectUri(origin),
    encryptionError,
  };
}

/**
 * Saves what an operator entered in Settings.
 *
 * An omitted secret keeps the one already stored, so editing the environment or the
 * redirect URI does not require retyping a credential the form never shows back.
 */
export function saveDocusignSettings(input: {
  integrationKey: string;
  /** Undefined keeps the stored secret; "" clears it. */
  secret?: string;
  environment: DocusignEnvironment;
  redirectUri: string;
}): { credentialChanged: boolean } {
  const existing = getSetting<StoredDocusignSettings>(SETTINGS_KEY);
  let secretCipher = existing?.secretCipher ?? "";
  if (input.secret !== undefined) {
    secretCipher = input.secret.trim()
      ? encryptString(input.secret.trim(), encryptionSecret())
      : "";
  }
  const integrationKey = input.integrationKey.trim();
  // Compared against what was STORED, not what is in effect: a deployment can have
  // environment credentials in play, and typing the same key into Settings for the first
  // time is still a change of credential.
  const credentialChanged =
    input.secret !== undefined || integrationKey !== (existing?.integrationKey ?? "");
  setSetting(SETTINGS_KEY, {
    integrationKey,
    secretCipher,
    environment: normalizeEnvironment(input.environment),
    redirectUri: input.redirectUri.trim(),
  } satisfies StoredDocusignSettings);
  return { credentialChanged };
}

/** Forgets the Settings credentials entirely, falling back to the environment if it has any. */
export function clearDocusignSettings(): void {
  setSetting(SETTINGS_KEY, null);
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

function encryptString(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

function decryptString(value: string, secret: string): string {
  const [iv, tag, ciphertext] = value.split(".");
  if (!iv || !tag || !ciphertext) throw new Error("DocuSign credentials are unreadable. Reconnect the account.");
  const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(secret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

function encryptTokens(tokens: StoredTokens, secret: string): string {
  return encryptString(JSON.stringify(tokens), secret);
}

function decryptTokens(value: string, secret: string): StoredTokens {
  try {
    const parsed = JSON.parse(decryptString(value, secret)) as StoredTokens;
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
      encryptionSecret()
    ),
  });
}

/** A valid access token, refreshed a minute early so a slow request cannot expire mid-flight. */
async function accessToken(origin: string): Promise<{ token: string; apiBase: string }> {
  const value = requiredConfig(origin);
  const connection = getEsignConnection();
  if (!connection) throw new Error("DocuSign is not connected. Connect it in Settings.");
  const stored = decryptTokens(connection.encrypted_tokens, encryptionSecret());
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
  updateEsignTokens(encryptTokens(next, encryptionSecret()));
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
