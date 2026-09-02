"use client";

import { useState, useTransition } from "react";
import {
  generateContractDraftAction,
  markContractSignedAction,
  saveContractDraftAction,
} from "@/app/deals/[id]/actions";
import {
  refreshSignatureStatusAction,
  sendContractForSignatureAction,
} from "@/app/deals/[id]/fulfillment-actions";

/** The generated agreement: editable text until marked signed, copied manually. */
export default function ContractDraftBlock({
  dealId,
  initial,
  templates = [],
  currentTemplateId = null,
  esign,
}: {
  dealId: number;
  initial: { body: string; status: "draft" | "signed" } | null;
  /** The company's own templates, from Settings. Empty means only the built-in agreement. */
  templates?: { id: number; name: string; isDefault: boolean; incomplete: boolean }[];
  /** The deal's remembered choice; null means whichever is default. */
  currentTemplateId?: number | null;
  /** DocuSign, when it is set up and connected. Absent: the block offers nothing. */
  esign?: {
    connected: boolean;
    /** The envelope for this deal, if one has been sent. */
    envelope: { status: string; recipientEmail: string | null; sentAt: string; lastError: string | null } | null;
    /** Empty when the creator has no email on file — sending needs one. */
    recipientEmail: string | null;
  };
}) {
  const [body, setBody] = useState(initial?.body ?? "");
  const [envelope, setEnvelope] = useState(esign?.envelope ?? null);
  // 0 is the built-in agreement chosen explicitly; null is "the default, whatever it is".
  const [templateId, setTemplateId] = useState<number | null>(currentTemplateId);
  const defaultLabel = templates.find((t) => t.isDefault)?.name ?? "Counterpart standard agreement";
  const [status, setStatus] = useState(initial?.status ?? null);
  const [note, setNote] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ error?: string; body?: string }>, after?: () => void) => {
    setNote(null);
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setNote(r.error);
      else {
        if (r?.body) setBody(r.body);
        after?.();
      }
    });
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-headline text-sm font-semibold text-slate-900">
          Contract draft{status === "signed" && <span className="text-emerald-700 font-normal text-xs"> · marked signed</span>}
        </h3>
        <div className="flex gap-2">
          {status !== "signed" && templates.length > 0 && (
            <select
              value={templateId == null ? "" : String(templateId)}
              onChange={(e) => setTemplateId(e.target.value === "" ? null : Number(e.target.value))}
              disabled={isPending}
              aria-label="Contract template"
              title="Which agreement to generate from. Set up templates in Settings."
              className="text-[11px] border border-slate-200 rounded-md px-2 py-1 text-slate-700 bg-white max-w-48"
            >
              <option value="">Default · {defaultLabel}</option>
              <option value="0">Counterpart standard agreement</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id} disabled={t.incomplete}>
                  {t.name}{t.incomplete ? " (incomplete)" : ""}
                </option>
              ))}
            </select>
          )}
          {status !== "signed" && (
            <button
              onClick={() => run(() => generateContractDraftAction(dealId, templateId), () => setStatus("draft"))}
              disabled={isPending}
              className="text-xs font-semibold text-brand-dark hover:underline disabled:opacity-50"
            >
              {body ? "Regenerate from deal" : "Generate contract"}
            </button>
          )}
          {body && (
            <button
              onClick={() => navigator.clipboard.writeText(body).catch(() => {})}
              className="text-xs font-medium text-slate-600 hover:underline"
            >
              Copy
            </button>
          )}
        </div>
      </div>
      {!body && (
        <p className="text-sm text-slate-400">
          Generate a working agreement from the negotiated terms, content items and the
          creator&apos;s legal details (they fill those in via their portal). Edit freely, copy
          it out for signing — nothing is sent from here.
        </p>
      )}
      {body && (
        <>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            readOnly={status === "signed"}
            rows={16}
            className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-800 font-mono resize-y read-only:bg-slate-50 read-only:text-slate-500"
          />
          {status !== "signed" && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => run(() => saveContractDraftAction(dealId, body))}
                disabled={isPending}
                className="text-xs font-medium bg-slate-900 text-white rounded-md px-3 py-1.5 hover:bg-slate-800 disabled:opacity-60"
              >
                Save draft
              </button>
              <button
                onClick={() => {
                  if (!window.confirm("Mark this contract as signed? It becomes read-only — the signed original should then be uploaded above.")) return;
                  run(() => saveContractDraftAction(dealId, body).then(() => markContractSignedAction(dealId)), () => setStatus("signed"));
                }}
                disabled={isPending}
                className="text-xs font-medium border border-slate-200 hover:border-slate-400 text-slate-700 rounded-md px-3 py-1.5 disabled:opacity-50"
              >
                Mark signed
              </button>
            </div>
          )}
        </>
      )}
      {/* E-signature is opt-in and stays that way: nothing appears here until a DocuSign
          account is actually connected. Configuring the server variables is not consent —
          it used to put a "connect DocuSign" line on every contract draft, which nags a
          manager who has decided to keep signing by hand. Getting a signed PDF back and
          uploading it in the Contract block below is a complete path on its own and needs
          none of this. */}
      {esign?.connected && body && status !== "signed" && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          {envelope ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-slate-100 text-slate-600">
                DocuSign · {ENVELOPE_LABEL[envelope.status] ?? envelope.status}
              </span>
              <span className="text-[11px] text-slate-500">
                sent to {envelope.recipientEmail} on {envelope.sentAt.slice(0, 10)}
              </span>
              <button
                onClick={() =>
                  run(
                    () => refreshSignatureStatusAction(dealId),
                    () => undefined
                  )
                }
                disabled={isPending}
                className="text-[11px] font-medium text-brand-dark hover:underline disabled:opacity-50"
              >
                Check status
              </button>
              {envelope.lastError && (
                <span className="text-[11px] text-red-600 w-full">{envelope.lastError}</span>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  if (
                    !window.confirm(
                      `Send this contract to ${esign.recipientEmail} for signature? The text above is what they will sign.`
                    )
                  )
                    return;
                  run(
                    () => sendContractForSignatureAction(dealId),
                    () =>
                      setEnvelope({
                        status: "sent",
                        recipientEmail: esign.recipientEmail,
                        sentAt: new Date().toISOString(),
                        lastError: null,
                      })
                  );
                }}
                disabled={isPending || !esign.recipientEmail}
                className="text-xs font-medium border border-slate-200 hover:border-slate-400 text-slate-700 rounded-md px-3 py-1.5 disabled:opacity-50"
              >
                Send for signature
              </button>
              <span className="text-[11px] text-slate-500">
                {esign.recipientEmail
                  ? `via DocuSign, to ${esign.recipientEmail}`
                  : "Add the creator's email to their profile first."}
              </span>
            </div>
          )}
        </div>
      )}
      {note && <p className="text-xs text-red-600 mt-2">{note}</p>}
    </div>
  );
}

/** DocuSign's envelope states, in the manager's words. */
const ENVELOPE_LABEL: Record<string, string> = {
  sent: "waiting on the creator",
  delivered: "opened, not signed",
  completed: "signed",
  declined: "declined",
  voided: "voided",
};
