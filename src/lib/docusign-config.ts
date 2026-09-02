/**
 * Where DocuSign's credentials come from, and which source wins.
 *
 * They used to be environment variables only, which meant connecting DocuSign required
 * SSH access to the VPS, an edit to a root-owned `.env` and a redeploy — for a setting
 * that belongs to whoever runs the account, not to whoever deploys the app. Settings is
 * now the primary source and the environment is the fallback, so an existing deployment
 * keeps working untouched and a new one needs no shell at all.
 *
 * Pure on purpose: no database, no crypto, no `server-only`. The caller hands in what it
 * read and this decides what is in effect, which is the part worth testing.
 */

export const DEMO_ACCOUNT_HOST = "https://account-d.docusign.com";
export const PROD_ACCOUNT_HOST = "https://account.docusign.com";

export type DocusignEnvironment = "demo" | "production";

/** What a person types into Settings. The secret is plaintext only in memory. */
export interface DocusignSettings {
  integrationKey: string;
  secret: string;
  environment: DocusignEnvironment;
  /** Blank means "derive it from the address this app is served on". */
  redirectUri: string;
}

export interface DocusignEnvVars {
  integrationKey?: string | null;
  secret?: string | null;
  environment?: string | null;
  redirectUri?: string | null;
}

export interface ResolvedDocusign {
  configured: boolean;
  integrationKey: string;
  secret: string;
  environment: DocusignEnvironment;
  accountHost: string;
  redirectUri: string;
  /** Which source supplied the credential pair — shown in Settings so it is never a guess. */
  source: "settings" | "environment" | "none";
  /** Human labels for what still has to be filled in. Empty when configured. */
  missing: string[];
}

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeEnvironment(value: string | null | undefined): DocusignEnvironment {
  // Anything other than an explicit "production" is demo. Sending real envelopes to real
  // creators must never be what a typo or a blank value switches on.
  return clean(value).toLowerCase() === "production" ? "production" : "demo";
}

export function accountHostFor(environment: DocusignEnvironment): string {
  return environment === "production" ? PROD_ACCOUNT_HOST : DEMO_ACCOUNT_HOST;
}

export function defaultRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/integrations/docusign/callback`;
}

/**
 * What comes back out of storage. `environment` is a loose string because it is JSON that
 * was written some time ago, possibly by an older build — it is normalized, not trusted.
 */
export type StoredDocusignInput =
  | (Partial<Omit<DocusignSettings, "environment">> & { environment?: string | null })
  | null;

export function resolveDocusign(params: {
  stored: StoredDocusignInput;
  env: DocusignEnvVars;
  origin: string;
}): ResolvedDocusign {
  const { stored, env, origin } = params;

  // The key and the secret are one credential, so they are taken from one source or the
  // other and never mixed: a Settings key paired with an environment secret is not a
  // configuration anyone intended, and it would fail at DocuSign with an opaque error.
  const storedKey = clean(stored?.integrationKey);
  const storedSecret = clean(stored?.secret);
  const envKey = clean(env.integrationKey);
  const envSecret = clean(env.secret);

  const fromSettings = Boolean(storedKey && storedSecret);
  const fromEnv = !fromSettings && Boolean(envKey && envSecret);
  const source: ResolvedDocusign["source"] = fromSettings
    ? "settings"
    : fromEnv
      ? "environment"
      : "none";

  const integrationKey = fromSettings ? storedKey : fromEnv ? envKey : "";
  const secret = fromSettings ? storedSecret : fromEnv ? envSecret : "";

  // These two are independent of the credential pair: a deployment can pin the callback
  // URL while the keys are managed from Settings.
  const environment = normalizeEnvironment(
    clean(stored?.environment) || clean(env.environment) || "demo"
  );
  const redirectUri =
    clean(stored?.redirectUri) || clean(env.redirectUri) || defaultRedirectUri(origin);

  // What to tell the person to fill in. When Settings is half-filled, name only the half
  // that is blank — reporting a field they just typed into as missing reads as a bug.
  const missing: string[] = [];
  if (!integrationKey || !secret) {
    const partial = Boolean(storedKey || storedSecret);
    const key = partial ? storedKey : integrationKey;
    const sec = partial ? storedSecret : secret;
    if (!key) missing.push("Integration key");
    if (!sec) missing.push("Secret key");
  }

  return {
    configured: missing.length === 0,
    integrationKey,
    secret,
    environment,
    accountHost: accountHostFor(environment),
    redirectUri,
    source,
    missing,
  };
}
