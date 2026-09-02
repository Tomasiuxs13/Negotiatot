import { describe, expect, it } from "vitest";
import {
  DEMO_ACCOUNT_HOST,
  PROD_ACCOUNT_HOST,
  defaultRedirectUri,
  normalizeEnvironment,
  resolveDocusign,
} from "../docusign-config";

const ORIGIN = "https://counterpart.example";
const pair = { integrationKey: "settings-key", secret: "settings-secret" };

describe("resolveDocusign", () => {
  it("is unconfigured, and says what is missing, when nothing is set", () => {
    const r = resolveDocusign({ stored: null, env: {}, origin: ORIGIN });
    expect(r.configured).toBe(false);
    expect(r.source).toBe("none");
    expect(r.missing).toEqual(["Integration key", "Secret key"]);
  });

  it("uses Settings when Settings has both halves", () => {
    const r = resolveDocusign({ stored: pair, env: {}, origin: ORIGIN });
    expect(r.configured).toBe(true);
    expect(r.source).toBe("settings");
    expect(r.integrationKey).toBe("settings-key");
    expect(r.secret).toBe("settings-secret");
  });

  it("falls back to the environment so an existing deployment keeps working", () => {
    const r = resolveDocusign({
      stored: null,
      env: { integrationKey: "env-key", secret: "env-secret" },
      origin: ORIGIN,
    });
    expect(r.source).toBe("environment");
    expect(r.integrationKey).toBe("env-key");
  });

  it("lets Settings override the environment once both halves are entered", () => {
    const r = resolveDocusign({
      stored: pair,
      env: { integrationKey: "env-key", secret: "env-secret" },
      origin: ORIGIN,
    });
    expect(r.source).toBe("settings");
    expect(r.integrationKey).toBe("settings-key");
  });

  /** A Settings key with an environment secret is not a configuration anyone meant. */
  it("never mixes half a credential from each source", () => {
    const r = resolveDocusign({
      stored: { integrationKey: "settings-key" },
      env: { integrationKey: "env-key", secret: "env-secret" },
      origin: ORIGIN,
    });
    expect(r.source).toBe("environment");
    expect(r.integrationKey).toBe("env-key");
    expect(r.secret).toBe("env-secret");

    const half = resolveDocusign({
      stored: { integrationKey: "settings-key" },
      env: {},
      origin: ORIGIN,
    });
    expect(half.configured).toBe(false);
    expect(half.missing).toEqual(["Secret key"]);
  });

  it("treats blank and whitespace-only values as unset", () => {
    const r = resolveDocusign({
      stored: { integrationKey: "  ", secret: "\t" },
      env: {},
      origin: ORIGIN,
    });
    expect(r.configured).toBe(false);
    expect(r.source).toBe("none");
  });

  it("defaults to the demo host and only production switches it", () => {
    expect(resolveDocusign({ stored: pair, env: {}, origin: ORIGIN }).accountHost).toBe(DEMO_ACCOUNT_HOST);
    expect(
      resolveDocusign({ stored: { ...pair, environment: "production" }, env: {}, origin: ORIGIN }).accountHost
    ).toBe(PROD_ACCOUNT_HOST);
    // A typo must not mail a real creator.
    expect(
      resolveDocusign({ stored: { ...pair, environment: "prod" }, env: {}, origin: ORIGIN }).accountHost
    ).toBe(DEMO_ACCOUNT_HOST);
  });

  it("takes the environment from env when Settings does not set one", () => {
    const r = resolveDocusign({ stored: pair, env: { environment: "production" }, origin: ORIGIN });
    expect(r.environment).toBe("production");
  });

  it("derives the redirect URI from the origin unless one is pinned", () => {
    expect(resolveDocusign({ stored: pair, env: {}, origin: ORIGIN }).redirectUri).toBe(
      defaultRedirectUri(ORIGIN)
    );
    expect(
      resolveDocusign({ stored: { ...pair, redirectUri: "https://pinned.example/cb" }, env: {}, origin: ORIGIN })
        .redirectUri
    ).toBe("https://pinned.example/cb");
    expect(
      resolveDocusign({ stored: pair, env: { redirectUri: "https://env.example/cb" }, origin: ORIGIN }).redirectUri
    ).toBe("https://env.example/cb");
  });

  it("normalizes the environment case-insensitively", () => {
    expect(normalizeEnvironment("Production")).toBe("production");
    expect(normalizeEnvironment(" PRODUCTION ")).toBe("production");
    expect(normalizeEnvironment(null)).toBe("demo");
    expect(normalizeEnvironment("")).toBe("demo");
  });
});
