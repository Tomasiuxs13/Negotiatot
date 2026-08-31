export type Platform = "youtube" | "instagram" | "tiktok" | "facebook";

/** Every platform the app works with — drives the DB constraint, pickers and filters. */
export const ALL_PLATFORMS: Platform[] = ["youtube", "instagram", "tiktok", "facebook"];
export type Stage =
  | "lead"
  | "contacted"
  | "analyzing"
  | "offer_sent"
  | "negotiating"
  | "agreed"
  | "completed"
  | "declined";

/** Single source of truth for the stage CHECK constraint and stage validation. */
export const ALL_STAGES: Stage[] = [
  "lead",
  "contacted",
  "analyzing",
  "offer_sent",
  "negotiating",
  "agreed",
  "completed",
  "declined",
];

/** Deals that are finished — excluded from the working pipeline and active counts. */
export const TERMINAL_STAGES: Stage[] = ["completed", "declined"];

/**
 * Display names for every stage, including the ones with no board column — STAGES
 * covers the board only, so anything reading from it alone renders a raw key.
 */
export const STAGE_LABELS: Record<Stage, string> = {
  lead: "Lead",
  contacted: "Contacted",
  analyzing: "To review",
  offer_sent: "Offer Sent",
  negotiating: "Negotiating",
  agreed: "Agreed",
  completed: "Completed",
  declined: "Declined",
};

/**
 * Plain-language guidance for the working pipeline. The label names the bucket; the
 * description tells a manager why a deal belongs there and what moves it forward.
 * Keeping this next to the stage definitions lets the board and deal workspace teach
 * the same workflow instead of inventing slightly different copy on every screen.
 */
export const STAGE_HELP: Record<Stage, { description: string; next: string }> = {
  lead: {
    description: "A creator you may want to work with.",
    next: "Reach out, then move to Contacted.",
  },
  contacted: {
    description: "Outreach sent; waiting for a response.",
    next: "Add their reply or start analysis.",
  },
  analyzing: {
    description: "Evidence and pricing are ready for a decision.",
    next: "Send an offer or decline the deal.",
  },
  offer_sent: {
    description: "Your offer is with the creator.",
    next: "Record their reply when it arrives.",
  },
  negotiating: {
    description: "You are working toward final terms.",
    next: "Record each reply or mark terms agreed.",
  },
  agreed: {
    description: "Terms are final; delivery is in progress.",
    next: "Finish paperwork, content, and payment.",
  },
  completed: {
    description: "Everything is delivered and paid.",
    next: "Review actuals and partner history.",
  },
  declined: {
    description: "The collaboration is not moving forward.",
    next: "Reopen it later if the situation changes.",
  },
};

/**
 * Why a deal died. Recording this is the point of having a Declined stage at all —
 * "six lost above walk-away" says your ceiling may be wrong, "four ghosted after the
 * offer" says your opening move is.
 */
export type DeclineReason =
  | "too_expensive"
  | "no_reply"
  | "failed_rules"
  | "creator_declined"
  | "timing"
  | "other";

export const DECLINE_REASONS: { key: DeclineReason; label: string; hint: string }[] = [
  { key: "too_expensive", label: "Above our walk-away", hint: "They wouldn't come down far enough" },
  { key: "no_reply", label: "Went quiet", hint: "No reply after we reached out or offered" },
  { key: "failed_rules", label: "Failed our rules", hint: "Audience, engagement or geo didn't qualify" },
  { key: "creator_declined", label: "Creator said no", hint: "They turned the collaboration down" },
  { key: "timing", label: "Wrong timing or budget", hint: "Good fit, just not now — set a date to revisit" },
  { key: "other", label: "Other", hint: "Anything else — add a note" },
];

export const DECLINE_REASON_LABEL: Record<DeclineReason, string> = Object.fromEntries(
  DECLINE_REASONS.map((r) => [r.key, r.label])
) as Record<DeclineReason, string>;
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
  /** When outreach actually went out; updated_at moves on every edit and can't answer this. */
  contacted_at?: string | null;
  /** When the deal was won; monthly KPIs key on this, never on updated_at. */
  agreed_at?: string | null;
  /** 1 when the manager set the audience figures by hand; re-runs must not overwrite them. */
  audience_locked?: number;
  /** The manager's free-text notes — context for the Copilot, never instructions. */
  notes?: string | null;
  /** Usage rights, whitelisting, exclusivity — JSON, parsed by rights.ts. */
  rights?: string | null;
  status_label: string | null;
  status_tone: StatusTone;
  campaign: string | null;
  campaign_id: number | null;
  partner_id: number | null;
  analysis: string | null;
  channel_url: string | null;
  actual_views: number | null;
  /** Likes, comments, shares, saves, and other platform-defined interactions. */
  actual_engagements?: number | null;
  actual_clicks: number | null;
  actual_orders: number | null;
  actual_revenue: number | null;
  actuals_logged_at: string | null;
  decline_reason: DeclineReason | null;
  decline_note: string | null;
  declined_at: string | null;
  /** Set when a deal was parked on timing — brings it back when the date arrives. */
  revisit_on: string | null;
  /** CPA paid on top of the fixed fee: "percent" of order value, or "per_order" dollars. */
  commission_type: "percent" | "per_order" | null;
  commission_value: number | null;
  /** Coupon offered to the creator's audience — "percent" or "fixed" dollars off. */
  discount_type: "percent" | "fixed" | null;
  discount_value: number | null;
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
  /** Whether reach and pricing evidence is confirmed for every platform in the deal. */
  evidenceConfidence?: "confirmed" | "mixed" | "insufficient";
  evidenceNotes?: string;
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
  { key: "lead", label: "Lead" },
  { key: "contacted", label: "Contacted" },
  // Named for the human's job, not the machine's: once analysis lands, the deal is
  // sitting there waiting on a decision.
  { key: "analyzing", label: "To review" },
  { key: "offer_sent", label: "Offer Sent" },
  { key: "negotiating", label: "Negotiating" },
  { key: "agreed", label: "Agreed" },
  { key: "completed", label: "Completed" },
];

export const PLATFORM_META: Record<Platform, { label: string; icon: string }> = {
  youtube: { label: "YouTube", icon: "play_circle" },
  instagram: { label: "Instagram", icon: "photo_camera" },
  tiktok: { label: "TikTok", icon: "music_note" },
  // Material Symbols has no brand icons, so like the others this is a metaphor.
  facebook: { label: "Facebook", icon: "thumb_up" },
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
