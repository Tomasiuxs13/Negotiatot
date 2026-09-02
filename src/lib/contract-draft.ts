import "server-only";

import {
  getBrandProfile,
  getContractTemplate,
  getDefaultContractTemplate,
  getPartner,
  getUnitEconomics,
  type ContractTemplate,
} from "./db";
import { getContentItems, getPaymentItems, getShipments } from "./fulfillment";
import { resolveOffer } from "./commission";
import { generateContractText, type ContractInputs } from "./contract-template";
import type { Deal } from "./types";

/**
 * Everything the contract needs about a deal, gathered in one place so the three
 * callers — Agreed hand-off, the Regenerate button and the template preview — cannot
 * drift apart on what a contract knows.
 */
export function contractInputsFor(deal: Deal): ContractInputs {
  return {
    deal,
    partner: deal.partner_id != null ? (getPartner(deal.partner_id) ?? null) : null,
    items: getContentItems(deal.id),
    payments: getPaymentItems(deal.id),
    // getBrandProfile, not the raw setting: the raw row omits every default, so a brand
    // that never opened Settings produced a contract headed "[Brand legal name]".
    brand: getBrandProfile(),
    // Resolved, not read off the deal row: most deals carry no commission columns and
    // run on the Playbook's standard offer, which is also what the pricing used. A
    // contract silent on it would contradict the deal that was agreed.
    commission: resolveOffer(deal, getUnitEconomics()).commission,
    shipments: getShipments(deal.id),
  };
}

/** Stored on a deal to say "the built-in agreement, even though a custom default exists". */
export const BUILTIN_TEMPLATE_ID = 0;

/**
 * The template a deal's draft comes from: the one it chose, else the default, else the
 * built-in agreement (undefined). A chosen template that has since been deleted falls
 * through to the default rather than failing the hand-off. Choosing the built-in one
 * explicitly is a real choice and is kept, not treated as "no choice".
 */
export function templateForDeal(deal: Deal, templateId?: number | null): ContractTemplate | undefined {
  const chosen = templateId ?? deal.contract_template_id ?? null;
  if (chosen === BUILTIN_TEMPLATE_ID) return undefined;
  if (chosen != null) {
    const t = getContractTemplate(chosen);
    if (t) return t;
  }
  return getDefaultContractTemplate();
}

export function buildContractDraft(deal: Deal, templateId?: number | null): string {
  const template = templateForDeal(deal, templateId);
  return generateContractText({ ...contractInputsFor(deal), templateBody: template?.body ?? null });
}
