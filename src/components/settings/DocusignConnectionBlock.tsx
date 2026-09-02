"use client";

import { useTransition } from "react";
import { disconnectDocusignAction } from "@/app/settings/actions";
import type { DocusignConnectionSummary } from "@/lib/docusign";

/**
 * DocuSign, connected the same way as the mailbox: the operator authorises their own
 * account and the app stores an encrypted refresh token. No password, no service account.
 */
export default function DocusignConnectionBlock({
  configured,
  redirectUri,
  missing,
  environment,
  connection,
  status,
}: {
  configured: boolean;
  redirectUri: string;
  missing: string[];
  environment: "demo" | "production";
  connection: DocusignConnectionSummary | null;
  status: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="p-5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-semibold text-slate-900">DocuSign e-signature</span>
        <span
          className={`text-sm font-medium ${
            connection ? "text-emerald-600" : configured ? "text-slate-500" : "text-red-600"
          }`}
        >
          {connection ? "Connected ✓" : configured ? "Not connected" : "Not configured"}
        </span>
      </div>
      <p className="text-xs text-slate-500 mt-1 max-w-[60ch]">
        Sends a deal&apos;s contract draft to the creator for signature. When they sign, the
        signed PDF is filed against the deal and parsed exactly like an uploaded scan, so
        confirmation and the rights check are unchanged. Uploading a signed copy by hand
        stays available and needs none of this.
      </p>

      {environment === "demo" && (
        <p className="text-xs text-amber-700 mt-2">
          Running against the DocuSign <strong>demo</strong> environment. Set{" "}
          <code>DOCUSIGN_ENV=production</code> to send real envelopes — deliberately opt-in,
          so a missing variable never mails a real creator.
        </p>
      )}

      {!configured && (
        <div className="mt-3 text-xs text-slate-600">
          <p>
            Missing server variables:{" "}
            <span className="font-mono text-slate-900">{missing.join(", ")}</span>
          </p>
          <p className="mt-1">
            Add this redirect URI to the DocuSign app:{" "}
            <span className="font-mono text-slate-900 break-all">{redirectUri}</span>
          </p>
        </div>
      )}

      {status === "connected" && (
        <p className="text-xs text-emerald-700 mt-2">DocuSign connected.</p>
      )}
      {status === "connection-failed" && (
        <p className="text-xs text-red-600 mt-2">
          DocuSign could not be connected. Check the integration key, secret and redirect URI.
        </p>
      )}
      {status === "denied" && (
        <p className="text-xs text-red-600 mt-2">Consent was declined, so nothing was connected.</p>
      )}
      {status === "invalid-state" && (
        <p className="text-xs text-red-600 mt-2">
          That sign-in could not be verified. Start the connection again from this page.
        </p>
      )}
      {status === "not-configured" && (
        <p className="text-xs text-red-600 mt-2">
          DocuSign is not configured yet — add the server variables above first.
        </p>
      )}

      {connection && (
        <div className="mt-3 text-xs text-slate-600">
          <p>
            Account <span className="font-medium text-slate-900">{connection.accountName}</span> ·
            connected {connection.connectedAt.slice(0, 10)}
          </p>
          {connection.lastError && (
            <p className="text-red-600 mt-1">Last error: {connection.lastError}</p>
          )}
        </div>
      )}

      {configured && (
        <div className="flex gap-2 mt-3">
          <a
            href="/api/integrations/docusign/connect"
            className="text-xs font-medium bg-slate-900 text-white rounded-md px-3 py-1.5 hover:bg-slate-800"
          >
            {connection ? "Reconnect" : "Connect DocuSign"}
          </a>
          {connection && (
            <button
              onClick={() => {
                if (!window.confirm("Disconnect DocuSign? Envelopes already sent stay in DocuSign.")) return;
                startTransition(async () => {
                  await disconnectDocusignAction();
                });
              }}
              disabled={isPending}
              className="text-xs font-medium border border-slate-200 hover:border-slate-400 text-slate-700 rounded-md px-3 py-1.5 disabled:opacity-50"
            >
              Disconnect
            </button>
          )}
        </div>
      )}
    </div>
  );
}
