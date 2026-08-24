"use client";

import { useState, useTransition } from "react";
import {
  formatDuration,
  formatTimestamp,
  integrationSeconds,
  parseCheck,
  type BriefRequirement,
} from "@/lib/brief-requirements";
import {
  draftCheckChangeRequest,
  runIntegrationCheck,
  signVideoUpload,
} from "@/app/deals/[id]/check-actions";
import { requestChangesAction } from "@/app/deals/[id]/fulfillment-actions";

const STATUS_STYLE = {
  met: { dot: "bg-emerald-500", text: "text-slate-700" },
  missed: { dot: "bg-red-500", text: "text-red-700 font-medium" },
  unclear: { dot: "bg-amber-400", text: "text-amber-700" },
} as const;

/**
 * Checks a posted video against the campaign brief, and turns any failures into a
 * change-request email.
 *
 * The report never decides anything on its own. Findings come from a model reading a
 * machine transcript, and the consequence of a wrong "missed" is telling a creator they
 * broke a brief they actually followed — or, downstream, withholding a payment that
 * gates on verification. So the check pre-fills, and the manager commits.
 */
export default function IntegrationCheckBlock({
  contentItemId,
  dealId,
  checkResult,
  checkedAt,
  requirements,
  minIntegrationSeconds,
}: {
  contentItemId: number;
  dealId: number;
  checkResult: string | null;
  checkedAt: string | null;
  requirements: BriefRequirement[];
  minIntegrationSeconds: number | null;
}) {
  const [mediaUrl, setMediaUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  /**
   * Upload straight to fal, then check. XHR rather than fetch purely for progress —
   * a 500MB upload with no feedback reads as a hung page, and this is the one step
   * whose duration depends on the creator's connection rather than on us.
   */
  const upload = async (file: File) => {
    setError(null);
    const signed = await signVideoUpload(file.name, file.type || "video/mp4", file.size);
    if (signed.error || !signed.uploadUrl || !signed.fileUrl) {
      setError(signed.error ?? "Could not start the upload.");
      return;
    }
    setUploadPct(0);
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", signed.uploadUrl!);
        xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Upload failed (${xhr.status}).`));
        xhr.onerror = () => reject(new Error("Upload failed — check the connection."));
        xhr.send(file);
      });
    } catch (err) {
      setUploadPct(null);
      setError(err instanceof Error ? err.message : "Upload failed.");
      return;
    }
    setUploadPct(null);
    startTransition(async () => {
      const r = await runIntegrationCheck(contentItemId, signed.fileUrl!);
      if (r?.error) setError(r.error);
    });
  };

  const check = parseCheck(checkResult);
  const seconds = check ? integrationSeconds(check) : null;
  const short =
    seconds != null && minIntegrationSeconds != null && seconds < minIntegrationSeconds;
  const missed = check?.findings.filter((f) => f.status === "missed").length ?? 0;
  const unclear = check?.findings.filter((f) => f.status === "unclear").length ?? 0;

  const run = () => {
    setError(null);
    const url = mediaUrl.trim();
    if (!url) return setError("Paste a direct link to the video or audio file.");
    startTransition(async () => {
      const r = await runIntegrationCheck(contentItemId, url);
      if (r?.error) setError(r.error);
    });
  };

  const draft = () => {
    setError(null);
    startTransition(async () => {
      const r = await draftCheckChangeRequest(contentItemId);
      if (r.error) setError(r.error);
      else setEmail(r.email ?? "");
    });
  };

  const label = (id: string) => requirements.find((r) => r.id === id)?.label ?? id;

  return (
    <div className="mt-2 border-t border-slate-100 pt-2">
      {!check ? (
        uploadPct != null ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-slate-100 rounded-full h-1.5">
              <div
                className="bg-brand h-1.5 rounded-full transition-all"
                style={{ width: `${uploadPct}%` }}
              />
            </div>
            <span className="text-xs text-slate-500 font-tabular">{uploadPct}%</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs font-medium text-brand-dark hover:underline cursor-pointer whitespace-nowrap">
              {isPending ? "Checking…" : "Upload video"}
              <input
                type="file"
                accept="video/*,audio/*"
                className="hidden"
                disabled={isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                  e.target.value = "";
                }}
              />
            </label>
            <span className="text-xs text-slate-300">or</span>
            <input
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder="paste a direct media link"
              className="flex-1 min-w-[180px] border border-slate-200 rounded-md px-2 py-1 text-xs"
            />
            <button
              onClick={run}
              disabled={isPending}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-60 whitespace-nowrap"
            >
              Check
            </button>
          </div>
        )
      ) : (
        <div>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="font-semibold text-slate-900">Brief check</span>
            {seconds != null && (
              <span
                className={`font-tabular ${short ? "text-red-600 font-medium" : "text-slate-600"}`}
              >
                {formatDuration(seconds)}
                {minIntegrationSeconds != null && ` / ${minIntegrationSeconds}s asked`}
                {check.integrationStartSeconds != null &&
                  ` · from ${formatTimestamp(check.integrationStartSeconds)}`}
              </span>
            )}
            {missed > 0 && (
              <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-red-50 text-red-700">
                {missed} missed
              </span>
            )}
            {unclear > 0 && (
              <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-amber-50 text-amber-700">
                {unclear} unclear
              </span>
            )}
            {missed === 0 && unclear === 0 && (
              <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700">
                all met
              </span>
            )}
            {checkedAt && (
              <span className="text-slate-400 font-tabular ml-auto">{checkedAt.slice(0, 16)}</span>
            )}
          </div>

          {check.summary && <p className="text-xs text-slate-500 mt-1">{check.summary}</p>}

          <ul className="mt-2 space-y-1">
            {check.findings.map((f) => {
              const style = STATUS_STYLE[f.status];
              return (
                <li key={f.id} className="flex gap-2 text-xs">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${style.dot}`} />
                  <span className="min-w-0">
                    <span className={style.text}>{label(f.id)}</span>
                    {f.atSeconds != null && (
                      <span className="text-slate-400 font-tabular"> · {formatTimestamp(f.atSeconds)}</span>
                    )}
                    {f.evidence && (
                      <span className="text-slate-400"> — &ldquo;{f.evidence}&rdquo;</span>
                    )}
                    {f.note && <span className="text-slate-400"> {f.note}</span>}
                  </span>
                </li>
              );
            })}
          </ul>

          {(missed > 0 || short) && !email && (
            <button
              onClick={draft}
              disabled={isPending}
              className="mt-2 text-xs font-medium text-brand-dark hover:underline disabled:opacity-60"
            >
              {isPending ? "Drafting…" : "Draft change request"}
            </button>
          )}
        </div>
      )}

      {email !== null && (
        <div className="mt-2">
          <textarea
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            rows={10}
            className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs font-mono"
          />
          <div className="flex items-center gap-3 mt-1">
            <button
              onClick={() => navigator.clipboard.writeText(email).catch(() => {})}
              className="text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Copy
            </button>
            <button
              onClick={() =>
                startTransition(async () => {
                  const r = await requestChangesAction(contentItemId, dealId, email);
                  if (r?.error) setError(r.error);
                  else setSent(true);
                })
              }
              disabled={isPending || sent}
              className="text-xs font-medium bg-slate-900 text-white rounded-md px-3 py-1 hover:bg-slate-800 disabled:opacity-60"
            >
              {sent ? "Sent back for changes" : "Send back for changes"}
            </button>
            <span className="text-[11px] text-slate-400">
              Nothing is emailed — copy this and send it yourself.
            </span>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
