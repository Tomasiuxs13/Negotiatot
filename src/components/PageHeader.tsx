import Link from "next/link";

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
    <header className="bg-white h-16 sticky top-0 z-10 border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
      <div className="flex items-baseline gap-4">
        <h2 className="font-headline text-lg font-semibold text-slate-900 border-b-2 border-brand pb-4 mt-4">
          {title}
        </h2>
        {subtitle && <span className="text-sm text-slate-500 font-medium">{subtitle}</span>}
      </div>
      <div className="flex items-center gap-3">{actions}</div>
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
