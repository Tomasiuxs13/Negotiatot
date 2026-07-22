/**
 * Shapes and labels for the fulfillment domain. Deliberately free of any database
 * import so client components can use these without pulling better-sqlite3 into the
 * browser bundle. Query functions live in fulfillment.ts (server only).
 */

export type ContentStatus =
  | "planned"
  | "in_production"
  | "submitted"
  | "approved"
  | "posted"
  | "verified";

export type PaymentTrigger = "on_signing" | "on_delivery" | "on_verification" | "date";
export type PaymentStatus = "pending" | "approvable" | "approved" | "paid";
export type ShipmentStatus = "to_prepare" | "shipped" | "delivered";

export interface Contract {
  id: number;
  deal_id: number;
  filename: string;
  file_path: string;
  mime: string;
  parsed_terms: string | null;
  status: "uploaded" | "parsing" | "parsed" | "confirmed";
  parse_error: string | null;
  signed_at: string | null;
  created_at: string;
}

export interface ContentItem {
  id: number;
  deal_id: number;
  title: string;
  platform: string | null;
  due_date: string | null;
  due_rule: string | null;
  due_days_after_delivery: number | null;
  status: ContentStatus;
  posted_url: string | null;
  /** When it went live — the clock every view count is measured against. */
  posted_at: string | null;
  /** When the results below were read, so an early number can't pose as a final one. */
  actuals_measured_at: string | null;
  /** What this specific deliverable returned, so bundles can be split by platform. */
  actual_views: number | null;
  actual_clicks: number | null;
  actual_orders: number | null;
  actual_revenue: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentItem {
  id: number;
  deal_id: number;
  description: string;
  amount: number;
  trigger: PaymentTrigger;
  due_date: string | null;
  linked_content_ids: string; // JSON array of content item ids
  status: PaymentStatus;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
}

/**
 * Who has to act. A creator-owned task can only be chased, not ticked off by you —
 * worth distinguishing, because "waiting on them" and "waiting on me" are different
 * kinds of stuck.
 */
export type TaskOwner = "us" | "creator";
export type OnboardingStatus = "todo" | "done";

/** The setup steps that make a collaboration trackable. */
export type OnboardingKind =
  | "account"
  | "tracking_link"
  | "coupon_code"
  | "onboarding_email"
  | "custom";

/**
 * Whether a step is done once for the creator or repeated for each collaboration.
 * Getting this wrong is what makes onboarding feel like busywork — nobody wants to be
 * asked whether a creator registered when they've delivered three campaigns already.
 */
export type OnboardingScope = "partner" | "deal";

export interface OnboardingTask {
  id: number;
  partner_id: number;
  /** Null for a one-time partner step; set for anything specific to one collaboration. */
  deal_id: number | null;
  kind: OnboardingKind;
  label: string;
  owner: TaskOwner;
  /** The link or code itself — the task's output, needed long after it's ticked. */
  value: string | null;
  status: OnboardingStatus;
  position: number;
  completed_at: string | null;
  created_at: string;
}

export interface OnboardingTemplateStep {
  kind: OnboardingKind;
  label: string;
  owner: TaskOwner;
  scope: OnboardingScope;
  /** Whether ticking it off should capture a value (a link, a code). */
  needsValue?: boolean;
}

/**
 * The default checklist.
 *
 * Registration and the affiliate link are partner-scoped: most networks issue one
 * account and one link per creator, reused across campaigns. Coupon codes and briefs
 * are campaign-specific, so they repeat. Any of this can be re-scoped in Settings —
 * some programs do generate a link per campaign.
 */
export const DEFAULT_ONBOARDING: OnboardingTemplateStep[] = [
  {
    kind: "account",
    label: "Creator registers on the affiliate platform",
    owner: "creator",
    scope: "partner",
  },
  {
    kind: "tracking_link",
    label: "Affiliate tracking link issued",
    owner: "us",
    scope: "partner",
    needsValue: true,
  },
  {
    kind: "onboarding_email",
    label: "Send onboarding email and program brief",
    owner: "us",
    scope: "partner",
  },
  {
    kind: "coupon_code",
    label: "Send campaign coupon code",
    owner: "us",
    scope: "deal",
    needsValue: true,
  },
];

export const ONBOARDING_ICON: Record<OnboardingKind, string> = {
  account: "person_add",
  tracking_link: "link",
  coupon_code: "sell",
  onboarding_email: "mail",
  custom: "check_circle",
};

/** Tasks whose output other work depends on — content can't be tracked without them. */
export const BLOCKING_KINDS: OnboardingKind[] = ["tracking_link", "coupon_code"];

export interface Shipment {
  id: number;
  deal_id: number;
  product: string;
  value: number | null;
  address: string | null;
  carrier: string | null;
  tracking: string | null;
  status: ShipmentStatus;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

/** What Claude extracts from a signed contract. */
export interface ParsedTerms {
  deliverables: {
    description: string;
    platform: string | null;
    quantity: number;
    dueDate: string | null;
    dueDaysAfterDelivery: number | null;
    dueRule: string | null;
  }[];
  payments: {
    description: string;
    amount: number;
    trigger: PaymentTrigger;
    dueDate: string | null;
  }[];
  product: { description: string; value: number | null } | null;
  usageRights: string | null;
  exclusivity: string | null;
  paymentTerms: string | null;
  totalFee: number | null;
  notes: string[];
}

export const CONTENT_STATUS_FLOW: ContentStatus[] = [
  "planned",
  "in_production",
  "submitted",
  "approved",
  "posted",
  "verified",
];

export const CONTENT_STATUS_LABEL: Record<ContentStatus, string> = {
  planned: "Planned",
  in_production: "In production",
  submitted: "Submitted",
  approved: "Approved",
  posted: "Posted",
  verified: "Verified",
};

export const PAYMENT_TRIGGER_LABEL: Record<PaymentTrigger, string> = {
  on_signing: "On signing",
  on_delivery: "On product delivery",
  on_verification: "On content verified",
  date: "On date",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Waiting",
  approvable: "Ready to approve",
  approved: "Approved",
  paid: "Paid",
};

/**
 * Why a payment is still waiting, in the partner's terms. A single hardcoded reason
 * misleads: a balance held for content verification is not a shipping problem.
 */
export function pendingReason(p: Pick<PaymentItem, "trigger" | "due_date">): string {
  switch (p.trigger) {
    case "on_verification":
      return "waiting on content verification";
    case "on_delivery":
      return "waiting on product delivery";
    case "date":
      return p.due_date ? `due ${p.due_date}` : "waiting on a date";
    case "on_signing":
      return "waiting on signature";
  }
}
