import { describe, expect, it } from "vitest";
import { CONTRACT_SLOTS, validateTemplate, type SlotValue } from "../contract-slots";
import { contractContext, DEFAULT_CONTRACT_TEMPLATE, generateContractText } from "../contract-template";
import type { Deal } from "../types";
import type { ContentItem, PaymentItem } from "../fulfillment-types";

const deal = {
  id: 1,
  creator: "jim.weglewski.explores",
  agreed_price: 900,
  deliverables: "2 IG reels",
  format: null,
  rights: null,
  platforms: '["instagram"]',
} as Deal;

const full = contractContext({
  deal,
  partner: { id: 1, name: "Jim", email: "j@x.com", legal_name: "Jim Weglewski", company_name: "JW LLC", tax_id: "1", legal_address: "1 Main St" } as never,
  items: [{ title: "IG reel", platform: "instagram", due_date: "2026-10-01" } as ContentItem],
  payments: [{ amount: 450, description: "on signature", required_verified: 1 } as PaymentItem],
  brand: { brandName: "Ryoko", senderName: "Thomas", productName: "Core 2" },
  commission: { type: "per_order", value: 20 },
  shipments: [{ product: "Core 2 watch", value: 70 }],
  today: "2026-09-02",
});

function resolve(ctx: SlotValue, path: string): SlotValue {
  let cur: SlotValue = ctx;
  for (const p of path.split(".")) {
    if (cur == null || typeof cur !== "object" || Array.isArray(cur) || !(p in cur)) return undefined;
    cur = cur[p];
  }
  return cur;
}

describe("the slot catalog and the contract context agree", () => {
  /**
   * The catalog is what a company sees when mapping a template, and what Claude is told
   * it may use. A documented slot the context never fills would render empty in every
   * contract with no error anywhere — this is the only place that catches it.
   */
  it("fills every documented slot on a deal that has everything", () => {
    for (const slot of CONTRACT_SLOTS) {
      const m = slot.path.match(/^(.+)\[\]\.(.+)$/);
      if (m) {
        const list = resolve(full, m[1]);
        expect(Array.isArray(list), `${m[1]} should be a list`).toBe(true);
        for (const item of list as SlotValue[]) {
          expect(item != null && typeof item === "object" && m[2] in item, `${slot.path}`).toBe(true);
        }
        continue;
      }
      const v = resolve(full, slot.path);
      expect(v !== undefined, `${slot.path} is documented but never set`).toBe(true);
      if (slot.kind === "value") expect(v !== "" && v !== null, `${slot.path} is empty on a full deal`).toBe(true);
    }
  });

  it("clears the optional groups on a bare deal instead of leaving stale values", () => {
    const bare = contractContext({ deal: { ...deal, agreed_price: null }, partner: null, items: [], payments: [], brand: {} });
    expect(bare.commission).toBeNull();
    expect(bare.product).toBeNull();
    expect(bare.hasFee).toBe(false);
    expect(bare.fee).toBe("");
    expect(resolve(bare, "brand.name")).toBe("[Brand legal name]");
    expect(resolve(bare, "creator.party")).toBe("jim.weglewski.explores");
  });
});

describe("the built-in agreement", () => {
  it("is a valid, complete template in its own language", () => {
    const r = validateTemplate(DEFAULT_CONTRACT_TEMPLATE);
    expect(r.errors).toEqual([]);
    expect(r.unknownSlots).toEqual([]);
    expect(r.missing).toEqual([]);
  });

  it("renders the same agreement the hand-written template produced", () => {
    const text = generateContractText({
      deal,
      partner: null,
      items: [],
      payments: [],
      brand: { brandName: "Ryoko" },
      today: "2026-09-02",
    });
    expect(text).toBe(
      [
        "INFLUENCER COLLABORATION AGREEMENT",
        "",
        'Between: Ryoko ("Brand")',
        'And: jim.weglewski.explores ("Creator")',
        "Creator address: [to be filled — request via the partner portal]",
        "",
        "1. DELIVERABLES",
        "  1.1 2 IG reels",
        "",
        "2. COMPENSATION",
        "  2.1 Fixed fee: $900",
        "  Payment terms: Net-30 from invoice.",
        "",
        "3. REVIEW & APPROVAL",
        "  Draft submitted at least 10 days before each publish date; Brand responds within",
        "  48 hours; maximum two revision rounds. Content goes live only in its approved form.",
        "",
        "4. TRACKING",
        "  All links and codes provided by Brand must be used as supplied.",
        "",
        "5. USAGE RIGHTS & EXCLUSIVITY",
        "  Organic posting on the Creator's own channels only. No reuse, amplification or exclusivity beyond this agreement.",
        "",
        "Signed for the Brand: ____________________  Date: ________",
        "Signed by the Creator: ____________________  Date: ________",
      ].join("\n")
    );
  });

  it("renders a company template with its own wording around the slots", () => {
    const theirs = [
      "AGREEMENT between {{brand.name}} and {{creator.party}}.",
      "The Creator will produce:",
      "{{#each deliverables.items}}",
      " ({{@index}}) {{title}}{{#if dueDate}}, live by {{dueDate}}{{/if}}",
      "{{/each}}",
      "{{#if hasFee}}",
      "Fee: {{fee}}, invoiced on completion.",
      "{{/if}}",
      "{{#if commission}}",
      "In addition the Creator earns {{commission.rate}} on attributed orders.",
      "{{/if}}",
    ].join("\n");
    const text = generateContractText({
      deal: { ...deal, agreed_price: null },
      partner: null,
      items: [{ title: "IG reel", platform: "instagram", due_date: "2026-10-01" } as ContentItem],
      payments: [],
      brand: { brandName: "Ryoko" },
      commission: { type: "percent", value: 10 },
      templateBody: theirs,
    });
    expect(text).toBe(
      [
        "AGREEMENT between Ryoko and jim.weglewski.explores.",
        "The Creator will produce:",
        " (1) IG reel, live by 2026-10-01",
        "In addition the Creator earns 10% of net sales on attributed orders.",
      ].join("\n")
    );
  });
});
