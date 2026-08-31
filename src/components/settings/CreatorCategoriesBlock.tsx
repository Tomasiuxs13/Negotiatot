"use client";

import { useState, useTransition } from "react";
import { saveCreatorCategoriesAction } from "@/app/settings/actions";

/**
 * The taxonomy the whole app groups creators by. Editing is a plain textarea, one per
 * line, because a list of a dozen words does not need a row editor with add and delete
 * buttons — and pasting the list you already keep elsewhere should just work.
 *
 * Usage counts sit next to each name so an empty bucket is obvious before it reaches
 * Benchmarks, where a category holding one deal is an average of one deal.
 */
export default function CreatorCategoriesBlock({
  categories,
  usage,
}: {
  categories: string[];
  usage: { category: string; count: number; inList: boolean }[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(categories.join("\n"));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const retired = usage.filter((u) => !u.inList && u.count > 0);

  const save = () =>
    startTransition(async () => {
      const result = await saveCreatorCategoriesAction(draft);
      if (result.error) setError(result.error);
      else {
        setError(null);
        setEditing(false);
      }
    });

  return (
    <div className="p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-900">Creator categories</span>
        <button
          onClick={() => {
            setDraft(categories.join("\n"));
            setEditing((v) => !v);
          }}
          className="text-xs font-medium text-brand-dark hover:underline"
        >
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>
      <p className="text-xs text-slate-500 mt-1 max-w-[70ch]">
        What a creator&apos;s channel is about, picked at intake and on their profile.
        Benchmarks groups your real CPM by these, so a hunting channel and a tech channel
        stop sharing one average. A fixed list on purpose — free text would split
        &ldquo;outdoors&rdquo; and &ldquo;Outdoor&rdquo; into two buckets of one deal each.
      </p>

      {editing ? (
        <div className="mt-3 space-y-2">
          <textarea
            aria-label="Creator categories, one per line"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            placeholder={"One per line\nFishing\nTravel"}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={isPending}
              className="bg-brand hover:bg-brand-dark text-white rounded-md py-1.5 px-4 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save list"}
            </button>
            <span className="text-xs text-slate-500">
              Removing one leaves the creators in it — they keep the label until you change it.
            </span>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {usage.length === 0 && (
            <span className="text-xs text-slate-400">No categories yet — add some.</span>
          )}
          {usage.map((u) => (
            <span
              key={u.category}
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${
                u.inList
                  ? "bg-slate-100 text-slate-700"
                  : "bg-amber-50 text-amber-700 border border-amber-200"
              }`}
              title={u.inList ? undefined : "Not in the list any more — still on these creators"}
            >
              {u.category}
              <span className="font-data text-slate-400">{u.count}</span>
            </span>
          ))}
        </div>
      )}

      {!editing && retired.length > 0 && (
        <p className="text-xs text-amber-700 mt-2">
          {retired.length} category{retired.length === 1 ? "" : " values"} no longer on the list
          {" "}still hold creators.
        </p>
      )}
    </div>
  );
}
