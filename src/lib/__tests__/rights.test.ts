import { describe, it, expect } from "vitest";
import {
  describeRights,
  hasRights,
  NO_RIGHTS,
  parseRights,
  rightsContractClause,
  rightsMismatch,
  rightsSummary,
  type DealRights,
} from "../rights";

const rights = (over: Partial<DealRights> = {}): DealRights => ({
  ...NO_RIGHTS,
  ...over,
});

describe("parseRights", () => {
  it("reads back what was stored", () => {
    const stored = JSON.stringify(
      rights({
        usage: { kind: "paid", months: 3 },
        exclusivity: { kind: "category", months: 3, scope: "GlocalMe, TravelWifi" },
      })
    );
    const parsed = parseRights(stored);
    expect(parsed.usage).toEqual({ kind: "paid", months: 3 });
    expect(parsed.exclusivity.scope).toBe("GlocalMe, TravelWifi");
  });

  it("treats null, junk and malformed JSON as no rights — old rows must not break", () => {
    expect(parseRights(null)).toEqual(NO_RIGHTS);
    expect(parseRights("not json")).toEqual(NO_RIGHTS);
    expect(parseRights('{"usage":{"kind":"nonsense","months":-4}}')).toEqual(NO_RIGHTS);
  });

  it("zeroes the months of anything switched off — a disabled right has no duration", () => {
    const parsed = parseRights(
      JSON.stringify({ whitelisting: { enabled: false, months: 6 } })
    );
    expect(parsed.whitelisting.months).toBe(0);
  });
});

describe("hasRights / rightsSummary", () => {
  it("is false and null for the default", () => {
    expect(hasRights(NO_RIGHTS)).toBe(false);
    expect(rightsSummary(NO_RIGHTS)).toBeNull();
  });

  it("summarises compactly for chips", () => {
    expect(
      rightsSummary(
        rights({
          usage: { kind: "paid", months: 3 },
          whitelisting: { enabled: true, months: 2 },
        })
      )
    ).toBe("paid usage 3mo · whitelisting 2mo");
  });
});

describe("describeRights", () => {
  it("says nothing when nothing is marked — no empty section in the prompt", () => {
    expect(describeRights(NO_RIGHTS)).toEqual([]);
  });

  it("distinguishes organic reposting from paid ads — they price very differently", () => {
    expect(describeRights(rights({ usage: { kind: "organic", months: 2 } }))[0]).toContain(
      "repost the content organically"
    );
    expect(describeRights(rights({ usage: { kind: "paid", months: 2 } }))[0]).toContain(
      "paid ads"
    );
  });

  it("flags an unnamed category scope — vague scope is how you overpay", () => {
    const line = describeRights(
      rights({ exclusivity: { kind: "category", months: 3, scope: "" } })
    )[0];
    expect(line).toContain("competitors not yet named");
  });
});

describe("rightsContractClause", () => {
  it("states the organic-only default explicitly rather than staying silent", () => {
    expect(rightsContractClause(NO_RIGHTS)).toContain("No reuse, amplification or exclusivity");
  });

  it("writes every marked right into the clause", () => {
    const clause = rightsContractClause(
      rights({
        usage: { kind: "paid", months: 3 },
        whitelisting: { enabled: true, months: 2 },
        exclusivity: { kind: "category", months: 3, scope: "GlocalMe" },
      })
    );
    expect(clause).toContain("paid advertising for 3 months");
    expect(clause).toContain("whitelisting");
    expect(clause).toContain("(GlocalMe)");
  });
});

describe("rightsMismatch", () => {
  const terms = (usageRights: string | null, exclusivity: string | null) => ({
    usageRights,
    exclusivity,
  });

  it("stays quiet when both sides agree — including both empty", () => {
    expect(rightsMismatch(NO_RIGHTS, terms(null, null))).toEqual([]);
    expect(
      rightsMismatch(
        rights({ usage: { kind: "paid", months: 3 }, exclusivity: { kind: "category", months: 3, scope: "" } }),
        terms("90 days paid use", "category, 90 days")
      )
    ).toEqual([]);
  });

  it("catches a priced right the contract never wrote down", () => {
    const warnings = rightsMismatch(
      rights({ exclusivity: { kind: "category", months: 3, scope: "" } }),
      terms(null, null)
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("isn't in writing");
  });

  it("catches a contract grant the price never accounted for — the costly-overuse case", () => {
    const warnings = rightsMismatch(NO_RIGHTS, terms("12 months, all channels", null));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("never priced for");
    expect(warnings[0]).toContain("12 months, all channels");
  });

  it("treats whitelisting as a usage grant for the comparison", () => {
    expect(
      rightsMismatch(rights({ whitelisting: { enabled: true, months: 2 } }), terms(null, null))
    ).toHaveLength(1);
  });
});
