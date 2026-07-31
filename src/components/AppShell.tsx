"use client";

import { usePathname } from "next/navigation";

/**
 * Splits the app into two surfaces: the CRM (sidebar plus content) and public pages.
 *
 * /ship/* is opened by CREATORS — a shared address form. Rendering the sidebar there
 * would hand every recipient the whole pipeline: deal names, budgets, the lot. A route
 * group would express this more natively, but it changes every page's file path and
 * this codebase imports server actions by path ("@/app/deals/[id]/actions") from many
 * components — so the shell decides at the one place both surfaces already meet.
 */
export default function AppShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const isPublic = usePathname().startsWith("/ship");

  if (isPublic) {
    return <div className="flex-1 h-screen overflow-y-auto bg-slate-50">{children}</div>;
  }
  return (
    <>
      {sidebar}
      <div className="ml-64 flex-1 flex flex-col h-screen overflow-hidden bg-slate-50">
        {children}
      </div>
    </>
  );
}
