import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import GmailInbox from "@/components/inbox/GmailInbox";
import { getDeals, getInboxEmails } from "@/lib/db";
import { getGmailConnectionSummary } from "@/lib/gmail";
import type { InboxDealOption } from "@/lib/email-inbox";

const INBOX_DEAL_STAGES = new Set(["lead", "contacted", "analyzing", "offer_sent", "negotiating"]);

export const dynamic = "force-dynamic";

export default function InboxPage() {
  const connection = getGmailConnectionSummary();
  const deals: InboxDealOption[] = getDeals()
    .filter((deal) => INBOX_DEAL_STAGES.has(deal.stage))
    .map((deal) => ({
      id: deal.id,
      creator: deal.creator,
      stage: deal.stage,
      campaign: deal.campaign,
      partnerId: deal.partner_id,
    }));
  return (
    <>
      <PageHeader title="Inbox" subtitle="Automatic creator mail tracking, with ambiguous matches held for review" />
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-5xl">
          {connection ? (
            <GmailInbox connection={connection} emails={getInboxEmails("new")} deals={deals} />
          ) : (
            <section className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <span className="material-symbols-outlined text-slate-400">mark_email_unread</span>
              <h2 className="mt-2 font-headline text-lg font-semibold text-slate-900">Connect Gmail to review replies here</h2>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">Counterpart asks only for read-only mailbox access. It matches the sender to a partner and live deal, then waits for your approval before it records anything.</p>
              <Link href="/settings" className="mt-5 inline-flex rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark">Set up Gmail</Link>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
