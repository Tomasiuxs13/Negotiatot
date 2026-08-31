"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchAction } from "@/app/search-actions";
import { SEARCH_MIN_CHARS } from "@/lib/search";
import type { SearchHit } from "@/lib/db";

/** Dispatched by the header's search bar; the palette lives elsewhere and listens. */
export const OPEN_SEARCH_EVENT = "counterpart:open-search";

export function openGlobalSearch() {
  window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT));
}

/**
 * Search across creators and deals, from anywhere.
 *
 * The palette is mounted once in the shell rather than in the page header, because the
 * deal workspace has its own top bar and would otherwise be the one screen you cannot
 * search from — which is exactly where you are when you need to find another creator.
 * The header's bar is a trigger for this, not a second implementation of it.
 */
export default function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [isPending, startTransition] = useTransition();

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHits([]);
    setActive(0);
  }, []);

  // ⌘K / Ctrl-K from anywhere, and the header bar's event.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") close();
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
    };
  }, [close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced: every keystroke hitting the database would search "j", "jo", "joe" to
  // throw the first two away.
  useEffect(() => {
    // Nothing is cleared here: a query too short to search simply shows no results,
    // which is derived below rather than written back into state from an effect.
    if (query.trim().length < SEARCH_MIN_CHARS) return;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await searchAction(query);
        setHits(result.hits);
        setActive(0);
      });
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  const go = (hit: SearchHit) => {
    close();
    router.push(hit.href);
  };

  if (!open) return null;

  const tooShort = query.trim().length < SEARCH_MIN_CHARS;
  const found = tooShort ? [] : hits;
  const creators = found.filter((h) => h.kind === "partner");
  const deals = found.filter((h) => h.kind === "deal");
  const ordered = [...creators, ...deals];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/25 px-4 pt-[12vh]"
      onClick={close}
      role="presentation"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-4">
          <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 18 }}>
            search
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((i) => Math.min(i + 1, ordered.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (event.key === "Enter" && ordered[active]) {
                event.preventDefault();
                go(ordered[active]);
              }
            }}
            placeholder="Search creators and deals…"
            aria-label="Search creators and deals"
            className="w-full bg-transparent py-3.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <kbd className="hidden rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 sm:block">
            esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {tooShort ? (
            <p className="px-4 py-6 text-center text-xs text-slate-400">
              Type at least {SEARCH_MIN_CHARS} characters — creator names, handles, emails,
              categories, campaigns and deliverables.
            </p>
          ) : ordered.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-400">
              {isPending ? "Searching…" : `Nothing matches "${query.trim()}".`}
            </p>
          ) : (
            <>
              {[
                { label: "Creators", rows: creators, offset: 0 },
                { label: "Deals", rows: deals, offset: creators.length },
              ]
                .filter((group) => group.rows.length > 0)
                .map((group) => (
                  <div key={group.label} className="py-1.5">
                    <p className="label-caps px-4 py-1 text-slate-400">{group.label}</p>
                    {group.rows.map((hit, index) => {
                      const position = group.offset + index;
                      return (
                        <button
                          key={`${hit.kind}-${hit.id}`}
                          onMouseEnter={() => setActive(position)}
                          onClick={() => go(hit)}
                          className={`flex w-full items-baseline gap-2 px-4 py-2 text-left ${
                            position === active ? "bg-brand/5" : "hover:bg-slate-50"
                          }`}
                        >
                          <span className="shrink-0 text-sm font-medium text-slate-900">
                            {hit.title}
                          </span>
                          <span className="truncate text-xs text-slate-500">{hit.detail}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** The bar in the page header. Looks like a field, opens the palette above. */
export function SearchBar() {
  return (
    <button
      onClick={openGlobalSearch}
      className="flex w-full max-w-xs items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-sm text-slate-400 transition-colors hover:border-slate-300 hover:bg-white"
    >
      <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
        search
      </span>
      <span className="flex-1 truncate">Search…</span>
      <kbd className="hidden rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 md:block">
        ⌘K
      </kbd>
    </button>
  );
}
