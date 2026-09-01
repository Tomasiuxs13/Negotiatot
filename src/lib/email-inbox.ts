import type { Stage } from "./types";
import type { InboxBucket } from "./email-triage";

export type EmailProvider = "gmail";
export type InboxEmailStatus = "new" | "imported" | "ignored";
export type InboxMatchKind = "deal" | "partner_only" | "unmatched";
export type InboxMatchMethod = "email" | "thread" | "manual";

/** A local review item. The raw Gmail token never leaves server-only code. */
export interface InboxEmail {
  id: number;
  provider: EmailProvider;
  provider_message_id: string;
  provider_thread_id: string | null;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  body: string;
  received_at: string;
  partner_id: number | null;
  deal_id: number | null;
  match_kind: InboxMatchKind;
  match_method: InboxMatchMethod | null;
  bucket: InboxBucket;
  status: InboxEmailStatus;
  imported_message_id: number | null;
  auto_eligible: 0 | 1;
  created_at: string;
  partner_name: string | null;
  deal_creator: string | null;
  deal_stage: Stage | null;
}

export interface InboxDealOption {
  id: number;
  creator: string;
  stage: Stage;
  campaign: string | null;
  partnerId: number | null;
}

export interface GmailConnectionSummary {
  accountEmail: string;
  connectedAt: string;
  lastSyncAt: string | null;
  automationStartedAt: string | null;
  lastAutomaticSyncAt: string | null;
  lastError: string | null;
}

export interface OutboundEmail {
  id: number;
  provider: EmailProvider;
  provider_message_id: string;
  provider_thread_id: string | null;
  to_email: string | null;
  subject: string | null;
  body: string;
  sent_at: string;
  partner_id: number | null;
  deal_id: number | null;
  match_kind: InboxMatchKind;
  imported_message_id: number | null;
  created_at: string;
}

/** A manager-confirmed browser conversation link; provider ids remain opaque strings. */
export interface EmailThreadLink {
  provider: EmailProvider;
  provider_thread_id: string;
  partner_id: number;
  deal_id: number;
  source: string;
  created_at: string;
  updated_at: string;
}
