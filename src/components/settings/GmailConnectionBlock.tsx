"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { disconnectGmailAction } from "@/app/settings/actions";
import type { GmailConnectionSummary } from "@/lib/email-inbox";
import { gmailOAuthNotice, type GmailOAuthStatus } from "@/lib/gmail-oauth-status";

export default function GmailConnectionBlock({
  configured,
  redirectUri,
  missing,
  connection,
  oauthStatus,
}: {
  configured: boolean;
  redirectUri: string;
  missing: string[];
  connection: GmailConnectionSummary | null;
  oauthStatus: GmailOAuthStatus | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const notice = gmailOAuthNotice(oauthStatus);

  const disconnect = () =>
    startTransition(async () => {
      const result = await disconnectGmailAction();
      if (result.error) setError(result.error);
      else setConfirming(false);
    });

  return (
    <div className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Gmail inbox</p>
          <p className="mt-1 max-w-[72ch] text-xs leading-5 text-slate-500">
            Reads incoming messages into Counterpart&apos;s review queue. It cannot send, edit, archive, or delete Gmail messages; a reply enters a deal only when you approve it.
          </p>
        </div>
        <span className={`text-sm font-medium ${connection ? "text-emerald-600" : configured ? "text-slate-600" : "text-amber-700"}`}>
          {connection ? "Connected" : configured ? "Ready to connect" : "Needs setup"}
        </span>
      </div>

      {notice && (
        <div
          className={`mt-3 rounded-lg border p-3 text-xs leading-5 ${
            notice.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : notice.tone === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-red-200 bg-red-50 text-red-900"
          }`}
          role="status"
        >
          <p className="font-semibold">{notice.title}</p>
          <p className="mt-0.5 opacity-80">{notice.detail}</p>
        </div>
      )}

      {connection ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-700 ring-1 ring-slate-200">{connection.accountEmail}</span>
          <Link href="/inbox" className="text-xs font-semibold text-brand-dark hover:underline">Open inbox</Link>
          <button
            onClick={() => (confirming ? disconnect() : setConfirming(true))}
            disabled={isPending}
            className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
          >
            {isPending ? "Disconnecting…" : confirming ? "Really disconnect?" : "Disconnect"}
          </button>
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
