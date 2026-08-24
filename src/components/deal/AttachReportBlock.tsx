"use client";

import { useRef, useState, useTransition } from "react";
import { attachReportAndAnalyze } from "@/app/deals/[id]/actions";

/**
 * Attach an analytics report after intake. Until this existed the intake form was the
 * only door a Modash/HypeAuditor document could enter through, and the workaround for
 * "the report arrived a day after I created the deal" was deleting the deal.
 *
 * Deliberately one control, not upload-then-analyze as two steps: a stored-but-unread
 * report is a number nobody is looking at, and the only reason to attach one is to
 * re-price on it.
 */
export default function AttachReportBlock({ dealId }: { dealId: number }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a PDF report or a screenshot first.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("report", file);
    startTransition(async () => {
      const r = await attachReportAndAnalyze(dealId, fd);
      if (r?.error) {
        setError(r.error);
        return;
      }
      // The page revalidates into the "Analyzing…" job state; clear the picker so a
      // second attach later starts clean.
      if (fileRef.current) fileRef.current.value = "";
      setFileName(null);
    });
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
      <h3 className="font-headline text-sm font-semibold text-slate-900">Analytics report</h3>
      <p className="text-xs text-slate-500 mt-0.5 mb-2">
        Modash / HypeAuditor PDF or a screenshot — attaching one re-runs the analysis on
        its figures. Hand-corrected views keep priority.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => {
          setFileName(e.target.files?.[0]?.name ?? null);
          setError(null);
        }}
        className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border file:border-slate-200 file:bg-white file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:border-slate-400 file:cursor-pointer"
      />
      {fileName && (
        <button
          onClick={submit}
          disabled={isPending}
          className="mt-2 w-full bg-brand hover:bg-brand-dark text-white rounded-md py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
        >
          {isPending ? "Uploading…" : "Analyze with this report"}
        </button>
      )}
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  );
}
