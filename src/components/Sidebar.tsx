"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { euro } from "@/lib/format";

const NAV = [
  { href: "/", label: "Dashboard", icon: "space_dashboard" },
  { href: "/pipeline", label: "Pipeline", icon: "account_tree" },
  { href: "/partners", label: "Partners", icon: "group" },
  { href: "/payments", label: "Payments", icon: "payments" },
  { href: "/playbook", label: "Playbook", icon: "menu_book" },
  { href: "/benchmarks", label: "Benchmarks", icon: "bar_chart" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export default function Sidebar({
  committed,
  cap,
  month,
}: {
  committed: number;
  cap: number;
  month: string;
}) {
  const pathname = usePathname();
  const pct = cap > 0 ? Math.min(100, Math.round((committed / cap) * 100)) : 0;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="bg-sidebar h-screen w-64 fixed left-0 top-0 border-r border-white/10 flex flex-col p-4 z-20">
      {/* Brand */}
      <div className="flex items-center gap-3 mb-8 px-2">
        <div className="w-8 h-8 rounded bg-brand flex items-center justify-center">
          <span className="material-symbols-outlined text-white" style={{ fontSize: 18 }}>
            handshake
          </span>
        </div>
        <div>
          <h1 className="font-headline text-xl font-bold text-white">Counterpart</h1>
          <p className="text-xs text-slate-400">Negotiation Copilot</p>
        </div>
      </div>

      {/* CTA */}
      <Link
        href="/new"
        className="bg-brand hover:bg-brand-dark text-white rounded-lg py-2.5 px-4 font-medium mb-6 transition-colors shadow-sm active:scale-95 flex items-center justify-center gap-2"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
        New Deal
      </Link>

      {/* Navigation */}
      <nav className="flex-1 space-y-1">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] font-medium transition-colors cursor-pointer active:scale-95 ${
              isActive(item.href)
                ? "text-white bg-white/10"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span
              className="material-symbols-outlined"
              style={isActive(item.href) ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              {item.icon}
            </span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Budget module */}
      <div className="mt-auto pt-4 border-t border-white/10">
        <div className="flex items-center justify-between mb-2 px-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 14 }}>
              monetization_on
            </span>
            <span className="text-xs font-medium text-slate-300">Budget Progress</span>
          </div>
          <span className="text-xs font-medium text-slate-400">{month}</span>
        </div>
        <div className="px-2">
          <div className="flex justify-between text-xs mb-1 font-tabular">
            <span className="text-white">{euro(committed)}</span>
            <span className="text-slate-400">{euro(cap)}</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5">
            <div className="bg-brand h-1.5 rounded-full" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </aside>
  );
}
