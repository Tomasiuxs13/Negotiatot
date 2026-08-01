"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { money } from "@/lib/format";

/**
 * Two groups, because these are two kinds of thing wearing the same clothes.
 *
 * The first four are where the work happens — opened many times a day, in roughly the
 * order a deal moves through them. The last three change how the first four behave and
 * are visited occasionally: the Playbook sets the rules the engine negotiates by,
 * Benchmarks calibrates those rules against what actually closed, and Settings is the
 * system itself. Presented as one undifferentiated list, "Playbook" reads like another
 * place to work rather than the thing that governs the others.
 *
 * There is deliberately no "Deals" entry: Pipeline is the deals home — board plus a
 * filterable list view — and /deals already redirects into it.
 */
const WORK_NAV = [
  { href: "/", label: "Dashboard", icon: "space_dashboard" },
  { href: "/pipeline", label: "Pipeline", icon: "account_tree" },
  { href: "/partners", label: "Partners", icon: "group" },
  { href: "/payments", label: "Payments", icon: "payments" },
];

const SETUP_NAV = [
  { href: "/playbook", label: "Playbook", icon: "menu_book" },
  { href: "/benchmarks", label: "Benchmarks", icon: "bar_chart" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

function NavItem({
  item,
  active,
}: {
  item: { href: string; label: string; icon: string };
  active: boolean;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 px-4 py-3 text-[13px] font-medium transition-colors cursor-pointer border-l-4 ${
        active
          ? "text-brand bg-brand/10 border-brand"
          : "text-slate-400 border-transparent hover:bg-white/5 hover:text-white"
      }`}
    >
      <span
        className="material-symbols-outlined"
        style={active ? { fontSize: 20, fontVariationSettings: "'FILL' 1" } : { fontSize: 20 }}
      >
        {item.icon}
      </span>
      {item.label}
    </Link>
  );
}

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
    <aside className="bg-sidebar h-screen w-[220px] fixed left-0 top-0 border-r border-white/10 flex flex-col z-20">
      {/* Brand */}
      <div className="flex items-center gap-3 mb-6 p-6 pb-0">
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
        className="bg-brand hover:bg-brand-dark text-white rounded-lg py-2.5 px-4 font-medium mb-6 mx-4 transition-colors shadow-sm active:scale-95 flex items-center justify-center gap-2"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
        New Deal
      </Link>

      {/* Navigation. The setup group is pushed to the foot of the nav rather than
          sitting flush under the work group — the gap is what says "different kind of
          thing", without needing a heading that would have to call Benchmarks
          configuration when it is really calibration. */}
      <nav className="flex-1 flex flex-col">
        {WORK_NAV.map((item) => (
          <NavItem key={item.href} item={item} active={isActive(item.href)} />
        ))}
        <div className="mt-auto pt-3 border-t border-white/10">
          {SETUP_NAV.map((item) => (
            <NavItem key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </div>
      </nav>

      {/* Budget module */}
      <div className="mt-auto p-4 border-t border-white/10">
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
            <span className="text-white">{money(committed)}</span>
            <span className="text-slate-400">{money(cap)}</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5">
            <div className="bg-brand h-1.5 rounded-full" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </aside>
  );
}
