"use client";

import { useState, useTransition } from "react";
import type { ContentItem, PaymentItem, Shipment, PaymentTrigger } from "@/lib/fulfillment-types";
import { CONTENT_STATUS_LABEL, PAYMENT_TRIGGER_LABEL, pendingReason } from "@/lib/fulfillment-types";
import { isOverdue } from "@/lib/fulfillment-rules";
import { DEFAULT_DRAFT_LEAD_DAYS, draftDueDate } from "@/lib/timeline";
import { changeRequestEmail } from "@/lib/review-email";
import { awaitingPostEmail, chaseDraftEmail } from "@/lib/nudge-email";
import { parseCheck, verificationBlocker, type BriefRequirement } from "@/lib/brief-requirements";
import IntegrationCheckBlock from "./IntegrationCheckBlock";
import {
  approveDraftAction,
  requestChangesAction,
  resolveDueDateRequestAction,
  submitDraftFromDealAction,
} from "@/app/deals/[id]/fulfillment-actions";
import { money } from "@/lib/format";
import { CONTENT_TONE, PAYMENT_TONE, TONE_CLASS } from "@/lib/status-tones";
import { PLATFORM_META, type Platform } from "@/lib/types";
import {
  addContentItemAction,
  addPaymentItemAction,
  addShipmentAction,
  deleteContentItemAction,
  deletePaymentItemAction,
  deleteShipmentAction,
  shareShipmentFormAction,
  setContentStatusAction,
  setPaymentStatusAction,
  updateContentItemAction,
  updateShipmentAction,
} from "@/app/deals/[id]/fulfillment-actions";

const inputClass =
  "border border-slate-200 rounded-md bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand";


/* ----------------------------------------------------------- content items */

