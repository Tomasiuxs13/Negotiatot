import Link from "next/link";
import { SearchBar } from "./GlobalSearch";

export default function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 md:px-8">
      <div className="min-w-0">
        <h2 className="font-headline text-xl font-semibold tracking-tight text-slate-900">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 truncate text-xs text-slate-500 md:text-sm">{subtitle}</p>}
      </div>
      <div className="flex min-w-0 shrink-0 items-center gap-3">
        <div className="hidden w-56 lg:block xl:w-72">
          <SearchBar />
        </div>
        {actions && <div className="flex min-w-0 items-center gap-2 overflow-x-auto">{actions}</div>}
      </div>
    </header>
  );
}

export function HeaderButton({
  icon,
  children,
}: {
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <button className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{icon}</span>
      {children}
    </button>
  );
}

export function NewDealButton() {
  return (
    <Link
      href="/new"
      className="bg-brand hover:bg-brand-dark text-white rounded-md py-1.5 px-4 text-sm font-medium transition-colors shadow-sm flex items-center gap-1"
    >
      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
      New Deal
    </Link>
  );
}
