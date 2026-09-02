import { describe, expect, it } from "vitest";
import { publicOriginFromHeaders, publicRequestOrigin } from "../public-origin";

function request(url: string, headers: Record<string, string> = {}) {
  return {
    url,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  };
}

describe("publicRequestOrigin", () => {
  it("prefers a server-configured public callback over the container address", () => {
    expect(
      publicRequestOrigin(
        request("https://0.0.0.0:3000/api/integrations/gmail/callback"),
        "https://counterpart.example/api/integrations/gmail/callback"
      )
    ).toBe("https://counterpart.example");
  });

  it("uses trusted proxy metadata when no callback is configured", () => {
    expect(
      publicRequestOrigin(
        request("http://0.0.0.0:3000/settings", {
          "x-forwarded-host": "counterpart.example",
          "x-forwarded-proto": "https",
        })
      )
    ).toBe("https://counterpart.example");
  });

  it("falls back to the request URL for local development", () => {
    expect(publicRequestOrigin(request("http://localhost:3001/settings"))).toBe(
      "http://localhost:3001"
    );
  });
});

function h(map: Record<string, string>) {
  return { get: (n: string) => map[n.toLowerCase()] ?? null };
}

describe("publicOriginFromHeaders", () => {
  it("prefers a configured callback URL over anything a request can claim", () => {
    expect(
      publicOriginFromHeaders(h({ host: "evil.example" }), "https://counterpart.example/api/x/callback")
    ).toBe("https://counterpart.example");
  });

  it("ignores a malformed configured URL and falls back to the proxy headers", () => {
    expect(
      publicOriginFromHeaders(h({ "x-forwarded-host": "app.example", "x-forwarded-proto": "https" }), "not a url")
    ).toBe("https://app.example");
  });

  it("takes the first entry of a comma-joined proxy chain", () => {
    expect(
      publicOriginFromHeaders(h({ "x-forwarded-host": "a.example, b.example", "x-forwarded-proto": "https, http" }))
    ).toBe("https://a.example");
  });

  it("assumes http for localhost and https otherwise", () => {
    expect(publicOriginFromHeaders(h({ host: "localhost:3001" }))).toBe("http://localhost:3001");
    expect(publicOriginFromHeaders(h({ host: "counterpart.example" }))).toBe("https://counterpart.example");
  });

  it("refuses to guess when there is no host at all", () => {
    expect(() => publicOriginFromHeaders(h({}))).toThrow(/public address/);
  });
});
