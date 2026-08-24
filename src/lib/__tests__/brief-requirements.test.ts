import { describe, expect, it } from "vitest";
import { verificationBlocker, type BriefRequirement, type IntegrationCheck } from "../brief-requirements";

const requirement: BriefRequirement = {
  id: "brand",
  kind: "mention",
  label: "Say the brand name",
  phrases: ["Counterpart"],
};

const check = (status: "met" | "missed" | "unclear", end = 90): IntegrationCheck => ({
  integrationStartSeconds: 0,
  integrationEndSeconds: end,
  findings: [{ id: "brand", status, evidence: null, atSeconds: null, note: null }],
  summary: "",
});

describe("verificationBlocker", () => {
  it("does not invent a check when the campaign has no checkable brief", () => {
    expect(verificationBlocker(null, [], null)).toBeNull();
  });

  it("requires a check and every finding to pass", () => {
    expect(verificationBlocker(null, [requirement], null)).toContain("Run the brief check");
    expect(verificationBlocker(check("unclear"), [requirement], null)).toContain("unclear");
    expect(verificationBlocker(check("met"), [requirement], null)).toBeNull();
  });

  it("enforces the brief's minimum integration duration", () => {
    expect(verificationBlocker(check("met", 45), [requirement], 60)).toContain("requires 1m 0s");
  });
});
