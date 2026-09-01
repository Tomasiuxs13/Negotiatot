import type { Deal, Message, CopilotReco } from "@/lib/types";
import { money } from "@/lib/format";
import { getSetting } from "@/lib/db";
import { buildRounds, currentGap } from "@/lib/negotiation";
import CopilotCard from "./CopilotCard";
import ReplyForm from "./ReplyForm";
import DeleteMessageButton from "./DeleteMessageButton";
import MessageBody from "@/components/MessageBody";
import GenerateOfferButton from "./GenerateOfferButton";
import ManagerTakeBox from "./ManagerTakeBox";
import RegenerateRecoButton from "./RegenerateRecoButton";
import FollowUpComposer from "./FollowUpComposer";
import type { FollowUpCandidate } from "@/lib/followups";

function Bubble({ msg, creator }: { msg: Message; creator: string }) {
  const them = msg.sender === "them";
  const date = new Date(msg.created_at + "Z").toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
  return (
    <div
      className={`max-w-[82%] px-4 py-3 rounded-xl text-sm ${
        them
          ? "bg-white border border-slate-200 rounded-bl-sm self-start"
          : "bg-brand/10 border border-brand/25 rounded-br-sm self-end"
      }`}
    >
      <div className="label-caps text-slate-500 mb-1 flex items-center gap-2">
        <span>
          {them ? creator : "You"} · {date}
          {!them && " · sent"}
        </span>
        {/* Mis-pastes happen — a reply meant for one creator lands on another's deal,
            and it takes the round counter and the wrong ask with it. Removable, with
            the cleanup handled by the action rather than left to memory. */}
        <DeleteMessageButton dealId={msg.deal_id} messageId={msg.id} />
      </div>
      <MessageBody body={msg.body} />
    </div>
  );
}

function playbookLevers(): { status: string; label: string }[] {
  const style = getSetting<{ concessionLadder?: string[] }>("negotiation_style");
  const ladder = style?.concessionLadder ?? [];
  return ladder.map((label, i) => ({
    status:
      i === ladder.length - 1 && /price/i.test(label)
        ? "LAST"
        : i === 0
          ? "NEXT"
          : "AVAIL",
    label,
  }));
}

export default function NegotiationTab({
  deal,
  messages,
  followUp,
}: {
  deal: Deal;
  messages: Message[];
  followUp: FollowUpCandidate | null;
}) {
  const levers = playbookLevers();
  const recoMsg = [...messages].reverse().find((m) => m.sender === "copilot");
  const reco = recoMsg?.meta ? (JSON.parse(recoMsg.meta) as CopilotReco) : null;
  const thread = messages.filter((m) => m.sender !== "copilot");
  const rounds = buildRounds(deal, messages, reco);
  const gap = currentGap(rounds);

  return (
    // Sized against this column, not the window. The hard 1.5fr/0.8fr split left the
    // concession ladder at ~226px on a 1280 screen, where a rung like "add a smaller
    // deliverable instead of raising price" wrapped to four lines; below the threshold
    // the ladder now sits under the recommendation at full width instead. The container
    // must be an ancestor of the grid — an element cannot query its own size.
    <div className="@container">
    <div className="grid grid-cols-1 @3xl:grid-cols-[1.5fr_0.8fr] gap-4 items-start">
      {/* Thread */}
      <div className="flex flex-col gap-3.5">
        {followUp && <FollowUpComposer dealId={deal.id} followUp={followUp} />}
        {thread.map((m) => (
          <Bubble key={m.id} msg={m} creator={deal.creator} />
        ))}

        {deal.job_status === "recommending" ? (
          <div className="bg-white rounded-lg border border-brand/30 p-6 text-center">
            <div className="inline-flex items-center gap-2.5 text-sm font-medium text-slate-700">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-60" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand" />
              </span>
              The Copilot is working out your next move…
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Usually 30–90 seconds — you can leave this page; the recommendation will be here.
            </p>
          </div>
        ) : reco ? (
          <div className="flex flex-col gap-2">
            <div className="flex justify-end">
              <RegenerateRecoButton dealId={deal.id} busy={deal.job_status != null} />
            </div>
            <CopilotCard dealId={deal.id} reco={reco} />
            <ManagerTakeBox
              dealId={deal.id}
              initialTake={reco.take ?? ""}
              busy={deal.job_status != null}
              hasRecommendation
            />
          </div>
        ) : thread.length === 0 ? (
          <div className="flex flex-col gap-3">
            <GenerateOfferButton dealId={deal.id} />
            <ManagerTakeBox dealId={deal.id} busy={deal.job_status != null} hasRecommendation={false} />
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No recommendation yet — paste their latest message below and run the analysis.
          </div>
        )}

        <ReplyForm dealId={deal.id} busy={deal.job_status != null} />
      </div>

      {/* Rail */}
      <div className="flex flex-col gap-4">
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
          <h3 className="font-headline text-sm font-semibold text-slate-900 mb-2.5">Offer tracker</h3>
          <div className="divide-y divide-slate-100">
            {rounds.map((r, i) => (
              <div key={i} className="flex gap-3 py-2 text-xs first:pt-0">
                <span className="font-tabular text-slate-400 w-6 pt-0.5">{r.round}</span>
                <div>
                  <span className="font-tabular font-semibold text-slate-900">{money(r.amount)}</span>{" "}
                  <span className="text-slate-600">— {r.label}</span>
                  {r.detail && <span className="text-slate-400"> · {r.detail}</span>}
                </div>
              </div>
            ))}
          </div>
          {gap != null && (
            <div className="mt-2.5 flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <span className="text-xs text-slate-600">Current gap</span>
              <span className="font-tabular font-semibold text-sm text-slate-900">{money(gap)}</span>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
          <h3 className="font-headline text-sm font-semibold text-slate-900 mb-2.5">
            Concession ladder
          </h3>
          <div className="divide-y divide-slate-100">
            {levers.length === 0 && (
              <p className="text-xs text-slate-400 py-1">
                No concession ladder configured — set one in the Playbook.
              </p>
            )}
            {levers.map((l) => (
              <div key={l.label} className="flex items-center gap-2.5 py-2 text-xs first:pt-0 last:pb-0">
                <span
                  className={`text-[10px] font-bold tracking-wide rounded px-1.5 py-0.5 ${
                    l.status === "NEXT"
                      ? "bg-emerald-50 text-emerald-700"
                      : l.status === "AVAIL"
                        ? "bg-slate-100 text-slate-500"
                        : "bg-slate-100 text-slate-400 border border-slate-200"
                  }`}
                >
                  {l.status}
                </span>
                <span className="text-slate-700">{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {deal.walkaway != null && (
          <div className="bg-amber-50 border border-amber-300/60 rounded-lg p-4">
            <p className="text-xs font-bold text-amber-700 mb-1">Guardrail</p>
            <p className="text-xs text-slate-600">
              Walk-away is{" "}
              <span className="font-tabular font-semibold text-slate-900">{money(deal.walkaway)}</span>.
              Counterpart warns before any draft that crosses it, and won&apos;t draft above it.
            </p>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
