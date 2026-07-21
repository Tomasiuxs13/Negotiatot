"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refreshes the page every few seconds while a background job is running. */
export default function JobPoller({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}

export function JobChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold bg-brand/10 text-brand-dark rounded-full px-3 py-1">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-60" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-brand" />
      </span>
      {label}
    </span>
  );
}
