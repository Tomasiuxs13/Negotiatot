"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { disconnectGmailAction, saveGmailIgnoredDomainsAction } from "@/app/settings/actions";
import type { GmailConnectionSummary } from "@/lib/email-inbox";
import { gmailOAuthNotice, type GmailOAuthStatus } from "@/lib/gmail-oauth-status";

export default function GmailConnectionBlock({
  configured,
  redirectUri,
  missing,
  connection,
  oauthStatus,
  ignoredDomains,
}: {
  configured: boolean;
  redirectUri: string;
  missing: string[];
  connection: GmailConnectionSummary | null;
  oauthStatus: GmailOAuthStatus | null;
  ignoredDomains: string[];
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [domainText, setDomainText] = useState(ignoredDomains.join(", "));
  const [isPending, startTransition] = useTransition();
  const oauthNotice = gmailOAuthNotice(oauthStatus);

  const disconnect = () =>
    startTransition(async () => {
      const result = await disconnectGmailAction();
      if (result.error) setError(result.error);
      else setConfirming(false);
    });

  const saveDomains = () =>
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const result = await saveGmailIgnoredDomainsAction(domainText);
      if (result.error) setError(result.error);
      else {
        const domains = result.domains ?? [];
        setDomainText(domains.join(", "));
        setNotice("Inbox filters saved. Existing unassigned mail will be cleaned up on the next check.");
      }
    });

  return (
    <div className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Gmail inbox</p>
          <p className="mt-1 max-w-[72ch] text-xs leading-5 text-slate-500">
            Read-only tracking checks Inbox and Sent. Exact-email, single-active-deal matches are logged automatically; ambiguous mail stays in the review queue. Counterpart cannot send, edit, archive, or delete Gmail messages.
          </p>
        </div>
        <span className={`text-sm font-medium ${connection ? "text-emerald-600" : configured ? "text-slate-600" : "text-amber-700"}`}>
          {connection ? "Connected" : configured ? "Ready to connect" : "Needs setup"}
        </span>
      </div>

      {oauthNotice && (
        <div
          className={`mt-3 rounded-lg border p-3 text-xs leading-5 ${
            oauthNotice.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : oauthNotice.tone === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-red-200 bg-red-50 text-red-900"
          }`}
          role="status"
        >
          <p className="font-semibold">{oauthNotice.title}</p>
          <p className="mt-0.5 opacity-80">{oauthNotice.detail}</p>
        </div>
      )}

      {connection ? (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-700 ring-1 ring-slate-200">{connection.accountEmail}</span>
            <span className={`rounded px-2 py-1 text-xs font-semibold ${connection.automationStartedAt ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
              {connection.automationStartedAt ? "Automatic tracking on" : "Reload extension to start automatic tracking"}
            </span>
            <Link href="/inbox" className="text-xs font-semibold text-brand-dark hover:underline">Open inbox</Link>
            <button
              onClick={() => (confirming ? disconnect() : setConfirming(true))}
              disabled={isPending}
              className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              {isPending ? "Disconnecting…" : confirming ? "Really disconnect?" : "Disconnect"}
            </button>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Background checks run every five minutes while Chrome and Counterpart are running. The first check creates a fresh-mail watermark, so old Sent mail is never replayed into deals.
          </p>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <label htmlFor="gmail-ignored-domains" className="text-xs font-semibold text-slate-800">
              Team email domains to hide
            </label>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Your connected Gmail domain is hidden automatically. Add any other company domains, separated by commas; saved creator or agency contacts still take priority.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                id="gmail-ignored-domains"
                value={domainText}
                onChange={(event) => setDomainText(event.target.value)}
                placeholder="orbio.world, company.com"
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-800 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
              <button
                type="button"
                onClick={saveDomains}
                disabled={isPending}
                className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Save filters
              </button>
            </div>
            {notice && <p className="mt-2 text-xs text-emerald-700">{notice}</p>}
          </div>
        </div>
      ) : configured ? (
        <a href="/api/integrations/gmail/connect" className="mt-3 inline-flex rounded-md bg-brand px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-dark">
          Check Gmail access
        </a>
      ) : (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          Add <code>{missing.join(", ")}</code> to <code>.env.local</code>, restart Counterpart, then register this redirect URI in your Google Cloud OAuth client: <code className="break-all">{redirectUri}</code>.
          <p className="mt-1 text-amber-800">Use a long random value for <code>GMAIL_TOKEN_ENCRYPTION_KEY</code>. <code>GMAIL_REDIRECT_URI</code> is optional unless your deployed URL differs.</p>
        </div>
      )}
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
    </div>
  );
}
