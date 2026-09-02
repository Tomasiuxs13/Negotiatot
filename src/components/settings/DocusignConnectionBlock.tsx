"use client";

import { useState, useTransition } from "react";
import {
  clearDocusignSettingsAction,
  disconnectDocusignAction,
  saveDocusignSettingsAction,
} from "@/app/settings/actions";
import type { DocusignConnectionSummary, DocusignSetupStatus } from "@/lib/docusign";

/**
 * DocuSign, set up here rather than over SSH.
 *
 * The credentials belong to whoever runs the DocuSign account, so they are entered in
 * Settings and stored encrypted; environment variables still work and are used when
 * Settings is empty, which is why the block always says which source is in effect. The
 * secret is never sent back to the browser — the field shows that one is stored and is
 * only submitted when something is typed into it.
 */
export default function DocusignConnectionBlock({
  setup,
  connection,
  status,
}: {
  setup: DocusignSetupStatus;
  connection: DocusignConnectionSummary | null;
  status: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [integrationKey, setIntegrationKey] = useState(
    setup.source === "settings" ? setup.integrationKey : ""
  );
  const [secret, setSecret] = useState("");
  const [environment, setEnvironment] = useState(setup.environment);
  const [redirectUri, setRedirectUri] = useState(setup.redirectUriIsPinned ? setup.redirectUri : "");
  const [note, setNote] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ error?: string; disconnected?: boolean }>, after?: () => void) => {
    setNote(null);
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setNote(r.error);
      else {
        if (r?.disconnected) setNote("Saved. The previous connection was dropped — reconnect below.");
        after?.();
      }
    });
  };

  return (
    <div className="p-5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-semibold text-slate-900">DocuSign e-signature</span>
        <span
          className={`text-sm font-medium ${
            connection ? "text-emerald-600" : setup.configured ? "text-slate-500" : "text-slate-400"
          }`}
        >
          {connection ? "Connected ✓" : setup.configured ? "Not connected" : "Off"}
        </span>
      </div>
      <p className="text-xs text-slate-500 mt-1 max-w-[60ch]">
        Optional. Sends a deal&apos;s contract draft to the creator for signature; the signed
        PDF is then filed against the deal and parsed exactly like an uploaded scan. Nothing
        appears on a deal until an account is connected here — uploading a signed copy by
        hand is a complete path on its own.
      </p>

      {setup.encryptionError && (
        <p className="text-xs text-red-600 mt-2">{setup.encryptionError}</p>
      )}

      {setup.configured && setup.environment === "demo" && (
        <p className="text-xs text-amber-700 mt-2">
          Using DocuSign&apos;s <strong>demo</strong> environment — envelopes are not legally
          binding and are not delivered to real inboxes. Switch to Production below when you
          are ready to send for real.
        </p>
      )}
      {setup.configured && setup.environment === "production" && (
        <p className="text-xs text-slate-600 mt-2">
          Using DocuSign&apos;s <strong>production</strong> environment — envelopes sent from a
          deal are real and go to the creator&apos;s inbox.
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

      {setup.source === "environment" && (
        <p className="text-xs text-slate-500 mt-2">
          Credentials are coming from this server&apos;s environment variables. Entering them
          below overrides that.
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        {setup.configured && (
          <a
            href="/api/integrations/docusign/connect"
            className="text-xs font-medium bg-slate-900 text-white rounded-md px-3 py-1.5 hover:bg-slate-800"
          >
            {connection ? "Reconnect" : "Connect DocuSign"}
          </a>
        )}
        {connection && (
          <button
            onClick={() => {
              if (!window.confirm("Disconnect DocuSign? Envelopes already sent stay in DocuSign.")) return;
              run(() => disconnectDocusignAction());
            }}
            disabled={isPending}
            className="text-xs font-medium border border-slate-200 hover:border-slate-400 text-slate-700 rounded-md px-3 py-1.5 disabled:opacity-50"
          >
            Disconnect
          </button>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-medium text-brand-dark hover:underline"
        >
          {open ? "Hide credentials" : setup.configured ? "Edit credentials" : "Set up DocuSign"}
        </button>
      </div>

      {open && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs text-slate-600 max-w-[60ch]">
            From your DocuSign app (Settings → Apps and Keys). Add this exact redirect URI to
            that app first:{" "}
            <span className="font-mono text-slate-900 break-all">{setup.redirectUri}</span>
          </p>

          <label className="block mt-3">
            <span className="text-[11px] font-semibold text-slate-600">Integration key</span>
            <input
              value={integrationKey}
              onChange={(e) => setIntegrationKey(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm font-mono text-slate-900 bg-white"
            />
          </label>

          <label className="block mt-3">
            <span className="text-[11px] font-semibold text-slate-600">Secret key</span>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={setup.secretStored ? "•••••••• stored — type to replace" : "Secret key"}
              className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm font-mono text-slate-900 bg-white"
            />
            <span className="text-[11px] text-slate-500">
              Stored encrypted, and never shown again. Leave blank to keep the saved one.
            </span>
          </label>

          <label className="block mt-3">
            <span className="text-[11px] font-semibold text-slate-600">Environment</span>
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as "demo" | "production")}
              className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm text-slate-900 bg-white"
            >
              <option value="demo">Demo — test envelopes, not legally binding</option>
              <option value="production">Production — real envelopes to real creators</option>
            </select>
          </label>

          <label className="block mt-3">
            <span className="text-[11px] font-semibold text-slate-600">
              Redirect URI <span className="font-normal text-slate-400">(optional)</span>
            </span>
            <input
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
              placeholder={setup.redirectUri}
              className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm font-mono text-slate-900 bg-white"
            />
            <span className="text-[11px] text-slate-500">
              Leave blank to use the address this app is served on.
            </span>
          </label>

          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={() =>
                run(
                  () =>
                    saveDocusignSettingsAction({
                      integrationKey,
                      // Undefined, not "", so an untouched field keeps the stored secret.
                      secret: secret ? secret : undefined,
                      environment,
                      redirectUri,
                    }),
                  () => setSecret("")
                )
              }
              disabled={isPending}
              className="text-xs font-medium bg-slate-900 text-white rounded-md px-3 py-1.5 hover:bg-slate-800 disabled:opacity-60"
            >
              Save credentials
            </button>
            {(setup.source === "settings" || setup.secretStored) && (
              <button
                onClick={() => {
                  if (!window.confirm("Remove the DocuSign credentials saved here? Any connection is dropped."))
                    return;
                  run(() => clearDocusignSettingsAction(), () => {
                    setIntegrationKey("");
                    setSecret("");
                  });
                }}
                disabled={isPending}
                className="text-xs font-medium border border-slate-200 hover:border-slate-400 text-slate-700 rounded-md px-3 py-1.5 disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>

          {setup.missing.length > 0 && (
            <p className="text-[11px] text-slate-500 mt-2">Still needed: {setup.missing.join(", ")}.</p>
          )}
        </div>
      )}

      {status === "connected" && <p className="text-xs text-emerald-700 mt-2">DocuSign connected.</p>}
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
          DocuSign is not set up yet — add the integration key and secret above first.
        </p>
      )}

      {note && <p className="text-xs text-slate-700 mt-2">{note}</p>}
    </div>
  );
}
