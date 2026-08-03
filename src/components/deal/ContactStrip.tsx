"use client";

import { useState } from "react";

/**
 * The creator's coordinates, on the screen where every "check in with them" journey
 * lands. Before this existed, the attention panel said "chase Coastal Cruiser" and the
 * page it linked to had neither their email nor their portal link — the app knew both,
 * three clicks away, which is the distance at which things stop being used.
 *
 * The portal URL is assembled client-side from location.origin: the server doesn't know
 * what host the manager is browsing on, and a copied relative path is a broken link.
 */
export default function ContactStrip({
  email,
  portalPath,
  creator,
}: {
  email: string | null;
  portalPath: string | null;
  creator: string;
}) {
  const [copied, setCopied] = useState<"email" | "portal" | null>(null);

  const copy = (what: "email" | "portal", text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(what);
        setTimeout(() => setCopied(null), 1500);
      })
      .catch(() => {});
  };

  if (!email && !portalPath) return null;

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm px-4 py-2.5 flex items-center gap-4 flex-wrap text-xs">
      <span className="font-medium text-slate-600">Reach {creator}:</span>
      {email && (
        <span className="flex items-center gap-1.5">
          <a href={`mailto:${email}`} className="text-brand-dark hover:underline">
            {email}
          </a>
          <button
            onClick={() => copy("email", email)}
            className="text-slate-400 hover:text-slate-700 font-medium"
          >
            {copied === "email" ? "copied ✓" : "copy"}
          </button>
        </span>
      )}
      {portalPath && (
        <span className="flex items-center gap-1.5">
          <span className="text-slate-500">Portal link</span>
          <button
            onClick={() => copy("portal", `${window.location.origin}${portalPath}`)}
            className="text-slate-400 hover:text-slate-700 font-medium"
          >
            {copied === "portal" ? "copied ✓" : "copy"}
          </button>
          <span className="text-slate-400">— their drafts, delivery and payments; share it only with them</span>
        </span>
      )}
    </div>
  );
}
