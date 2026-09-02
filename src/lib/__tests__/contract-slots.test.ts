import { describe, expect, it } from "vitest";
import { renderTemplate, validateTemplate } from "../contract-slots";

const ctx = {
  brand: { name: "Ryoko" },
  creator: { party: "Jim Weglewski", legalName: "Jim Weglewski" },
  fee: "$900",
  hasFee: true,
  commission: { rate: "$20 per order", attributionDays: 30, clause: "Commission: $20 per order …" },
  product: null,
  deliverables: {
    text: "2 IG reels",
    count: 2,
    items: [
      { title: "IG reel 1", platform: "instagram", dueDate: "2026-10-01" },
      { title: "IG reel 2", platform: "instagram", dueDate: "" },
    ],
  },
};

describe("renderTemplate", () => {
  it("fills values by dotted path", () => {
    expect(renderTemplate("Between {{brand.name}} and {{creator.party}}.", ctx)).toBe(
      "Between Ryoko and Jim Weglewski."
    );
  });

  it("renders unknown slots as empty rather than throwing", () => {
    expect(renderTemplate("Fee: {{nope.nothing}}.", ctx)).toBe("Fee: .");
  });

  it("shows an if-block when set and the else branch when not", () => {
    const t = "{{#if commission}}Pays {{commission.rate}}.{{else}}No commission.{{/if}}";
    expect(renderTemplate(t, ctx)).toBe("Pays $20 per order.");
    expect(renderTemplate(t, { ...ctx, commission: null })).toBe("No commission.");
  });

  it("treats empty strings, zero and empty lists as unset", () => {
    expect(renderTemplate("{{#if fee}}yes{{else}}no{{/if}}", { fee: "" })).toBe("no");
    expect(renderTemplate("{{#if fee}}yes{{else}}no{{/if}}", { fee: 0 })).toBe("no");
    expect(renderTemplate("{{#if items}}yes{{else}}no{{/if}}", { items: [] })).toBe("no");
    expect(renderTemplate("{{#if fee}}yes{{else}}no{{/if}}", { fee: "$1" })).toBe("yes");
  });

  it("iterates a list with a 1-based index and item fields", () => {
    const t = "{{#each deliverables.items}}1.{{@index}} {{title}}{{#if dueDate}} — by {{dueDate}}{{/if}}\n{{/each}}";
    expect(renderTemplate(t, ctx)).toBe("1.1 IG reel 1 — by 2026-10-01\n1.2 IG reel 2\n");
  });

  it("reaches a top-level value from inside a list", () => {
    const t = "{{#each deliverables.items}}{{title}} for {{brand.name}}\n{{/each}}";
    expect(renderTemplate(t, ctx)).toBe("IG reel 1 for Ryoko\nIG reel 2 for Ryoko\n");
  });

  /** A skipped block must not leave a blank line where its tags stood. */
  it("removes the line a standalone block tag sits on", () => {
    const t = ["A", "{{#if product}}", "Gift line", "{{/if}}", "B"].join("\n");
    expect(renderTemplate(t, ctx)).toBe("A\nB");
    expect(renderTemplate(t, { ...ctx, product: { items: [1] } })).toBe("A\nGift line\nB");
  });

  it("keeps a value tag on its own line as a line of output", () => {
    expect(renderTemplate("A\n{{fee}}\nB", ctx)).toBe("A\n$900\nB");
  });

  it("drops comments", () => {
    expect(renderTemplate("A{{! remove me }}B", ctx)).toBe("AB");
  });
});

describe("validateTemplate", () => {
  const complete = [
    "Between {{brand.name}} and {{creator.party}}",
    "{{deliverables.lines}}",
    "{{compensation.lines}}",
  ].join("\n");

  it("passes a template that names both parties, deliverables and compensation", () => {
    const r = validateTemplate(complete);
    expect(r.errors).toEqual([]);
    expect(r.unknownSlots).toEqual([]);
    expect(r.missing).toEqual([]);
    expect(r.used).toEqual(["brand.name", "compensation.lines", "creator.party", "deliverables.lines"]);
  });

  it("reports which requirement a template cannot satisfy", () => {
    const r = validateTemplate("Between {{brand.name}} and {{creator.party}}.\n{{deliverables.text}}");
    expect(r.missing).toEqual(["compensation"]);
  });

  it("needs both parties, not just one", () => {
    expect(validateTemplate("{{brand.name}} {{deliverables.text}} {{fee}}").missing).toEqual(["parties"]);
    expect(validateTemplate("{{creator.party}} {{deliverables.text}} {{fee}}").missing).toEqual(["parties"]);
  });

  it("accepts granular compensation slots in place of the composed clause", () => {
    const r = validateTemplate(
      "{{brand.name}} {{creator.party}} {{deliverables.text}} {{#if commission}}{{commission.rate}}{{/if}}"
    );
    expect(r.missing).toEqual([]);
  });

  it("flags a misspelt slot with its line", () => {
    const r = validateTemplate("line one\nFee {{fee}} to {{creator.legalNmae}}");
    expect(r.unknownSlots).toEqual([{ path: "creator.legalNmae", line: 2 }]);
  });

  it("understands list item fields inside each, and flags the ones that do not exist", () => {
    const r = validateTemplate(
      "{{#each deliverables.items}}{{title}} {{colour}}{{/each}}"
    );
    expect(r.used).toContain("deliverables.items[].title");
    expect(r.unknownSlots).toEqual([{ path: "colour", line: 1 }]);
  });

  it("reports unclosed and unmatched blocks with their lines", () => {
    expect(validateTemplate("a\n{{#if fee}}\nb").errors[0]).toEqual({
      line: 2,
      message: "{{#if fee}} is never closed.",
    });
    expect(validateTemplate("a\n{{/if}}").errors[0].message).toContain("has no matching opener");
    expect(validateTemplate("{{#each deliverables.items}}x").errors[0].message).toContain("never closed");
  });
});
