"use client";

import { useState, useTransition } from "react";
import { requestDueDateAction } from "@/app/portal/actions";

export default function DueDateRequestForm({
  token,
  contentItemId,
  currentDate,
  requestedDate,
  requestedReason,
}: {
  token: string;
  contentItemId: number;
  currentDate: string | null;
  requestedDate: string | null;
  requestedReason: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [dueDate, setDueDate] = useState(requestedDate ?? currentDate ?? "");
  const [reason, setReason] = useState(requestedReason ?? "");
  const [savedRequest, setSavedRequest] = useState<{ date: string; reason: string } | null>(
    requestedDate ? { date: requestedDate, reason: requestedReason ?? "" } : null
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (savedRequest) {
    return (
      <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
        <p className="font-semibold">New date requested: {savedRequest.date}</p>
        {savedRequest.reason && <p className="mt-1 whitespace-pre-wrap">{savedRequest.reason}</p>}
        <p className="mt-1 text-amber-800">Waiting for the manager to approve it.</p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-xs font-medium text-brand-dark hover:underline"
      >
        Request a different publication date
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-700">Proposed new date</span>
        <input
          type="date"
          value={dueDate}
          min={new Date().toISOString().slice(0, 10)}
          onChange={(event) => setDueDate(event.target.value)}
          className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 sm:w-48"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-700">Why do you need to change it?</span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Give the manager enough context to decide"
          className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setProblem(null);
            startTransition(async () => {
              const result = await requestDueDateAction(token, contentItemId, { dueDate, reason });
              if (result.error) {
                setProblem(result.error);
                return;
              }
              setSavedRequest({ date: dueDate, reason: reason.trim() });
              setOpen(false);
            });
          }}
          disabled={isPending || !dueDate || !reason.trim()}
          className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {isPending ? "Sending…" : "Send date request"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setProblem(null);
          }}
          className="px-1 text-xs text-slate-500"
        >
          Cancel
        </button>
      </div>
      {problem && <p className="text-xs text-red-600">{problem}</p>}
      <p className="text-[11px] text-slate-500">
        Your current publication date stays in place until the manager approves this request.
      </p>
    </div>
  );
}
