"use client";

import { useState, useTransition } from "react";
import { generateApiKeyAction, revokeApiKeyAction } from "@/app/settings/actions";

/**
 * Where the programmatic API is set up and explained. The rule it teaches: no key, no
 * API — generating the key IS switching it on, and revoking it switches it off.
 *
 * The endpoint URL and the example are assembled client-side from location.origin, so
 * what the manager copies works on whatever host and port they are actually browsing.
 */
export default function ApiAccessBlock({ currentKey }: { currentKey: string | null }) {
  const [key, setKey] = useState<string | null>(currentKey);
  const [confirming, setConfirming] = useState<"regenerate" | "revoke" | null>(null);
  const [copied, setCopied] = useState<"key" | "example" | null>(null);
  const [isPending, startTransition] = useTransition();

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const endpoint = `${origin}/api/deals/bulk`;

  const example = key
    ? [
        `curl -X POST ${endpoint} \\`,
        `  -H "Authorization: Bearer ${key}" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '[{"creatorName":"Creator Name","platform":"youtube","email":"them@example.com"}]'`,
      ].join("\n")
    : null;

  const copy = (what: "key" | "example", text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => {});
  };

  const generate = () =>
    startTransition(async () => {
      const r = await generateApiKeyAction();
      if (r.key) setKey(r.key);
      setConfirming(null);
    });

  const revoke = () =>
    startTransition(async () => {
      await revokeApiKeyAction();
      setKey(null);
      setConfirming(null);
    });

  return (
    <div className="p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-900">API access</span>
        <span className={`text-sm font-medium ${key ? "text-emerald-600" : "text-slate-400"}`}>
          {key ? "Enabled" : "Off — no key"}
        </span>
      </div>
      <p className="text-xs text-slate-500 mt-1 max-w-[70ch]">
        Lets an outreach tool or script add deals in bulk (<code className="text-slate-600">POST {endpoint || "/api/deals/bulk"}</code>).
        Rows land as leads or contacted deals — the import never runs analyses. Without a
        key the endpoint refuses everything; the key below must be sent as{" "}
        <code className="text-slate-600">Authorization: Bearer …</code> or{" "}
        <code className="text-slate-600">x-api-key</code>.
      </p>

      {key ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1">
              {key.slice(0, 9)}…{key.slice(-4)}
            </code>
            <button
              onClick={() => copy("key", key)}
              className="text-xs font-medium text-brand-dark hover:underline"
            >
              {copied === "key" ? "copied ✓" : "Copy key"}
            </button>
            <button
              onClick={() => (confirming === "regenerate" ? generate() : setConfirming("regenerate"))}
              disabled={isPending}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50"
            >
              {confirming === "regenerate" ? "Really regenerate? Old key stops working" : "Regenerate"}
            </button>
            <button
              onClick={() => (confirming === "revoke" ? revoke() : setConfirming("revoke"))}
              disabled={isPending}
              className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              {confirming === "revoke" ? "Really turn the API off?" : "Revoke"}
            </button>
          </div>
          {example && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="label-caps text-slate-500">
                  Working example
                </span>
                <button
                  onClick={() => copy("example", example)}
                  className="text-xs font-medium text-brand-dark hover:underline"
                >
                  {copied === "example" ? "copied ✓" : "Copy"}
                </button>
              </div>
              <pre className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-md p-2.5 overflow-x-auto whitespace-pre">
                {example}
              </pre>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={generate}
          disabled={isPending}
          className="mt-3 bg-brand hover:bg-brand-dark text-white rounded-md py-1.5 px-4 text-xs font-semibold transition-colors disabled:opacity-50"
        >
          {isPending ? "Generating…" : "Generate API key"}
        </button>
      )}
    </div>
  );
}
