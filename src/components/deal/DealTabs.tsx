"use client";

import { useState } from "react";

export default function DealTabs({
  defaultTab,
  analysis,
  negotiation,
  history,
  actuals,
}: {
  defaultTab?: string;
  analysis: React.ReactNode;
  negotiation: React.ReactNode;
  history: React.ReactNode;
  actuals?: React.ReactNode;
}) {
  const tabs: { name: string; node: React.ReactNode }[] = [
    { name: "Analysis", node: analysis },
    { name: "Negotiation", node: negotiation },
    ...(actuals ? [{ name: "Actuals", node: actuals }] : []),
    { name: "History", node: history },
  ];
  const [tab, setTab] = useState<string>(
    defaultTab && tabs.some((t) => t.name === defaultTab) ? defaultTab : "Analysis"
  );

  return (
    <>
      <div className="flex gap-1 border-b border-slate-200 mt-4 -mb-px" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.name}
            role="tab"
            aria-selected={tab === t.name}
            onClick={() => setTab(t.name)}
            className={`px-4 py-2.5 font-headline text-sm font-semibold border-b-2 transition-colors ${
              tab === t.name
                ? "text-slate-900 border-brand"
                : "text-slate-500 border-transparent hover:text-slate-800"
            }`}
          >
            {t.name}
          </button>
        ))}
      </div>
      <div className="mt-5">{tabs.find((t) => t.name === tab)?.node}</div>
    </>
  );
}
