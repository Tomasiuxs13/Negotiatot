"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { money } from "@/lib/format";

/** The labels explain the product's mental model before the user has to learn it. */
const NAV_GROUPS = [
  {
    label: "Overview",
    items: [{ href: "/", label: "Dashboard", icon: "space_dashboard" }],
  },
  {
    label: "Deals",
    items: [
      { href: "/pipeline", label: "Pipeline", icon: "account_tree" },
      { href: "/inbox", label: "Inbox", icon: "inbox" },
      { href: "/imports", label: "Creator intake", icon: "upload_file" },
      { href: "/approvals", label: "Approvals", icon: "approval" },
    ],
  },
  {
    label: "Delivery",
    items: [
      { href: "/content", label: "Content", icon: "movie" },
      { href: "/payments", label: "Payments", icon: "payments" },
    ],
  },
  {
    label: "Relationships",
    items: [{ href: "/partners", label: "Partners", icon: "group" }],
  },
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
      className={`flex items-center gap-3 mx-2 px-3 py-2 rounded-md text-[13px] font-medium transition-colors cursor-pointer ${
        active
          ? "bg-brand text-white"
          : "text-white/60 hover:bg-white/8 hover:text-white"
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
    <>
      <div className="md:hidden fixed inset-x-0 top-0 z-40 h-14 bg-sidebar border-b border-white/10 px-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-white font-headline font-bold">
          <span className="w-7 h-7 rounded bg-brand flex items-center justify-center">
            <span className="material-symbols-outlined text-white" style={{ fontSize: 16 }}>
              handshake
            </span>
          </span>
          Counterpart
        </Link>
        <details className="relative group">
          <summary className="list-none cursor-pointer rounded-md border border-white/15 px-3 py-1.5 text-xs font-semibold text-white flex items-center gap-1.5">
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>menu</span>
            Menu
          </summary>
          <nav className="absolute right-0 top-10 w-56 rounded-xl border border-slate-700 bg-sidebar p-2 shadow-2xl">
            <Link
              href="/new"
              className="mb-2 flex items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
              New Deal
            </Link>
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="mb-2">
                <p className="label-caps px-3 pb-1 pt-1 text-slate-500">{group.label}</p>
                {group.items.map((item) => (
                  <NavItem key={item.href} item={item} active={isActive(item.href)} />
                ))}
              </div>
            ))}
            <p className="label-caps px-3 pb-1 pt-2 text-slate-500">Configure</p>
            {SETUP_NAV.map((item) => (
              <NavItem key={item.href} item={item} active={isActive(item.href)} />
            ))}
            <div className="border-t border-white/10 px-3 pt-2 mt-2 text-[11px] text-slate-400 font-tabular">
              {money(committed)} of {money(cap)} · {month}
            </div>
          </nav>
        </details>
      </div>

    <aside className="hidden md:flex bg-sidebar h-screen w-[220px] fixed left-0 top-0 border-r border-white/10 flex-col z-20">
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

      <nav className="flex-1 overflow-y-auto pb-3 custom-scrollbar">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-3">
            <p className="label-caps px-5 pb-1 text-slate-500">{group.label}</p>
            {group.items.map((item) => (
              <NavItem key={item.href} item={item} active={isActive(item.href)} />
            ))}
          </div>
        ))}
        <div className="mt-4 pt-3 border-t border-white/10">
          <p className="label-caps px-5 pb-1 text-slate-500">Configure</p>
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
    </>
  );
}
