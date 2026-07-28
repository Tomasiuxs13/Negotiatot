"use client";

import { useState, useTransition } from "react";
import type { ContentItem, PaymentItem, Shipment, ContentStatus, PaymentTrigger } from "@/lib/fulfillment-types";
import { CONTENT_STATUS_FLOW, CONTENT_STATUS_LABEL, PAYMENT_TRIGGER_LABEL, pendingReason } from "@/lib/fulfillment-types";
import { isOverdue } from "@/lib/fulfillment-rules";
import { money } from "@/lib/format";
import {
  addContentItemAction,
  addPaymentItemAction,
  addShipmentAction,
  deleteContentItemAction,
  deletePaymentItemAction,
  deleteShipmentAction,
  setContentStatusAction,
  setPaymentStatusAction,
  updateContentItemAction,
  updateShipmentAction,
} from "@/app/deals/[id]/fulfillment-actions";

const inputClass =
  "border border-slate-200 rounded-md bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand";

const STATUS_TONE: Record<ContentStatus, string> = {
  planned: "bg-slate-100 text-slate-600",
  in_production: "bg-sky-50 text-sky-700",
  submitted: "bg-violet-50 text-violet-700",
  approved: "bg-indigo-50 text-indigo-700",
  posted: "bg-amber-50 text-amber-700",
  verified: "bg-emerald-50 text-emerald-700",
};

/* ----------------------------------------------------------- content items */