export function ContentItemsBlock({
  dealId,
  items,
  draftLeadDays = DEFAULT_DRAFT_LEAD_DAYS,
  creator = "",
  senderName = "",
  requirements = [],
  minIntegrationSeconds = null,
  portalPath = null,
  platforms = [],
  locked = false,
}: {
  dealId: number;
  items: ContentItem[];
  /** Days before the publish date the draft is due — drives the date chip. */
  draftLeadDays?: number;
  /** For the generated change-request email. */
  creator?: string;
  senderName?: string;
  /** The campaign brief's checkable obligations; empty when no brief was read. */
  requirements?: BriefRequirement[];
  minIntegrationSeconds?: number | null;
  /** The creator's portal path, quoted inside nudge emails as a full URL. */
  portalPath?: string | null;
  platforms?: string[];
  locked?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    dueDate: "",
    platform: platforms.length === 1 ? platforms[0] : "",
  });
  const [draftUrlEdit, setDraftUrlEdit] = useState<Record<number, string>>({});
  const [urlEdit, setUrlEdit] = useState<Record<number, string>>({});
  // The change-request composer: generated instantly, edited freely, copied manually.
  const [composing, setComposing] = useState<number | null>(null);
  const [emailText, setEmailText] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  // The nudge composer — copy-only, since a chase changes no state, only the silence.
  const [nudging, setNudging] = useState<number | null>(null);
  const [nudgeText, setNudgeText] = useState("");

  const portalUrl = () =>
    portalPath ? `${window.location.origin}${portalPath}` : null;

  const openNudge = (item: ContentItem) => {
    const today = new Date().toISOString().slice(0, 10);
    const common = {
      creator,
      itemTitle: item.title,
      publishDate: item.due_date,
      today,
      senderName,
      portalUrl: portalUrl(),
    };
    setNudgeText(
      item.status === "approved"
        ? awaitingPostEmail(common)
        : chaseDraftEmail({ ...common, leadDays: draftLeadDays })
    );
    setComposing(null);
    setNudging(item.id);
  };

  const add = () => {
    if (!draft.title.trim()) return;
    startTransition(async () => {
      setReviewError(null);
      const result = await addContentItemAction(dealId, {
        title: draft.title,
        dueDate: draft.dueDate || null,
        platform: draft.platform || null,
      });
      if (result.error) {
        setReviewError(result.error);
        return;
      }
      setDraft({
        title: "",
        dueDate: "",
        platform: platforms.length === 1 ? platforms[0] : "",
      });
      setAdding(false);
    });
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-headline text-sm font-semibold text-slate-900">
          Content{" "}
          <span className="font-normal text-slate-400 font-tabular">
            {items.filter((i) => i.status === "verified").length}/{items.length} verified
          </span>
        </h3>
        {!locked && !adding && (
          <button onClick={() => setAdding(true)} className="text-xs font-semibold text-brand-dark hover:underline">
            + Add item
          </button>
        )}
      </div>

      {items.length === 0 && !adding && (
        <p className="text-sm text-slate-400">
          No content items yet — confirm the contract to generate them, or add one manually.
        </p>
      )}

      <div className="divide-y divide-slate-100">
        {items.map((item) => {
          const overdue = isOverdue(item);
          const liveUrl = urlEdit[item.id] ?? item.posted_url ?? "";
          const verifyBlocked = verificationBlocker(
            parseCheck(item.check_result),
            requirements,
            minIntegrationSeconds
          );
          return (
            <div key={item.id} id={`content-${item.id}`} className="py-2.5 scroll-mt-28">
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${TONE_CLASS[CONTENT_TONE[item.status]]}`}>
                  {CONTENT_STATUS_LABEL[item.status]}
                </span>
                <span className="text-sm text-slate-800 flex-1">{item.title}</span>
                {platforms.length > 1 &&
                  (!locked ? (
                    <select
                      aria-label={`Platform for ${item.title}`}
                      value={item.platform ?? ""}
                      onChange={(e) =>
                        startTransition(async () => {
                          setReviewError(null);
                          const result = await updateContentItemAction(item.id, dealId, {
                            platform: e.target.value || null,
                          });
                          if (result.error) setReviewError(result.error);
                        })
                      }
                      className={`${inputClass} text-xs`}
                    >
                      <option value="">Choose platform</option>
                      {platforms.map((platform) => (
                        <option key={platform} value={platform}>
                          {PLATFORM_META[platform as Platform]?.label ?? platform}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-slate-500">
                      {item.platform
                        ? (PLATFORM_META[item.platform as Platform]?.label ?? item.platform)
                        : "Platform missing"}
                    </span>
                  ))}
                <span
                  className={`text-xs font-tabular ${overdue ? "text-red-600 font-semibold" : "text-slate-400"}`}
                >
                  {/* Until a draft lands, the date that matters is the draft deadline,
                      computed back from the publish slot. */}
                  {item.due_date &&
                    (item.status === "planned" || item.status === "in_production") &&
                    `draft due ${draftDueDate(item.due_date, draftLeadDays)} · `}
                  {item.due_date
                    ? `publishes ${item.due_date}`
                    : item.due_days_after_delivery != null
                      ? `+${item.due_days_after_delivery}d after delivery`
                      : "no date"}
                  {overdue && " · overdue"}
                </span>
                {/* The chase, where the chase actually happens. Every "check in with the
                    creator" journey lands on this row — before this button it landed on
                    "Mark submitted", which marks work the creator hasn't done. */}
                {!locked &&
                  (item.status === "planned" ||
                    item.status === "in_production" ||
                    item.status === "approved") && (
                  <button
                    onClick={() => (nudging === item.id ? setNudging(null) : openNudge(item))}
                    className={`text-xs font-medium hover:underline ${
                      overdue ? "text-amber-700" : "text-slate-500"
                    }`}
                  >
                    Nudge
                  </button>
                )}
                {!locked && item.status === "planned" && (
                  <button
                    onClick={() =>
                      startTransition(async () => {
                        setReviewError(null);
                        const result = await setContentStatusAction(
                          item.id,
                          dealId,
                          "in_production"
                        );
                        if (result.error) setReviewError(result.error);
                      })
                    }
                    disabled={isPending}
                    className="text-xs font-medium text-brand-dark hover:underline disabled:opacity-50"
                  >
                    Start production
                  </button>
                )}
                {!locked && (
                  <button
                    onClick={() =>
                      startTransition(async () => {
                        await deleteContentItemAction(item.id, dealId);
                      })
                    }
                    aria-label={`Delete content item ${item.title}`}
                    className="text-slate-300 hover:text-red-600"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>close</span>
                  </button>
                )}
              </div>
              {item.requested_due_date && (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  <p className="font-semibold">
                    Creator requested {item.requested_due_date}
                    {item.due_date ? ` instead of ${item.due_date}` : ""}
                  </p>
                  {item.due_date_request_reason && (
                    <p className="mt-1 whitespace-pre-wrap text-amber-900">
                      {item.due_date_request_reason}
                    </p>
                  )}
                  {!locked && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() =>
                          startTransition(async () => {
                            setReviewError(null);
                            const result = await resolveDueDateRequestAction(
                              item.id,
                              dealId,
                              "approve"
                            );
                            if (result.error) setReviewError(result.error);
                          })
                        }
                        disabled={isPending}
                        className="rounded-md bg-amber-700 px-2.5 py-1 font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
                      >
                        Approve new date
                      </button>
                      <button
                        onClick={() =>
                          startTransition(async () => {
                            setReviewError(null);
                            const result = await resolveDueDateRequestAction(
                              item.id,
                              dealId,
                              "reject"
                            );
                            if (result.error) setReviewError(result.error);
                          })
                        }
                        disabled={isPending}
                        className="rounded-md border border-amber-300 bg-white px-2.5 py-1 font-medium text-amber-900 hover:border-amber-500 disabled:opacity-50"
                      >
                        Keep current date
                      </button>
                    </div>
                  )}
                </div>
              )}
              {nudging === item.id && (
                <div className="mt-1.5 pl-1 space-y-2">
                  <textarea
                    value={nudgeText}
                    onChange={(e) => setNudgeText(e.target.value)}
                    rows={10}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-800 font-mono resize-y"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigator.clipboard.writeText(nudgeText).catch(() => {})}
                      className="text-xs font-medium border border-slate-200 hover:border-slate-400 text-slate-700 rounded-md px-2.5 py-1"
                    >
                      Copy email
                    </button>
                    <button onClick={() => setNudging(null)} className="text-xs text-slate-500 px-1">
                      Close
                    </button>
                    <span className="text-[11px] text-slate-400">
                      Copy it into your mail client — nothing is sent from here.
                    </span>
                  </div>
                </div>
              )}
              {!locked && item.status === "in_production" && (
                <div className="mt-1.5 pl-1 flex items-center gap-2 flex-wrap">
                  <input
                    type="url"
                    value={draftUrlEdit[item.id] ?? item.draft_url ?? ""}
                    onChange={(e) =>
                      setDraftUrlEdit((current) => ({ ...current, [item.id]: e.target.value }))
                    }
                    placeholder="Draft review link"
                    className={`${inputClass} flex-1 min-w-52 text-xs`}
                  />
                  <button
                    onClick={() =>
                      startTransition(async () => {
                        setReviewError(null);
                        const result = await submitDraftFromDealAction(
                          item.id,
                          dealId,
                          draftUrlEdit[item.id] ?? item.draft_url ?? ""
                        );
                        if (result.error) setReviewError(result.error);
                      })
                    }
                    disabled={isPending || !(draftUrlEdit[item.id] ?? item.draft_url ?? "").trim()}
                    className="text-xs font-medium bg-brand hover:bg-brand-dark text-white rounded-md px-3 py-1.5 disabled:opacity-50"
                  >
                    Submit for review
                  </button>
                </div>
              )}
              {!locked && item.status === "submitted" && item.draft_url && (
                <div className="mt-1.5 pl-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <a href={item.draft_url} target="_blank" rel="noreferrer" className="text-xs text-brand-dark hover:underline">
                      Open draft{(item.revision_round ?? 0) > 1 ? ` (revision ${item.revision_round})` : ""}
                    </a>
                    <button
                      onClick={() =>
                        startTransition(async () => {
                          const r = await approveDraftAction(item.id, dealId);
                          if (r?.error) setReviewError(r.error);
                        })
                      }
                      disabled={isPending}
                      className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50"
                    >
                      Approve draft
                    </button>
                    <button
                      onClick={() => {
                        setComposing(item.id);
                        setEmailText(
                          changeRequestEmail({
                            creator,
                            itemTitle: item.title,
                            publishDate: item.due_date,
                            revisionRound: item.revision_round ?? 1,
                            senderName,
                          })
                        );
                      }}
                      className="text-xs font-medium text-amber-700 hover:underline"
                    >
                      Request changes
                    </button>
                  </div>
                  {composing === item.id && (
                    <div className="space-y-2">
                      <textarea
                        value={emailText}
                        onChange={(e) => setEmailText(e.target.value)}
                        rows={10}
                        className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-800 font-mono resize-y"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigator.clipboard.writeText(emailText).catch(() => {})}
                          className="text-xs font-medium border border-slate-200 hover:border-slate-400 text-slate-700 rounded-md px-2.5 py-1"
                        >
                          Copy email
                        </button>
                        <button
                          onClick={() =>
                            startTransition(async () => {
                              const r = await requestChangesAction(item.id, dealId, emailText);
                              if (r?.error) setReviewError(r.error);
                              else setComposing(null);
                            })
                          }
                          disabled={isPending}
                          className="text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-md px-2.5 py-1 disabled:opacity-60"
                        >
                          Save & send back to production
                        </button>
                        <button onClick={() => setComposing(null)} className="text-xs text-slate-500 px-1">Cancel</button>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Copy the email into your mail client — nothing is sent from here. The text
                        is kept on the item and the creator sees &ldquo;changes requested&rdquo; in their portal.
                      </p>
                    </div>
                  )}
                </div>
              )}
              {item.status !== "submitted" && item.approved_url && (
                <p className="text-[11px] text-slate-400 mt-1 pl-1">
                  Approved version:{" "}
                  <a href={item.approved_url} target="_blank" rel="noreferrer" className="underline">
                    {item.approved_url.slice(0, 60)}
                  </a>
                  {item.approved_at ? ` · ${item.approved_at.slice(0, 10)}` : ""}
                </p>
              )}
              {!locked && item.status === "approved" && (
                <div className="flex items-center gap-2 mt-1.5 pl-1 flex-wrap">
                  <input
                    type="url"
                    className={`${inputClass} flex-1 min-w-52 text-xs`}
                    placeholder="Live URL"
                    value={liveUrl}
                    onChange={(e) =>
                      setUrlEdit((current) => ({ ...current, [item.id]: e.target.value }))
                    }
                  />
                  <button
                    onClick={() =>
                      startTransition(async () => {
                        setReviewError(null);
                        const result = await setContentStatusAction(
                          item.id,
                          dealId,
                          "posted",
                          liveUrl
                        );
                        if (result.error) setReviewError(result.error);
                      })
                    }
                    disabled={isPending || !liveUrl.trim()}
                    className="text-xs font-medium bg-brand hover:bg-brand-dark text-white rounded-md px-3 py-1.5 disabled:opacity-50"
                  >
                    Mark posted
                  </button>
                </div>
              )}
              {(item.status === "posted" || item.status === "verified") && (
                <div className="flex items-center gap-2 mt-1.5 pl-1">
                  <input
                    type="url"
                    className={`${inputClass} flex-1 text-xs`}
                    placeholder="Live URL"
                    value={liveUrl}
                    onChange={(e) =>
                      setUrlEdit((current) => ({ ...current, [item.id]: e.target.value }))
                    }
                    onBlur={() => {
                      if (locked) return;
                      const value = urlEdit[item.id];
                      if (value === undefined || value === (item.posted_url ?? "")) return;
                      startTransition(async () => {
                        const r = await updateContentItemAction(item.id, dealId, { postedUrl: value || null });
                        if (r?.error) setReviewError(r.error);
                      });
                    }}
                    disabled={locked}
                  />
                  {item.posted_url && (
                    <a href={item.posted_url} target="_blank" rel="noreferrer" className="text-xs text-brand-dark hover:underline">
                      open
                    </a>
                  )}
                  {!locked && item.status === "posted" && verifyBlocked == null && (
                    <button
                      onClick={() =>
                        startTransition(async () => {
                          setReviewError(null);
                          const result = await setContentStatusAction(
                            item.id,
                            dealId,
                            "verified"
                          );
                          if (result.error) setReviewError(result.error);
                        })
                      }
                      disabled={isPending}
                      className="text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-50 whitespace-nowrap"
                    >
                      Mark verified
                    </button>
                  )}
                </div>
              )}
              {/* Only once it is live and only when the campaign actually has a brief to
                  check against — otherwise this is an input with nothing behind it. */}
              {!locked &&
                (item.status === "posted" || item.status === "verified") &&
                (requirements.length > 0 || minIntegrationSeconds != null) && (
                  <IntegrationCheckBlock
                    contentItemId={item.id}
                    dealId={dealId}
                    checkResult={item.check_result ?? null}
                    checkedAt={item.checked_at ?? null}
                    requirements={requirements}
                    minIntegrationSeconds={minIntegrationSeconds}
                  />
                )}
              {!locked && item.status === "posted" && verifyBlocked && (
                <p className="text-[11px] text-amber-700 mt-1.5 pl-1">{verifyBlocked}</p>
              )}
            </div>
          );
        })}
      </div>

      {reviewError && <p className="text-xs text-red-600 mt-2">{reviewError}</p>}

      {!locked && adding && (
        <div className="flex flex-wrap items-end gap-2 mt-3">
          <input
            autoFocus
            className={`${inputClass} flex-1`}
            placeholder="e.g. Instagram story 2/3"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          {platforms.length > 1 && (
            <label>
              <span className="block text-xs font-semibold text-slate-600 mb-1">Platform</span>
              <select
                aria-label="Content platform"
                value={draft.platform}
                onChange={(e) => setDraft({ ...draft, platform: e.target.value })}
                className={inputClass}
              >
                <option value="">Choose platform</option>
                {platforms.map((platform) => (
                  <option key={platform} value={platform}>
                    {PLATFORM_META[platform as Platform]?.label ?? platform}
                  </option>
                ))}
              </select>
            </label>
          )}
          <input
            className={`${inputClass} w-36`}
            type="date"
            value={draft.dueDate}
            onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
          />
          <button
            onClick={add}
            disabled={isPending || (platforms.length > 1 && !draft.platform)}
            className="bg-brand hover:bg-brand-dark text-white rounded-md py-1.5 px-3 text-sm font-medium disabled:opacity-60"
          >
            Add
          </button>
          <button onClick={() => setAdding(false)} className="text-sm text-slate-500 hover:text-slate-900 px-1">✕</button>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- shipments */

export function ShipmentsBlock({
  dealId,
  shipments,
  locked = false,
}: {
  dealId: number;
  shipments: Shipment[];
  locked?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ product: "", value: "", address: "" });
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<Record<number, string>>({});

  const add = () => {
    if (!draft.product.trim()) return;
    startTransition(async () => {
      await addShipmentAction(dealId, {
        product: draft.product,
        value: draft.value ? Number(draft.value) : null,
        address: draft.address || null,
      });
      setDraft({ product: "", value: "", address: "" });
      setAdding(false);
    });
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-headline text-sm font-semibold text-slate-900">Product delivery</h3>
        {!locked && !adding && (
          <button onClick={() => setAdding(true)} className="text-xs font-semibold text-brand-dark hover:underline">
            + Add shipment
          </button>
        )}
      </div>

      {shipments.length === 0 && !adding && (
        <p className="text-sm text-slate-400">No product to send for this deal.</p>
      )}

      <div className="space-y-3">
        {shipments.map((s) => (
          <div key={s.id} className="border border-slate-200 rounded-lg p-3">
            <div className="flex items-center gap-3">
              <span
                className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                  s.status === "delivered"
                    ? "bg-emerald-50 text-emerald-700"
                    : s.status === "shipped"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-slate-100 text-slate-600"
                }`}
              >
                {s.status === "to_prepare" ? "To prepare" : s.status === "shipped" ? "Shipped" : "Delivered"}
              </span>
              <span className="text-sm text-slate-800 flex-1">
                {s.product}
                {s.value != null && <span className="text-slate-400 font-tabular"> · {money(s.value)}</span>}
              </span>
              {!locked && s.status !== "delivered" && (
                <button
                  onClick={() =>
                    startTransition(async () => {
                      setProblem(null);
                      const res = await updateShipmentAction(s.id, dealId, {
                        status: s.status === "to_prepare" ? "shipped" : "delivered",
                      });
                      if (res?.error) {
                        setProblem(res.error);
                      } else if (s.status === "to_prepare") {
                        setNote("Shipment marked Shipped.");
                      } else if (res?.resolvedDueDates) {
                        setNote(
                          res.resolvedDueDates > 0
                            ? `Delivered — ${res.resolvedDueDates} content deadline(s) now set from today.`
                            : "Delivered."
                        );
                      }
                    })
                  }
                  disabled={isPending}
                  className="text-xs font-medium text-brand-dark hover:underline disabled:opacity-50"
                >
                  Mark {s.status === "to_prepare" ? "shipped" : "delivered"}
                </button>
              )}
              {!locked && (
                <button
                  onClick={() =>
                    startTransition(async () => {
                      await deleteShipmentAction(s.id, dealId);
                    })
                  }
                  aria-label={`Delete shipment ${s.product}`}
                  className="text-slate-300 hover:text-red-600"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>close</span>
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              {[
                { label: "Carrier", value: s.carrier ?? "", field: "carrier" as const },
                { label: "Tracking number", value: s.tracking ?? "", field: "tracking" as const },
                { label: "Shipping address", value: s.address ?? "", field: "address" as const },
                {
                  label: "Tracking exception",
                  value: s.tracking_exception ?? "",
                  field: "trackingException" as const,
                },
              ].map((entry) => (
                <label key={entry.field} className="min-w-0">
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">
                    {entry.label}
                  </span>
                  <input
                    className={`${inputClass} w-full text-xs`}
                    placeholder={
                      entry.field === "trackingException"
                        ? "Only when normal tracking is unavailable"
                        : entry.label
                    }
                    defaultValue={entry.value}
                    disabled={locked}
                    onBlur={(e) =>
                      startTransition(async () => {
                        setProblem(null);
                        const r = await updateShipmentAction(s.id, dealId, {
                          [entry.field]: e.target.value || null,
                        });
                        if (r?.error) setProblem(r.error);
                      })
                    }
                  />
                </label>
              ))}
            </div>
            {!locked && s.status === "to_prepare" && (
              <p className="text-[11px] text-slate-500 mt-1.5">
                Shipped requires carrier + tracking, or a written tracking exception.
              </p>
            )}
            {/* The creator fills their own delivery details through this link — an
                address dictated over chat arrives wrong and gets retyped anyway. */}
            {!locked && <div className="flex items-center gap-2 mt-2 flex-wrap">
              <button
                onClick={() =>
                  startTransition(async () => {
                    const res = await shareShipmentFormAction(s.id, dealId);
                    if (res.url) {
                      const absolute = `${window.location.origin}${res.url}`;
                      setShareUrl((prev) => ({ ...prev, [s.id]: absolute }));
                      try {
                        await navigator.clipboard.writeText(absolute);
                        setNote("Address form link copied — share it with the creator.");
                      } catch {
                        setNote("Address form link ready — copy it below.");
                      }
                    } else if (res.error) {
                      setNote(res.error);
                    }
                  })
                }
                disabled={isPending}
                className="text-xs font-medium text-brand-dark hover:underline disabled:opacity-50"
              >
                {s.share_token ? "Copy address form link" : "Create address form link"}
              </button>
              {(shareUrl[s.id] ?? (s.share_token ? `/ship/${s.share_token}` : null)) && (
                <code className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 break-all">
                  {shareUrl[s.id] ?? `/ship/${s.share_token}`}
                </code>
              )}
              {s.address_submitted_at && (
                <span className="text-[11px] text-emerald-700">
                  ✓ filled by {s.recipient || "the creator"} on {s.address_submitted_at.slice(0, 10)}
                  {s.phone ? ` · ${s.phone}` : ""}
                </span>
              )}
            </div>}
            {s.delivered_at && (
              <p className="text-xs text-slate-400 mt-1.5">Delivered {s.delivered_at.slice(0, 10)}</p>
            )}
          </div>
        ))}
      </div>

      {note && <p className="text-xs text-emerald-600 mt-2">{note}</p>}
      {problem && <p className="text-xs text-red-600 mt-2" role="alert">{problem}</p>}

      {!locked && adding && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-3">
          <input
            autoFocus
            className={`${inputClass} flex-1`}
            placeholder="Product to send"
            value={draft.product}
            onChange={(e) => setDraft({ ...draft, product: e.target.value })}
          />
          <input
            className={`${inputClass} w-24 text-right font-tabular`}
            type="number"
            placeholder="value $"
            value={draft.value}
            onChange={(e) => setDraft({ ...draft, value: e.target.value })}
          />
          <button onClick={add} disabled={isPending} className="bg-brand hover:bg-brand-dark text-white rounded-md py-1.5 px-3 text-sm font-medium disabled:opacity-60">
            Add
          </button>
          <button onClick={() => setAdding(false)} className="text-sm text-slate-500 hover:text-slate-900 px-1">✕</button>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- payment items */


export function PaymentItemsBlock({
  dealId,
  payments,
  locked = false,
}: {
  dealId: number;
  payments: PaymentItem[];
  locked?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    description: string;
    amount: string;
    trigger: PaymentTrigger;
    requiredVerified: string;
  }>({
    description: "",
    amount: "",
    trigger: "on_verification",
    requiredVerified: "",
  });

  /** Every payment action goes through here so a server-side refusal is shown, not eaten. */
  const runPayment = (action: () => Promise<{ error?: string }>) => {
    setActionError(null);
    startTransition(async () => {
      const result = await action();
      if (result?.error) setActionError(result.error);
    });
  };

  const add = () => {
    if (!draft.description.trim() || !draft.amount) return;
    setActionError(null);
    startTransition(async () => {
      const result = await addPaymentItemAction(dealId, {
        description: draft.description,
        amount: Number(draft.amount),
        trigger: draft.trigger,
        requiredVerified: draft.requiredVerified.trim()
          ? Number(draft.requiredVerified)
          : null,
      });
      if (result?.error) {
        setActionError(result.error);
        return;
      }
      setDraft({ description: "", amount: "", trigger: "on_verification", requiredVerified: "" });
      setAdding(false);
    });
  };

  const total = payments.reduce((s, p) => s + p.amount, 0);
  const unpaid = payments.filter((p) => p.status !== "paid").reduce((s, p) => s + p.amount, 0);

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-headline text-sm font-semibold text-slate-900">
          Payments{" "}
          <span className="font-normal text-slate-400 font-tabular">
            {money(unpaid)} outstanding of {money(total)}
          </span>
        </h3>
        {!locked && !adding && (
          <button onClick={() => setAdding(true)} className="text-xs font-semibold text-brand-dark hover:underline">
            + Add payment
          </button>
        )}
      </div>

      {payments.length === 0 && !adding && (
        <p className="text-sm text-slate-400">
          No payments — gifted deal, or confirm the contract to generate them.
        </p>
      )}

      {actionError && <p className="text-xs text-red-600 mb-2">{actionError}</p>}

      <div className="divide-y divide-slate-100">
        {payments.map((p) => (
          <div key={p.id} id={`payment-${p.id}`} className="flex items-center gap-3 py-2.5 scroll-mt-28">
            <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${TONE_CLASS[PAYMENT_TONE[p.status]]}`}>
              {p.status === "approvable" ? "Ready to approve" : p.status[0].toUpperCase() + p.status.slice(1)}
            </span>
            <span className="text-sm text-slate-800 flex-1">
              {p.description}
              <span className="text-xs text-slate-400">
                {" "}· {PAYMENT_TRIGGER_LABEL[p.trigger]}
                {p.trigger === "on_verification" && p.required_verified != null
                  ? ` (after ${p.required_verified} verified)`
                  : ""}
              </span>
            </span>
            <span className="font-tabular text-sm font-semibold text-slate-900">{money(p.amount)}</span>
            {!locked && p.status === "approvable" && (
              <button
                onClick={() => runPayment(() => setPaymentStatusAction(p.id, dealId, "approved"))}
                disabled={isPending}
                className="text-xs font-medium text-brand-dark hover:underline disabled:opacity-50"
              >
                Approve
              </button>
            )}
            {!locked && p.status === "approved" && (
              <button
                onClick={() => runPayment(() => setPaymentStatusAction(p.id, dealId, "paid"))}
                disabled={isPending}
                className="text-xs font-medium text-brand-dark hover:underline disabled:opacity-50"
              >
                Mark paid
              </button>
            )}
            {p.status === "pending" && (
              <span className="text-xs text-slate-400">{pendingReason(p)}</span>
            )}
            {!locked && p.status === "approved" && (
              <button
                onClick={() => runPayment(() => setPaymentStatusAction(p.id, dealId, "approvable"))}
                disabled={isPending}
                className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-50"
                title="Undo approval"
              >
                undo
              </button>
            )}
            {/* Deleting a payment removes money from every total and export — it gets a
                confirm, and paid rows are refused server-side regardless. */}
            {p.status !== "paid" && (
              <button
                onClick={() => {
                  if (!window.confirm(`Delete the ${money(p.amount)} payment "${p.description}"?`))
                    return;
                  runPayment(() => deletePaymentItemAction(p.id, dealId));
                }}
                disabled={isPending}
                aria-label={`Delete payment ${p.description}`}
                className="text-slate-300 hover:text-red-600 disabled:opacity-50"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>close</span>
              </button>
            )}
          </div>
        ))}
      </div>

      {!locked && adding && (
        <div className="flex items-center gap-2 mt-3">
          <input
            autoFocus
            className={`${inputClass} flex-1`}
            placeholder="e.g. Fee on publication"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
          <input
            className={`${inputClass} w-24 text-right font-tabular`}
            type="number"
            placeholder="$"
            value={draft.amount}
            onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
          />
          <select
            className={`${inputClass} w-44`}
            value={draft.trigger}
            onChange={(e) => setDraft({ ...draft, trigger: e.target.value as PaymentTrigger })}
          >
            {(Object.keys(PAYMENT_TRIGGER_LABEL) as PaymentTrigger[]).map((t) => (
              <option key={t} value={t}>
                {PAYMENT_TRIGGER_LABEL[t]}
              </option>
            ))}
          </select>
          {/* Milestone gate — "50% after half the videos". Blank keeps the strict
              all-verified default. */}
          {draft.trigger === "on_verification" && (
            <input
              className={`${inputClass} w-28 text-right font-tabular`}
              type="number"
              min="1"
              placeholder="after N (all)"
              title="How many content items must be verified before this unlocks — blank means all of them"
              value={draft.requiredVerified}
              onChange={(e) => setDraft({ ...draft, requiredVerified: e.target.value })}
            />
          )}
          <button onClick={add} disabled={isPending} className="bg-brand hover:bg-brand-dark text-white rounded-md py-1.5 px-3 text-sm font-medium disabled:opacity-60">
            Add
          </button>
          <button onClick={() => setAdding(false)} className="text-sm text-slate-500 hover:text-slate-900 px-1">✕</button>
        </div>
      )}
    </div>
  );
}
