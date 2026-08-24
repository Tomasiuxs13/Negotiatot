"use client";

import { useState, useTransition } from "react";
import {
  addReminderAction,
  deleteReminderAction,
  setReminderStatusAction,
} from "@/app/reminders-actions";
import type { Reminder } from "@/lib/reminders";

/**
 * The manager's own follow-ups on this deal or partner — "they said ask again in three
 * months" is a promise that lives in nobody's data, so it gets written down here and
 * resurfaces on the dashboard when the date arrives.
 */
export default function RemindersBlock({
  reminders,
  dealId,
  partnerId,
}: {
  reminders: Reminder[];
  dealId?: number;
  partnerId?: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const run = (action: () => Promise<{ error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result?.error) setError(result.error);
      else {
        setTitle("");
        setDueOn("");
        setAdding(false);
      }
    });
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-headline text-sm font-semibold text-slate-900">Your reminders</h3>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-xs font-semibold text-brand-dark hover:underline"
          >
            + Add reminder
          </button>
        )}
      </div>

      {reminders.length === 0 && !adding && (
        <p className="text-sm text-slate-400">
          Nothing noted — add one when a creator says &quot;try again in three months&quot; and
          it will resurface on your dashboard that day.
        </p>
      )}

      {reminders.length > 0 && (
        <div className="divide-y divide-slate-100">
          {reminders.map((r) => {
            const overdue = r.status === "open" && r.due_on <= today;
            return (
              <div key={r.id} className="flex items-center gap-3 py-2">
                <input
                  type="checkbox"
                  checked={r.status === "done"}
                  disabled={isPending}
                  aria-label={`Mark "${r.title}" ${r.status === "done" ? "open" : "done"}`}
                  onChange={() =>
                    run(() =>
                      setReminderStatusAction(r.id, r.status === "done" ? "open" : "done")
                    )
                  }
                  className="accent-brand w-4 h-4"
                />
                <span
                  className={`text-sm flex-1 ${
                    r.status === "done" ? "text-slate-400 line-through" : "text-slate-800"
                  }`}
                >
                  {r.title}
                </span>
                <span
                  className={`text-xs font-tabular ${
                    overdue ? "text-amber-600 font-semibold" : "text-slate-400"
                  }`}
                >
                  {r.due_on}
                </span>
                <button
                  onClick={() => run(() => deleteReminderAction(r.id))}
                  disabled={isPending}
                  aria-label={`Delete reminder ${r.title}`}
                  className="text-slate-300 hover:text-red-600 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                    close
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <div className="flex flex-wrap items-end gap-2 mt-3">
          <label className="flex-1 min-w-56">
            <span className="block text-xs font-semibold text-slate-600 mb-1">Reminder</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Reach out again — they asked for 3 months"
              className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm text-slate-800"
              autoFocus
            />
          </label>
          <label>
            <span className="block text-xs font-semibold text-slate-600 mb-1">Due date</span>
            <input
              type="date"
              value={dueOn}
              min={today}
              onChange={(e) => setDueOn(e.target.value)}
              className="border border-slate-200 rounded-md px-2 py-1.5 text-xs text-slate-700"
            />
          </label>
          <button
            onClick={() => run(() => addReminderAction({ title, dueOn, dealId, partnerId }))}
            disabled={isPending}
            className="text-xs font-medium bg-slate-900 text-white rounded-md px-3 py-1.5 hover:bg-slate-800 disabled:opacity-60"
          >
            Save
          </button>
          <button
            onClick={() => {
              setAdding(false);
              setError(null);
            }}
            disabled={isPending}
            className="text-xs text-slate-500 hover:text-slate-800 px-1"
          >
            Cancel
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
