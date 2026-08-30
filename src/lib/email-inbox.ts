import type { Stage } from "./types";

export type EmailProvider = "gmail";
export type InboxEmailStatus = "new" | "imported" | "ignored";
export type InboxMatchKind = "deal" | "partner_only" | "unmatched";

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
  status: InboxEmailStatus;
  imported_message_id: number | null;
  created_at: string;
  partner_name: string | null;
  deal_creator: string | null;
  deal_stage: Stage | null;
}

export interface GmailConnectionSummary {
  accountEmail: string;
  connectedAt: string;
  lastSyncAt: string | null;
  lastError: string | null;
}
