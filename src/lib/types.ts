export type Platform = "youtube" | "instagram" | "tiktok";
export type Stage = "analyzing" | "offer_sent" | "negotiating" | "agreed" | "declined";
export type StatusTone = "good" | "warn" | "neutral";

export interface Deal {
  id: number;
  creator: string;
  platform: Platform;
  platforms: string | null;
  deliverables: string | null;
  format: string | null;
  stage: Stage;
  round: number;
  your_move: 0 | 1;
  first_ask: number | null;
  current_ask: number | null;
  current_offer: number | null;
  agreed_price: number | null;
  anchor: number | null;
  target: number | null;
  walkaway: number | null;
  breakeven: number | null;
  avg_views: number | null;
  engagement_rate: number | null;
  status_label: string | null;
  status_tone: StatusTone;
  campaign: string | null;
  campaign_id: number | null;
  partner_id: number | null;
  analysis: string | null;
  channel_url: string | null;
  actual_views: number | null;
  actual_clicks: number | null;
  actual_orders: number | null;
  actual_revenue: number | null;
  actuals_logged_at: string | null;
  job_status: "analyzing" | "recommending" | null;
  job_error: string | null;
  job_started_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  deal_id: number;
  sender: "them" | "us" | "copilot";
  body: string;
  meta: string | null;
  created_at: string;
}

export interface PlaybookRules {
  maxCpmIntegration: number;
  maxCpmShort: number;
  targetCpc: number;
  minAvgViews: number;
  minEngagementRate: number;
  maxFakeFollowers: number;
  minGeoShare: number;
  geoLabel: string;
  maxPerDeal: number;
  monthlyCap: number;
}

export type Tone = "good" | "warn" | "crit" | "neutral";

export interface DealAnalysis {
  verdict: "accept" | "negotiate" | "decline";
  verdictSummary: string;
  metrics: { label: string; value: string; note: string; tone: Tone }[];
  redFlags: { title: string; detail: string; severity: "good" | "warn" | "crit" }[];
  numbers: { label: string; value: number; explanation: string }[];
}

export interface CopilotReco {
  round: number;
  headline: string;
  pills: { label: string; tone: "good" | "plain" }[];
  reasoning: string[];
  drafts: { balanced: string; warm: string; firm: string };
  proposedOffer: number;
}

export const STAGES: { key: Stage; label: string }[] = [
  { key: "analyzing", label: "Analyzing" },
  { key: "offer_sent", label: "Offer Sent" },
  { key: "negotiating", label: "Negotiating" },
  { key: "agreed", label: "Agreed" },
];

export const PLATFORM_META: Record<Platform, { label: string; icon: string }> = {
  youtube: { label: "YouTube", icon: "play_circle" },
  instagram: { label: "Instagram", icon: "photo_camera" },
  tiktok: { label: "TikTok", icon: "music_note" },
};

/** All platforms on a deal — falls back to the primary platform column. */
export function dealPlatforms(deal: Pick<Deal, "platform" | "platforms">): Platform[] {
  if (deal.platforms) {
    try {
      const parsed = JSON.parse(deal.platforms) as string[];
      const valid = parsed.filter((p): p is Platform => p in PLATFORM_META);
      if (valid.length > 0) return valid;
    } catch {
      // fall through to primary
    }
  }
  return [deal.platform];
}

/** What we're buying — deliverables if set, else the legacy format field. */
export function dealScope(deal: Pick<Deal, "deliverables" | "format">): string | null {
  return deal.deliverables ?? deal.format;
}
