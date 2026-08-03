"use client";

import { useState, useTransition } from "react";
import type { OnboardingTask, TaskOwner } from "@/lib/fulfillment-types";
import { ONBOARDING_ICON } from "@/lib/fulfillment-types";
import { onboardingEmail } from "@/lib/nudge-email";
import {
  addOnboardingTaskAction,
  deleteOnboardingTaskAction,
  setOnboardingStatusAction,
  setOnboardingValueAction,
  startOnboardingAction,
} from "@/app/deals/[id]/fulfillment-actions";

const NEEDS_VALUE = new Set(["tracking_link", "coupon_code"]);

function OwnerChip({ owner }: { owner: TaskOwner }) {
  if (owner === "us") return null;
  return (
    <span
      className="text-[10px] font-semibold bg-sky-50 text-sky-700 rounded-full px-1.5 py-0.5"
      title="This one is on the creator — you can chase it, but you can't do it for them"
    >
      on creator
    </span>
  );
}

function TaskRow({
  task,
  dealId,
  creator,
  onGenerateEmail,
}: {
  task: OnboardingTask;
  dealId: number;
  creator: string;
  /** Set only on the welcome-email step — the one task whose output is a message. */
  onGenerateEmail?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.value ?? "");
  const done = task.status === "done";
  const wantsValue = NEEDS_VALUE.has(task.kind);
  const shared = task.deal_id == null;

  const toggle = () =>
    startTransition(async () => {
      await setOnboardingStatusAction(task.id, dealId, done ? "todo" : "done");
    });

  const saveValue = () =>
    startTransition(async () => {
      await setOnboardingValueAction(task.id, dealId, draft);
      setEditing(false);
    });

  return (
    <div className="flex items-center gap-2.5 py-2 border-b border-slate-100 last:border-0">
      <button
        onClick={toggle}
        disabled={isPending}
        aria-label={done ? "Mark not done" : "Mark done"}
        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
          done ? "bg-brand border-brand text-white" : "border-slate-300 hover:border-slate-500"
        }`}
      >
        {done && (
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
            check
          </span>
        )}
      </button>

      <span className="material-symbols-outlined text-slate-400 shrink-0" style={{ fontSize: 15 }}>
        {ONBOARDING_ICON[task.kind]}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm ${done ? "text-slate-400 line-through" : "text-slate-800"}`}>
            {task.label}
          </span>
          <OwnerChip owner={task.owner} />
        </div>

        {editing ? (
          <div className="flex items-center gap-2 mt-1">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveValue()}
              placeholder={task.kind === "coupon_code" ? "e.g. NIKLAS15" : "https://…"}
              className="flex-1 border border-slate-200 rounded-md px-2 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
            />
            <button
              onClick={saveValue}
              disabled={isPending}
              className="text-xs font-medium text-brand-dark hover:underline"
            >
              Save
            </button>
          </div>
        ) : (
          task.value && (
            <div className="flex items-center gap-2 mt-0.5">
              <code className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 truncate max-w-72">
                {task.value}
              </code>
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-slate-400 hover:text-slate-700"
              >
                edit
              </button>
            </div>
          )
        )}
      </div>

      {wantsValue && !task.value && !editing && (
        <button
          onClick={() => setEditing(true)}
          className="text-xs font-medium text-brand-dark hover:underline shrink-0"
        >
          Add {task.kind === "coupon_code" ? "code" : "link"}
        </button>
      )}

      {onGenerateEmail && (
        <button
          onClick={onGenerateEmail}
          className="text-xs font-medium text-brand-dark hover:underline shrink-0"
        >
          Generate email
        </button>
      )}

      {done && task.completed_at && (
        <span className="text-xs text-slate-400 font-tabular shrink-0">
          {shared ? `done ${task.completed_at}` : task.completed_at}
        </span>
      )}

      {!shared && (
        <button
          onClick={() =>
            startTransition(async () => void (await deleteOnboardingTaskAction(task.id, dealId)))
          }
          className="text-slate-300 hover:text-red-600 shrink-0"
          aria-label={`Remove ${task.label}`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
            close
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * The setup that makes a collaboration trackable. Split by scope, because asking a
 * creator who has already delivered three campaigns to register again is exactly the
 * kind of busywork that makes people stop using a checklist.
 */
export default function OnboardingBlock({
  dealId,
  creator,
  tasks,
  hasPartner,
  senderName = "",
  brandName = "",
  portalPath = null,
}: {
  dealId: number;
  creator: string;
  tasks: OnboardingTask[];
  hasPartner: boolean;
  /** For the generated welcome email. */
  senderName?: string;
  brandName?: string;
  portalPath?: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [owner, setOwner] = useState<TaskOwner>("us");
  // The welcome-email composer. Prefilled from whatever setup already exists — the
  // tracking link and coupon are pulled from their sibling tasks at open time, so
  // generating the email after issuing the link includes it, and before doesn't.
  const [welcomeText, setWelcomeText] = useState<string | null>(null);

  const partnerTasks = tasks.filter((t) => t.deal_id == null);
  const dealTasks = tasks.filter((t) => t.deal_id != null);
  const outstanding = tasks.filter((t) => t.status !== "done").length;

  const openWelcome = () =>
    setWelcomeText(
      onboardingEmail({
        creator,
        brandName: brandName || undefined,
        trackingLink: tasks.find((t) => t.kind === "tracking_link")?.value ?? null,
        couponCode: tasks.find((t) => t.kind === "coupon_code")?.value ?? null,
        portalUrl: portalPath ? `${window.location.origin}${portalPath}` : null,
        senderName,
      })
    );

  const emailProp = (t: OnboardingTask) =>
    t.kind === "onboarding_email" ? { onGenerateEmail: openWelcome } : {};

  if (tasks.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
        <h3 className="font-headline text-sm font-semibold text-slate-900 mb-1">Onboarding</h3>
        <p className="text-xs text-slate-500 mb-3 max-w-[60ch]">
          Account registration, tracking link, coupon code and the welcome email. Anything{" "}
          {creator} has already done on a previous deal carries over.
        </p>
        <button
          onClick={() => startTransition(async () => void (await startOnboardingAction(dealId)))}
          disabled={isPending || !hasPartner}
          className="bg-brand hover:bg-brand-dark text-white rounded-md py-1.5 px-4 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {isPending ? "Setting up…" : "Start onboarding"}
        </button>
        {!hasPartner && (
          <p className="text-xs text-amber-600 mt-2">
            This deal isn&apos;t linked to a partner yet.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-headline text-sm font-semibold text-slate-900">
          Onboarding{" "}
          <span className="font-normal text-slate-400">
            {outstanding === 0 ? "all done" : `${outstanding} left`}
          </span>
        </h3>
        <div className="flex items-center gap-3">
          {/* A returning partner's inherited steps fill the list, so this deal's own
              steps would otherwise never be laid down. Seeding is idempotent. */}
          {dealTasks.length === 0 && (
            <button
              onClick={() =>
                startTransition(async () => void (await startOnboardingAction(dealId)))
              }
              disabled={isPending}
              className="text-xs font-medium text-brand-dark hover:underline disabled:opacity-50"
            >
              Apply campaign steps
            </button>
          )}
          <button
            onClick={() => setAdding((v) => !v)}
            className="text-xs font-medium text-brand-dark hover:underline"
          >
            + Add step
          </button>
        </div>
      </div>

      {partnerTasks.length > 0 && (
        <div className="mb-3">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1">
            {creator} — one-time setup
          </div>
          {partnerTasks.map((t) => (
            <TaskRow key={t.id} task={t} dealId={dealId} creator={creator} {...emailProp(t)} />
          ))}
        </div>
      )}

      {dealTasks.length > 0 && (
        <div>
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1">
            This collaboration
          </div>
          {dealTasks.map((t) => (
            <TaskRow key={t.id} task={t} dealId={dealId} creator={creator} {...emailProp(t)} />
          ))}
        </div>
      )}

      {welcomeText !== null && (
        <div className="mt-3 space-y-2">
          <textarea
            value={welcomeText}
            onChange={(e) => setWelcomeText(e.target.value)}
            rows={12}
            className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-800 font-mono resize-y"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigator.clipboard.writeText(welcomeText).catch(() => {})}
              className="text-xs font-medium border border-slate-200 hover:border-slate-400 text-slate-700 rounded-md px-2.5 py-1"
            >
              Copy email
            </button>
            <button onClick={() => setWelcomeText(null)} className="text-xs text-slate-500 px-1">
              Close
            </button>
            <span className="text-[11px] text-slate-400">
              Attach the campaign brief yourself — nothing is sent from here.
            </span>
          </div>
        </div>
      )}

      {adding && (
        <div className="flex items-center gap-2 mt-3">
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Add to the ambassador Slack"
            className="flex-1 border border-slate-200 rounded-md px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
          />
          <select
            value={owner}
            onChange={(e) => setOwner(e.target.value as TaskOwner)}
            className="border border-slate-200 rounded-md px-2 py-1.5 text-sm text-slate-700"
          >
            <option value="us">On us</option>
            <option value="creator">On creator</option>
          </select>
          <button
            onClick={() =>
              startTransition(async () => {
                await addOnboardingTaskAction(dealId, { label, owner, scope: "deal" });
                setLabel("");
                setAdding(false);
              })
            }
            disabled={isPending || !label.trim()}
            className="bg-brand hover:bg-brand-dark text-white rounded-md py-1.5 px-3 text-xs font-medium disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
