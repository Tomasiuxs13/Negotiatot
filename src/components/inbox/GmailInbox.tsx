"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  ignoreInboxEmailAction,
  matchInboxEmailToDealAction,
  syncGmailInboxAction,
} from "@/app/inbox/actions";
import type { GmailConnectionSummary, InboxDealOption, InboxEmail } from "@/lib/email-inbox";
import { STAGE_LABELS } from "@/lib/types";

function receivedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}

function MatchBadge({ email }: { email: InboxEmail }) {
  if (email.match_method === "thread") {
    return (
      <span className="rounded-full bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700">
        Same Gmail thread · confirm
      </span>
    );
  }
  if (email.match_kind === "deal") {
    return (
      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
        Saved contact match
      </span>
    );
  }
  if (email.match_kind === "partner_only") {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
        Known partner · choose deal
      </span>
    );
  }
  return (
    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
      External sender · choose deal
    </span>
  );
}

function dealLabel(deal: InboxDealOption): string {
  return `${deal.creator}${deal.campaign ? ` · ${deal.campaign}` : ""} · ${STAGE_LABELS[deal.stage]}`;
}

function EmailCard({
  email,
  deals,
  isPending,
  onAttach,
  onIgnore,
}: {
  email: InboxEmail;
  deals: InboxDealOption[];
  isPending: boolean;
  onAttach: (id: number, dealId: number, remember: boolean) => void;
  onIgnore: (id: number) => void;
}) {
  const suggestedDealId =
    email.deal_id && deals.some((deal) => deal.id === email.deal_id) ? String(email.deal_id) : "";
  const initialDeal = deals.find((deal) => deal.id === Number(suggestedDealId));
  const [dealId, setDealId] = useState(suggestedDealId);
  const [dealQuery, setDealQuery] = useState(initialDeal ? dealLabel(initialDeal) : "");
  const [showDealResults, setShowDealResults] = useState(false);
  const [remember, setRemember] = useState(false);
  const selectedDeal = deals.find((deal) => deal.id === Number(dealId));
  const canRemember = Boolean(email.from_email && selectedDeal?.partnerId);
  const terms = dealQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matchingDeals = deals
    .filter((deal) => terms.length === 0 || terms.every((term) => dealLabel(deal).toLowerCase().includes(term)))
    .slice(0, 8);

  return (
    <article className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {email.from_name ?? email.from_email ?? "Unknown sender"}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {email.from_email ?? "No sender email"} · {receivedAt(email.received_at)}
          </p>
        </div>
        <MatchBadge email={email} />
      </div>

      <p className="mt-3 text-sm font-semibold text-slate-800">{email.subject || "(No subject)"}</p>
      <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">{email.body}</p>

      {email.deal_id && email.deal_creator && email.deal_stage ? (
        <p className="mt-3 text-xs text-slate-500">
          Suggested:{" "}
          <Link href={`/deals/${email.deal_id}`} className="font-semibold text-brand-dark hover:underline">
            {email.deal_creator} · {STAGE_LABELS[email.deal_stage]}
          </Link>
        </p>
      ) : email.partner_id && email.partner_name ? (
        <p className="mt-3 text-xs text-slate-500">
          Saved under{" "}
          <Link href={`/partners/${email.partner_id}`} className="font-semibold text-brand-dark hover:underline">
            {email.partner_name}
          </Link>
        </p>
      ) : null}

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <label htmlFor={`deal-${email.id}`} className="text-xs font-semibold text-slate-700">
          Add this reply to
        </label>
        <div className="relative mt-1.5">
        <input
          id={`deal-${email.id}`}
          type="search"
          value={dealQuery}
          placeholder="Search creator or campaign…"
          autoComplete="off"
          role="combobox"
          aria-expanded={showDealResults}
          aria-controls={`deal-results-${email.id}`}
          onFocus={(event) => {
            event.currentTarget.select();
            setShowDealResults(true);
          }}
          onBlur={() => setShowDealResults(false)}
          onChange={(event) => {
            setDealQuery(event.target.value);
            setDealId("");
            setRemember(false);
            setShowDealResults(true);
          }}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
        {showDealResults && (
          <div id={`deal-results-${email.id}`} className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
            {matchingDeals.length > 0 ? matchingDeals.map((deal) => (
              <button
                type="button"
                key={deal.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setDealId(String(deal.id));
                  setDealQuery(dealLabel(deal));
                  setShowDealResults(false);
                }}
                className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-brand/5 hover:text-brand-dark"
              >
                <span className="font-semibold">{deal.creator}</span>
                <span className="text-slate-500">{deal.campaign ? ` · ${deal.campaign}` : ""} · {STAGE_LABELS[deal.stage]}</span>
              </button>
            )) : (
              <p className="px-3 py-2 text-xs text-slate-500">No active deals match that search.</p>
            )}
          </div>
        )}
        </div>
        <label className={`mt-2 flex items-start gap-2 text-xs ${canRemember ? "text-slate-600" : "text-slate-400"}`}>
          <input
            type="checkbox"
            checked={remember}
            disabled={!canRemember || isPending}
            onChange={(event) => setRemember(event.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-brand focus:ring-brand"
          />
          <span>
            Remember {email.from_email ?? "this sender"} as an agency/contact address for this creator
          </span>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <button
          onClick={() => onIgnore(email.id)}
          disabled={isPending}
          className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-60"
        >
          Ignore
        </button>
        <button
          onClick={() => onAttach(email.id, Number(dealId), remember)}
          disabled={isPending || !dealId}
          className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {email.match_method === "thread" && dealId === suggestedDealId
            ? "Confirm & add reply"
            : "Add reply & draft next move"}
        </button>
      </div>
    </article>
  );
}

export default function GmailInbox({
  connection,
  emails,
  deals,
}: {
  connection: GmailConnectionSummary;
  emails: InboxEmail[];
  deals: InboxDealOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOther, setShowOther] = useState(false);
  const priority = emails.filter((email) => email.bucket === "priority");
  const other = emails.filter((email) => email.bucket === "other");

  const sync = () =>
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const result = await syncGmailInboxAction();
      if (result.error) setError(result.error);
      else if (result.automationStarted) {
        setNotice("Automatic tracking is on. New Inbox and Sent mail will be handled from this point forward.");
      } else {
        const filtered = result.filtered ? ` · ${result.filtered} automated/team filtered` : "";
        setNotice(
          `${result.added ?? 0} review item${result.added === 1 ? "" : "s"} added · ${result.sentLogged ?? 0} sent logged · ${result.repliesLogged ?? 0} replies logged · ${result.dealsContacted ?? 0} leads moved to Contacted${filtered}.`
        );
      }
    });

  const attach = (id: number, dealId: number, remember: boolean) =>
    startTransition(async () => {
      setError(null);
      const result = await matchInboxEmailToDealAction(id, dealId, remember);
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
            {connection.automationStartedAt ? "Automatic tracking on" : "Manual checking only"} · known creator mail prioritized · last checked {connection.lastSyncAt ? receivedAt(connection.lastSyncAt) : "not yet"}
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
          Gmail needs attention: {connection.lastError}{" "}
          <Link className="font-semibold underline" href="/settings">Reconnect it in Settings</Link>.
        </p>
      )}
      {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {priority.length === 0 ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
          <span className="material-symbols-outlined text-slate-400">inbox</span>
          <h3 className="mt-2 font-headline text-base font-semibold text-slate-900">No creator replies need attention</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Saved contacts are logged automatically when the deal match is safe. New agency addresses and ambiguous matches will wait here for confirmation.
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="font-headline text-sm font-semibold text-slate-900">Creator mail needing a decision</h3>
            <p className="mt-1 text-xs text-slate-500">
              Known contacts and replies in a deal’s Gmail thread appear here first. A changed sender is never attached without your confirmation.
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {priority.map((email) => (
              <EmailCard key={email.id} email={email} deals={deals} isPending={isPending} onAttach={attach} onIgnore={ignore} />
            ))}
          </div>
        </section>
      )}

      {other.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setShowOther((value) => !value)}
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50"
            aria-expanded={showOther}
          >
            <span>
              <span className="block text-sm font-semibold text-slate-800">Other external mail ({other.length})</span>
              <span className="mt-1 block text-xs text-slate-500">Unknown human-looking senders. Open this only when an agency contacts you from a new thread.</span>
            </span>
            <span className="material-symbols-outlined text-slate-400">{showOther ? "expand_less" : "expand_more"}</span>
          </button>
          {showOther && (
            <div className="divide-y divide-slate-100 border-t border-slate-200">
              {other.map((email) => (
                <EmailCard key={email.id} email={email} deals={deals} isPending={isPending} onAttach={attach} onIgnore={ignore} />
              ))}
            </div>
          )}
        </section>
      )}

      <p className="px-1 text-xs leading-5 text-slate-500">
        Team-domain mail, no-reply/security messages, mailing lists, and Gmail Promotions/Social are hidden automatically. Manage additional team domains in{" "}
        <Link href="/settings" className="font-semibold text-brand-dark hover:underline">Settings</Link>.
      </p>
    </div>
  );
}
