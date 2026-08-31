"use client";

import { useTransition } from "react";
import { logoutAction } from "@/app/login/actions";

/** The other half of having a session: being able to end it. */
export default function SignOutButton() {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      onClick={() => startTransition(async () => void (await logoutAction()))}
      disabled={isPending}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
    >
      <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>
        logout
      </span>
      {isPending ? "Signing out…" : "Sign out"}
    </button>
  );
}
