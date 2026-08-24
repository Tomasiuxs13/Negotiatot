import "server-only";

import {
  getBrandProfile,
  getContractDraft,
  getDeal,
  getPartner,
  getSetting,
  saveContractDraft,
} from "./db";
import { provisionalDeliverables } from "./deliverables";
import { generateContractText } from "./contract-template";
import {
  createContentItem,
  DEFAULT_ONBOARDING,
  getContentItems,
  getPaymentItems,
  seedOnboarding,
  type OnboardingTemplateStep,
} from "./fulfillment";
import { dealPlatforms, dealScope } from "./types";

export interface AgreementPreparation {
  onboardingCreated: number;
  onboardingInherited: number;
  contentCreated: number;
  contractDraftCreated: boolean;
  warning: string | null;
}

/**
 * Safe work Counterpart can prepare as soon as a deal is won.
 *
 * The signed contract is still authoritative. Its confirmation replaces provisional
 * content, so this function only derives rows when every platform is unambiguous and
 * never invents payment terms or product delivery.
 */
export function prepareAgreedDeal(dealId: number): AgreementPreparation {
  const deal = getDeal(dealId);
  if (!deal) throw new Error("Deal not found");

  let onboardingCreated = 0;
  let onboardingInherited = 0;
  if (deal.partner_id != null) {
    const onboarding = seedOnboarding(
      deal.id,
      deal.partner_id,
      getSetting<OnboardingTemplateStep[]>("onboarding_template") ?? DEFAULT_ONBOARDING
    );
    onboardingCreated = onboarding.created;
    onboardingInherited = onboarding.inherited;
  }

  let contentCreated = 0;
  let warning: string | null = null;
  if (getContentItems(deal.id).length === 0) {
    const provisional = provisionalDeliverables(dealScope(deal), dealPlatforms(deal));
    warning = provisional.reason;
    for (const item of provisional.items) {
      createContentItem({
        dealId: deal.id,
        title: item.title,
        platform: item.platform,
      });
      contentCreated += 1;
    }
  }

  let contractDraftCreated = false;
  if (!getContractDraft(deal.id)) {
    const brand = getBrandProfile();
    saveContractDraft(
      deal.id,
      generateContractText({
        deal,
        partner: deal.partner_id != null ? (getPartner(deal.partner_id) ?? null) : null,
        items: getContentItems(deal.id),
        payments: getPaymentItems(deal.id),
        brand,
        productOffer: brand.productOffer,
      })
    );
    contractDraftCreated = true;
  }

  return {
    onboardingCreated,
    onboardingInherited,
    contentCreated,
    contractDraftCreated,
    warning,
  };
}

/** Human-readable summary for the stage action and activity feedback. */
export function agreementPreparationSummary(result: AgreementPreparation): string {
  const prepared: string[] = [];
  if (result.contractDraftCreated) prepared.push("contract draft");
  if (result.contentCreated > 0) {
    prepared.push(
      `${result.contentCreated} content item${result.contentCreated === 1 ? "" : "s"}`
    );
  }
  if (result.onboardingCreated > 0) prepared.push("onboarding checklist");
  if (result.onboardingInherited > 0) {
    prepared.push(
      `${result.onboardingInherited} inherited setup step${result.onboardingInherited === 1 ? "" : "s"}`
    );
  }
  return prepared.length > 0 ? `Prepared ${prepared.join(", ")}.` : "Existing setup kept.";
}
