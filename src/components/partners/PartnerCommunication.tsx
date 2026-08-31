import Link from "next/link";
import type { Message, Stage } from "@/lib/types";
import MessageBody from "@/components/MessageBody";
import { STAGE_LABELS } from "@/lib/types";

export interface PartnerCommunicationMessage extends Message {
  deal_creator: string;
  deal_campaign: string | null;
  deal_stage: Stage;
  deal_deliverables: string | null;
  deal_format: string | null;
}

interface CommunicationMeta {
  source?: string;
  subject?: string;
}

function metadata(value: string | null): CommunicationMeta {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as CommunicationMeta) : {};
  } catch {
    return {};
  }
}

function messageTime(value: string): { label: string; iso: string } {
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.valueOf())) return { label: value, iso: value };
  return {
    label: new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date),
    iso: date.toISOString(),
  };
}

function MessageRow({
  message,
  partnerName,
}: {
  message: PartnerCommunicationMessage;
  partnerName: string;
}) {
  const fromPartner = message.sender === "them";
  const meta = metadata(message.meta);
  const at = messageTime(message.created_at);
  const dealName = message.deal_deliverables ?? message.deal_format ?? "Deal";

  return (
    <article className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`material-symbols-outlined rounded-full p-1 ${
              fromPartner ? "bg-amber-50 text-amber-700" : "bg-brand/10 text-brand-dark"
            }`}
            style={{ fontSize: 16 }}
            aria-hidden="true"
          >
            {fromPartner ? "call_received" : "call_made"}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-800">
              {fromPartner ? partnerName : "You"}
              <span className="font-normal text-slate-400"> · {fromPartner ? "received" : "sent"}</span>
            </p>
            <time className="block text-[11px] text-slate-400" dateTime={at.iso}>{at.label}</time>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5 text-[11px]">
          {meta.source === "gmail" && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-500">Gmail</span>
          )}
          <Link
            href={`/deals/${message.deal_id}`}
            className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold text-brand-dark hover:border-brand/40 hover:bg-brand/5"
            title={message.deal_campaign ?? undefined}
          >
            {dealName} · {STAGE_LABELS[message.deal_stage]}
          </Link>
        </div>
      </div>

      <div className={`mt-2 rounded-lg border px-3 py-2.5 ${fromPartner ? "border-slate-200 bg-white" : "border-brand/20 bg-brand/[0.04]"}`}>
        {meta.subject && <p className="mb-1 text-xs font-semibold text-slate-700">{meta.subject}</p>}
        {/* Same reader as the negotiation thread: the quoted chain folds, and a long
            message clamps. One rule for both, so a message does not look different
            depending on which tab you opened it from. */}
        <MessageBody body={message.body} className="text-sm leading-6 text-slate-600" />
      </div>
    </article>
  );
}

export default function PartnerCommunication({
  partnerName,
  messages,
  latestDealId,
}: {
  partnerName: string;
  messages: PartnerCommunicationMessage[];
  latestDealId?: number;
}) {
  const dealCount = new Set(messages.map((message) => message.deal_id)).size;
  const firstPage = messages.slice(0, 8);
  const older = messages.slice(8);

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h3 className="font-headline text-sm font-semibold text-slate-900">Communication</h3>
          <p className="mt-1 text-xs text-slate-500">
            {messages.length > 0
              ? `${messages.length} human message${messages.length === 1 ? "" : "s"} across ${dealCount} deal${dealCount === 1 ? "" : "s"}, newest first.`
              : "Sent and received messages will collect here once they are matched to a deal."}
          </p>
        </div>
        {latestDealId && (
          <Link href={`/deals/${latestDealId}`} className="text-xs font-semibold text-brand-dark hover:underline">
            Open latest deal
          </Link>
        )}
      </div>

      {messages.length === 0 ? (
        <div className="px-5 py-7 text-center">
          <span className="material-symbols-outlined text-slate-300" aria-hidden="true">forum</span>
          <p className="mt-1 text-sm font-medium text-slate-700">No recorded communication yet</p>
          <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-slate-500">
            Gmail messages appear after Counterpart safely matches them. You can also paste a reply in the deal’s Negotiation tab.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 px-5 py-4">
          {firstPage.map((message) => (
            <MessageRow key={message.id} message={message} partnerName={partnerName} />
          ))}
          {older.length > 0 && (
            <details className="py-4">
              <summary className="cursor-pointer list-none text-center text-xs font-semibold text-brand-dark hover:underline">
                Show {older.length} older message{older.length === 1 ? "" : "s"}
              </summary>
              <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100 pt-4">
                {older.map((message) => (
                  <MessageRow key={message.id} message={message} partnerName={partnerName} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
