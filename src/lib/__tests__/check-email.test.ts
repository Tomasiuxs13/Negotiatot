import { describe, it, expect } from "vitest";
import { changesFromCheck } from "../review-email";
import {
  failedFindings,
  integrationSeconds,
  parseCheck,
  type BriefRequirement,
  type IntegrationCheck,
} from "../brief-requirements";

const REQS: BriefRequirement[] = [
  { id: "brand-name", kind: "mention", label: 'Say "Ryoko Pro" out loud', phrases: ["Ryoko Pro"] },
  { id: "ad-disclosure", kind: "disclosure", label: "Disclose the sponsorship", phrases: ["#ad"] },
  { id: "no-unlimited", kind: "prohibited", label: 'Never say "unlimited"', phrases: ["unlimited"] },
];

const check = (over: Partial<IntegrationCheck> = {}): IntegrationCheck => ({
  integrationStartSeconds: 60,
  integrationEndSeconds: 100,
  findings: [],
  summary: "",
  ...over,
});

describe("integrationSeconds", () => {
  it("measures the sponsored segment", () => {
    expect(integrationSeconds(check())).toBe(40);
  });

  it("is null when no segment was identified", () => {
    expect(
      integrationSeconds(check({ integrationStartSeconds: null, integrationEndSeconds: null }))
    ).toBeNull();
  });

  it("is null rather than negative when the bounds are inverted", () => {
    expect(integrationSeconds(check({ integrationStartSeconds: 100, integrationEndSeconds: 60 }))).toBeNull();
  });
});

describe("failedFindings", () => {
  it("returns misses only — 'unclear' is not a failure to send to a creator", () => {
    const c = check({
      findings: [
        { id: "brand-name", status: "met", evidence: "Ryoko Pro", atSeconds: 61, note: null },
        { id: "ad-disclosure", status: "unclear", evidence: null, atSeconds: null, note: "garbled" },
        { id: "no-unlimited", status: "missed", evidence: "unlimited data", atSeconds: 75, note: null },
      ],
    });
    expect(failedFindings(c, REQS).map((f) => f.finding.id)).toEqual(["no-unlimited"]);
  });
});

describe("failedFindings — unknown ids", () => {
  it("drops findings the model invented, so a raw slug never reaches the creator", () => {
    // A real run returned an extra "duration-45s" finding that was never in the brief's
    // requirement list; it printed the slug verbatim and duplicated the length line.
    const c = check({
      findings: [
        { id: "duration-45s", status: "missed", evidence: null, atSeconds: null, note: "no integration" },
        { id: "brand-name", status: "missed", evidence: null, atSeconds: null, note: null },
      ],
    });
    expect(failedFindings(c, REQS).map((f) => f.finding.id)).toEqual(["brand-name"]);
  });

  it("keeps the deterministic length line as the only source of duration complaints", () => {
    const line = changesFromCheck({
      check: check({
        integrationStartSeconds: 0,
        integrationEndSeconds: 20,
        findings: [
          { id: "duration-45s", status: "missed", evidence: null, atSeconds: null, note: "too short" },
        ],
      }),
      requirements: REQS,
      minIntegrationSeconds: 45,
    });
    expect(line).not.toContain("duration-45s");
    expect(line.match(/at least 45s/g)?.length).toBe(1);
  });
});

describe("changesFromCheck", () => {
  it("flips the wording for a prohibited claim, and quotes what was said", () => {
    const line = changesFromCheck({
      check: check({
        findings: [
          { id: "no-unlimited", status: "missed", evidence: "unlimited data", atSeconds: 75, note: null },
        ],
      }),
      requirements: REQS,
      minIntegrationSeconds: null,
    });
    expect(line).toContain("Please remove or reword");
    expect(line).toContain('you said "unlimited data"');
    expect(line).toContain("(around 1:15)");
  });

  it("asks for a mention rather than a removal when a required line was missed", () => {
    const line = changesFromCheck({
      check: check({
        findings: [
          { id: "brand-name", status: "missed", evidence: null, atSeconds: null, note: null },
        ],
      }),
      requirements: REQS,
      minIntegrationSeconds: null,
    });
    expect(line).toContain('Say "Ryoko Pro" out loud');
    expect(line).not.toContain("remove or reword");
  });

  it("flags a short integration against the brief's floor", () => {
    const line = changesFromCheck({
      check: check({ integrationStartSeconds: 60, integrationEndSeconds: 90 }),
      requirements: REQS,
      minIntegrationSeconds: 45,
    });
    expect(line).toContain("at least 45s");
    expect(line).toContain("30s");
  });

  it("says nothing about length when the integration clears the floor", () => {
    expect(
      changesFromCheck({
        check: check({ integrationStartSeconds: 60, integrationEndSeconds: 120 }),
        requirements: REQS,
        minIntegrationSeconds: 45,
      })
    ).toBe("");
  });

  it("is empty when everything passed — nothing to ask the creator for", () => {
    const line = changesFromCheck({
      check: check({
        // Long enough to clear the 45s floor below; otherwise the length line fires
        // and this stops testing what it claims to.
        integrationStartSeconds: 60,
        integrationEndSeconds: 130,
        findings: REQS.map((r) => ({
          id: r.id,
          status: "met" as const,
          evidence: null,
          atSeconds: null,
          note: null,
        })),
      }),
      requirements: REQS,
      minIntegrationSeconds: 45,
    });
    expect(line).toBe("");
  });
});

describe("parseCheck", () => {
  it("returns null on absent or malformed stored results rather than throwing mid-render", () => {
    expect(parseCheck(null)).toBeNull();
    expect(parseCheck("not json")).toBeNull();
    expect(parseCheck('{"summary":"no findings array"}')).toBeNull();
  });
});