export function ContentItemsBlock({
  dealId,
  items,
}: {
  dealId: number;
  items: ContentItem[];
}) {
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: "", dueDate: "" });
  const [urlEdit, setUrlEdit] = useState<Record<number, string>>({});

  const add = () => {
    if (!draft.title.trim()) return;
    startTransition(async () => {
      await addContentItemAction(dealId, {
        title: draft.title,
        dueDate: draft.dueDate || null,
      });
      setDraft({ title: "", dueDate: "" });
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
        {!adding && (
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
          const currentIndex = CONTENT_STATUS_FLOW.indexOf(item.status);
          const next = CONTENT_STATUS_FLOW[currentIndex + 1];
          return (
            <div key={item.id} className="py-2.5">
              <div className="flex items-center gap-3">
                <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${STATUS_TONE[item.status]}`}>
                  {CONTENT_STATUS_LABEL[item.status]}
                </span>
                <span className="text-sm text-slate-800 flex-1">{item.title}</span>
                <span
                  className={`text-xs font-tabular ${overdue ? "text-red-600 font-semibold" : "text-slate-400"}`}
                >
                  {item.due_date ?? (item.due_days_after_delivery != null ? `+${item.due_days_after_delivery}d after delivery` : "no date")}
                  {overdue && " · overdue"}
                </span>
                {next && (
                  <button
                    onClick={() =>
                      startTransition(async () => {
                        await setContentStatusAction(item.id, dealId, next);
                      })
                    }
                    disabled={isPending}
                    className="text-xs font-medium text-brand-dark hover:underline disabled:opacity-50"
                  >
                    Mark {CONTENT_STATUS_LABEL[next].toLowerCase()}
                  </button>
                )}
                <button
                  onClick={() =>
                    startTransition(async () => {
                      await deleteContentItemAction(item.id, dealId);
                    })
                  }
                  className="text-slate-300 hover:text-red-600"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>close</span>
                </button>
              </div>
              {(item.status === "posted" || item.status === "verified" || item.posted_url) && (
                <div className="flex items-center gap-2 mt-1.5 pl-1">
                  <input
                    className={`${inputClass} flex-1 text-xs`}
                    placeholder="Live URL"
                    defaultValue={item.posted_url ?? ""}
                    onChange={(e) => setUrlEdit({ ...urlEdit, [item.id]: e.target.value })}
                    onBlur={() => {
                      const value = urlEdit[item.id];
                      if (value === undefined || value === (item.posted_url ?? "")) return;
                      startTransition(async () => {
                        await updateContentItemAction(item.id, dealId, { postedUrl: value || null });
                      });
                    }}
                  />
                  {item.posted_url && (
                    <a href={item.posted_url} target="_blank" rel="noreferrer" className="text-xs text-brand-dark hover:underline">
                      open
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {adding && (
        <div className="flex items-center gap-2 mt-3">
          <input
            autoFocus
            className={`${inputClass} flex-1`}
            placeholder="e.g. Instagram story 2/3"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <input
            className={`${inputClass} w-36`}
            type="date"
            value={draft.dueDate}
            onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
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

/* --------------------------------------------------------------- shipments */

export function ShipmentsBlock({ dealId, shipments }: { dealId: number; shipments: Shipment[] }) {
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ product: "", value: "", address: "" });
  const [note, setNote] = useState<string | null>(null);

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
        {!adding && (
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
              {s.status !== "delivered" && (
                <button
                  onClick={() =>
                    startTransition(async () => {
                      const res = await updateShipmentAction(s.id, dealId, {
                        status: s.status === "to_prepare" ? "shipped" : "delivered",
                      });
                      if (s.status === "shipped" && res?.resolvedDueDates) {
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
              <button
                onClick={() =>
                  startTransition(async () => {
                    await deleteShipmentAction(s.id, dealId);
                  })
                }
                className="text-slate-300 hover:text-red-600"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>close</span>
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                className={`${inputClass} w-32 text-xs`}
                placeholder="Carrier"
                defaultValue={s.carrier ?? ""}
                onBlur={(e) =>
                  startTransition(async () => {
                    await updateShipmentAction(s.id, dealId, { carrier: e.target.value || null });
                  })
                }
              />
              <input
                className={`${inputClass} flex-1 text-xs`}
                placeholder="Tracking number"
                defaultValue={s.tracking ?? ""}
                onBlur={(e) =>
                  startTransition(async () => {
                    await updateShipmentAction(s.id, dealId, { tracking: e.target.value || null });
                  })
                }
              />
              <input
                className={`${inputClass} flex-1 text-xs`}
                placeholder="Shipping address"
                defaultValue={s.address ?? ""}
                onBlur={(e) =>
                  startTransition(async () => {
                    await updateShipmentAction(s.id, dealId, { address: e.target.value || null });
                  })
                }
              />
            </div>
            {s.delivered_at && (
              <p className="text-xs text-slate-400 mt-1.5">Delivered {s.delivered_at.slice(0, 10)}</p>
            )}
          </div>
        ))}
      </div>

      {note && <p className="text-xs text-emerald-600 mt-2">{note}</p>}

      {adding && (
        <div className="flex items-center gap-2 mt-3">
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

const PAYMENT_TONE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  approvable: "bg-amber-50 text-amber-700",
  approved: "bg-sky-50 text-sky-700",
  paid: "bg-emerald-50 text-emerald-700",
};

export function PaymentItemsBlock({ dealId, payments }: { dealId: number; payments: PaymentItem[] }) {
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ description: string; amount: string; trigger: PaymentTrigger }>({
    description: "",
    amount: "",
    trigger: "on_verification",
  });

  const add = () => {
    if (!draft.description.trim() || !draft.amount) return;
    startTransition(async () => {
      await addPaymentItemAction(dealId, {
        description: draft.description,
        amount: Number(draft.amount),
        trigger: draft.trigger,
      });
      setDraft({ description: "", amount: "", trigger: "on_verification" });
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
        {!adding && (
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

      <div className="divide-y divide-slate-100">
        {payments.map((p) => (
          <div key={p.id} className="flex items-center gap-3 py-2.5">
            <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${PAYMENT_TONE[p.status]}`}>
              {p.status === "approvable" ? "Ready to approve" : p.status[0].toUpperCase() + p.status.slice(1)}
            </span>
            <span className="text-sm text-slate-800 flex-1">
              {p.description}
              <span className="text-xs text-slate-400"> · {PAYMENT_TRIGGER_LABEL[p.trigger]}</span>
            </span>
            <span className="font-tabular text-sm font-semibold text-slate-900">{money(p.amount)}</span>
            {p.status === "approvable" && (
              <button
                onClick={() =>
                  startTransition(async () => {
                    await setPaymentStatusAction(p.id, dealId, "approved");
                  })
                }
                disabled={isPending}
                className="text-xs font-medium text-brand-dark hover:underline disabled:opacity-50"
              >
                Approve
              </button>
            )}
            {p.status === "approved" && (
              <button
                onClick={() =>
                  startTransition(async () => {
                    await setPaymentStatusAction(p.id, dealId, "paid");
                  })
                }
                disabled={isPending}
                className="text-xs font-medium text-brand-dark hover:underline disabled:opacity-50"
              >
                Mark paid
              </button>
            )}
            {p.status === "pending" && (
              <span className="text-xs text-slate-400">{pendingReason(p)}</span>
            )}
            {p.status === "approved" && (
              <button
                onClick={() =>
                  startTransition(async () => {
                    await setPaymentStatusAction(p.id, dealId, "approvable");
                  })
                }
                disabled={isPending}
                className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-50"
                title="Undo approval"
              >
                undo
              </button>
            )}
            <button
              onClick={() =>
                startTransition(async () => {
                  await deletePaymentItemAction(p.id, dealId);
                })
              }
              className="text-slate-300 hover:text-red-600"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>close</span>
            </button>
          </div>
        ))}
      </div>

      {adding && (
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
          <button onClick={add} disabled={isPending} className="bg-brand hover:bg-brand-dark text-white rounded-md py-1.5 px-3 text-sm font-medium disabled:opacity-60">
            Add
          </button>
          <button onClick={() => setAdding(false)} className="text-sm text-slate-500 hover:text-slate-900 px-1">✕</button>
        </div>
      )}
    </div>
  );
}
