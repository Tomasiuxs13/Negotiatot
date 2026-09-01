import { describe, expect, it } from "vitest";
import { publicRequestOrigin } from "../public-origin";

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
