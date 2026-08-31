"use client";

import { useState } from "react";
import { PAGE_WIDTH } from "@/lib/layout";

/**
 * The deal page's frame: a sticky app bar carrying the breadcrumb, the tab strip and the
 * deal's actions, then the always-visible cockpit and metric band, then the tab body
 * beside a persistent rail.
 *
 * The tabs live in the app bar rather than above the body because everything above them
 * — who this is, the numbers, the fundamentals — is true on every tab. Putting the strip
 * at the top makes that explicit: the bar is the deal, the panel below is the view you
 * have chosen of it. It also keeps switching views a fixed target instead of one that
 * moves as the cockpit's height changes between deals.
 *
 * State lives here because the strip and the body are now in different regions of the
 * page; the server passes each tab's already-rendered content in as a node.
 */
export default function DealWorkspace({
  breadcrumb,
  actions,
  workflow,
  cockpit,
  band,
  about,
  rail,
  tabs,
  defaultTab,
}: {
  breadcrumb: React.ReactNode;
  actions: React.ReactNode;
  workflow: React.ReactNode;
  cockpit: React.ReactNode;
  band?: React.ReactNode;
  /**
   * The properties column. Supplied only by the workspace layout — its presence is what
   * turns the body into three columns, so the classic layout needs no flag of its own.
   */
  about?: React.ReactNode;
  rail: React.ReactNode;
  tabs: { name: string; node: React.ReactNode }[];
  defaultTab?: string;
}) {
  const [tab, setTab] = useState<string>(
    defaultTab && tabs.some((t) => t.name === defaultTab) ? defaultTab : (tabs[0]?.name ?? "")
  );

  return (
    <>
      <header className="bg-white border-b border-slate-200 px-4 md:px-6 sticky top-0 z-30 shadow-sm">
        <div className="flex items-center justify-between gap-4 h-16">
          {/* The breadcrumb is the only thing here that may shrink. It used to be the one
              thing that could not, which is why "History" ended up clipped behind the
              actions on a 900px window. */}
          <div className="flex min-w-0 items-center gap-4 lg:gap-6">
            <div className="min-w-0 truncate">{breadcrumb}</div>
            <nav
              className="hidden shrink-0 items-center gap-1 rounded-lg bg-slate-100 p-1 md:flex"
              role="tablist"
            >
              {tabs.map((t) => (
                <button
                  key={t.name}
                  role="tab"
                  aria-selected={tab === t.name}
                  onClick={() => setTab(t.name)}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    tab === t.name
                      ? "bg-white font-semibold text-brand-dark shadow-sm ring-1 ring-slate-200"
                      : "font-medium text-slate-500 hover:bg-white/70 hover:text-slate-900"
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-3 overflow-x-auto">{actions}</div>
        </div>

        {/* Below md the strip drops out of the bar rather than squeezing the actions
            off-screen; it reappears here so the tabs are never unreachable. */}
        <nav
          className="-mt-1 mb-2 flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 md:hidden"
          role="tablist"
        >
          {tabs.map((t) => (
            <button
              key={t.name}
              role="tab"
              aria-selected={tab === t.name}
              onClick={() => setTab(t.name)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${
                tab === t.name
                  ? "bg-white font-semibold text-brand-dark shadow-sm ring-1 ring-slate-200"
                  : "font-medium text-slate-500"
              }`}
            >
              {t.name}
            </button>
          ))}
        </nav>
      </header>

      <div className={`p-4 md:p-6 flex flex-col gap-6 ${PAGE_WIDTH}`}>
        {workflow}
        {cockpit}
        {about ? (
          /* Below xl the work comes first: on a phone, scrolling past a screen of
             properties to reach the thread is worse than losing the side-by-side. */
          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,23%)_minmax(0,48%)_minmax(0,29%)]">
            <aside className="order-2 flex min-w-0 flex-col gap-4 xl:order-1">{about}</aside>
            <div className="order-1 flex min-w-0 flex-col gap-5 xl:order-2">
              {band}
              {tabs.find((t) => t.name === tab)?.node}
            </div>
            <aside className="order-3 flex min-w-0 flex-col gap-4">{rail}</aside>
          </div>
        ) : (
          <>
            {band}
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,68%)_minmax(0,32%)] gap-6 items-start">
              <div className="min-w-0">{tabs.find((t) => t.name === tab)?.node}</div>
              <aside className="flex flex-col gap-6">{rail}</aside>
            </div>
          </>
        )}
      </div>
    </>
  );
}
