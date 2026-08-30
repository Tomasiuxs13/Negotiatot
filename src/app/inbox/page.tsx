import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import GmailInbox from "@/components/inbox/GmailInbox";
import { getInboxEmails } from "@/lib/db";
import { getGmailConnectionSummary } from "@/lib/gmail";

export const dynamic = "force-dynamic";

export default function InboxPage() {
  const connection = getGmailConnectionSummary();
  return (
    <>
      <PageHeader title="Inbox" subtitle="Review creator replies, then deliberately add them to the right deal" />
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-5xl">
          {connection ? (
            <GmailInbox connection={connection} emails={getInboxEmails("new")} />
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
