import LoginForm from "@/components/LoginForm";
import { authRequired, configuredPassword } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next = "" } = await searchParams;
  const configured = Boolean(configuredPassword());

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden>
              handshake
            </span>
          </span>
          <div>
            <p className="font-headline text-lg font-semibold text-slate-900">Counterpart</p>
            <p className="text-xs text-slate-500">Negotiation Copilot</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {configured ? (
            <LoginForm next={next} />
          ) : (
            <div>
              <p className="text-sm font-semibold text-slate-900">No password is set</p>
              <p className="mt-1 text-xs text-slate-500">
                Set <code className="text-slate-700">COUNTERPART_PASSWORD</code> in the
                instance&apos;s environment and restart it.
                {!authRequired() && " In development the app stays open without one."}
              </p>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          One password for this instance. A session lasts 30 days.
        </p>
      </div>
    </main>
  );
}
