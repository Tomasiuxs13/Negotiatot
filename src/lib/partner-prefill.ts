import "server-only";

import {
  findPartnerByName,
  getPartner,
  getPartnerChannels,
  getPartnerDeals,
} from "./db";
import { getContentItems } from "./fulfillment";
import {
  partnerOperationalStats,
  priorDeals,
  type Partner,
  type PartnerPrefill,
} from "./partners";

function buildPartnerPrefill(partner: Partner): PartnerPrefill {
  const channels = getPartnerChannels(partner.id);
  const deals = getPartnerDeals(partner.id);
  const history = priorDeals(deals);
  const last = history[0] ?? null;
  const withViews = channels.filter((channel) => channel.avg_views != null);
  const primary =
    withViews.length > 0
      ? withViews.reduce((best, channel) =>
          channel.avg_views! > best.avg_views! ? channel : best
        )
      : channels[0];
  const operations = partnerOperationalStats(
    deals,
    deals.flatMap((deal) => getContentItems(deal.id))
  );

  return {
    partnerId: partner.id,
    name: partner.name,
    category: partner.category ?? null,
    email: partner.email,
    platforms: channels.map((channel) => channel.platform),
    primaryPlatform: primary?.platform ?? null,
    channelUrl: primary?.url ?? channels.find((channel) => channel.url)?.url ?? null,
    avgViews: primary?.avg_views ?? null,
    engagementRate: primary?.engagement_rate ?? null,
    dealCount: history.length,
    lastAgreedPrice: last?.agreedPrice ?? null,
    lastDealDate: last?.date ?? null,
    lastScope: last?.scope ?? null,
    lastActualCpm: last?.actualCpm ?? null,
    promisedContent: operations.promisedContent,
    deliveredContent: operations.deliveredContent,
    onTimeRate: operations.onTimeRate,
    averageRevisionRounds: operations.averageRevisionRounds,
  };
}

export function partnerPrefillById(partnerId: number): PartnerPrefill | null {
  const partner = getPartner(partnerId);
  return partner ? buildPartnerPrefill(partner) : null;
}

export function partnerPrefillByName(name: string): PartnerPrefill | null {
  const partner = findPartnerByName(name.trim());
  return partner ? buildPartnerPrefill(partner) : null;
}
