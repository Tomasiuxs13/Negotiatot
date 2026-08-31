"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  addInboxEmailToDealAction,
  ignoreInboxEmailAction,
  syncGmailInboxAction,
} from "@/app/inbox/actions";
import type { GmailConnectionSummary, InboxEmail } from "@/lib/email-inbox";
import { STAGE_LABELS } from "@/lib/types";

function receivedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function MatchBadge({ email }: { email: InboxEmail }) {
  if (email.match_kind === "deal") {
    return <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">Safe deal match</span>;
  }
  if (email.match_kind === "partner_only") {
    return <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">Partner found · choose deal</span>;
  }
  return <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">No match yet</span>;
}

export default function GmailInbox({
  connection,
  emails,
}: {
  connection: GmailConnectionSummary;
  emails: InboxEmail[];
}) {
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sync = () =>
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const result = await syncGmailInboxAction();
      if (result.error) setError(result.error);
      else if (result.automationStarted) {
        setNotice("Automatic tracking is on. New Inbox and Sent mail will be handled from this point forward.");
      } else {
        setNotice(
          `${result.added ?? 0} review item${result.added === 1 ? "" : "s"} added · ${result.sentLogged ?? 0} sent logged · ${result.repliesLogged ?? 0} replies logged · ${result.dealsContacted ?? 0} leads moved to Contacted.`
        );
      }
    });

  const addToDeal = (id: number) =>
    startTransition(async () => {
      setError(null);
      const result = await addInboxEmailToDealAction(id);
      if (result.error) setError(result.error);
      else setNotice(result.notice ?? "Reply added to the deal.");
    });

  const ignore = (id: number) =>
    startTransition(async () => {
      setError(null);
      const result = await ignoreInboxEmailAction(id);
      if (result.error) setError(result.error);
      else setNotice("Email kept out of the negotiation thread.");
    });

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-sm font-semibold text-slate-900">Connected as {connection.accountEmail}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {connection.automationStartedAt ? "Automatic tracking on" : "Manual checking only"} · read-only Gmail · last checked {connection.lastSyncAt ? receivedAt(connection.lastSyncAt) : "not yet"}
          </p>
        </div>
        <button
          onClick={sync}
          disabled={isPending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark disabled:opacity-60"
        >
          {isPending ? "Checking Gmail…" : "Check now"}
        </button>
      </section>

      {connection.lastError && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Gmail needs attention: {connection.lastError} <Link className="font-semibold underline" href="/settings">Reconnect it in Settings</Link>.
        </p>
      )}
      {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {emails.length === 0 ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <span className="material-symbols-outlined text-slate-400">inbox</span>
          <h3 className="mt-2 font-headline text-base font-semibold text-slate-900">No new replies to review</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Counterpart will log new exact-email, single-deal matches automatically. Ambiguous and unrelated messages remain review-only.</p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="font-headline text-sm font-semibold text-slate-900">Replies needing a decision</h3>
            <p className="mt-1 text-xs text-slate-500">Automatic matching requires an exact partner email and exactly one active negotiation. Everything else waits here.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {emails.map((email) => (
              <article key={email.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{email.from_name ?? email.from_email ?? "Unknown sender"}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{email.from_email ?? "No sender email"} · {receivedAt(email.received_at)}</p>
                  </div>
                  <MatchBadge email={email} />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-800">{email.subject || "(No subject)"}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600 line-clamp-4">{email.body}</p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">
                    {email.deal_id && email.deal_creator && email.deal_stage ? (
                      <Link href={`/deals/${email.deal_id}`} className="font-semibold text-brand-dark hover:underline">
                        {email.deal_creator} · {STAGE_LABELS[email.deal_stage]}
                      </Link>
                    ) : email.partner_id && email.partner_name ? (
                      <Link href={`/partners/${email.partner_id}`} className="font-semibold text-brand-dark hover:underline">{email.partner_name}</Link>
                    ) : "Add or match this creator in Partners first"}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => ignore(email.id)} disabled={isPending} className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-60">Ignore</button>
                    {email.deal_id ? (
                      <button onClick={() => addToDeal(email.id)} disabled={isPending} className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60">Add reply & draft next move</button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
