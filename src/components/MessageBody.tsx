import { splitQuotedReply } from "@/lib/message-quote";

/** Roughly a screen of text at this width; past it the thread stops being scannable. */
const LONG_MESSAGE_CHARS = 700;

/**
 * A message as a reader wants it: what this person wrote, with the thread they quoted
 * folded away underneath.
 *
 * Both toggles are native <details> — no client component, and they work before hydration.
 */
export default function MessageBody({
  body,
  className = "text-slate-800",
}: {
  body: string;
  /** Type styling for the message itself, so each surface keeps its own voice. */
  className?: string;
}) {
  const { latest, quoted, quotedLines } = splitQuotedReply(body);
  const long = latest.length > LONG_MESSAGE_CHARS;

  return (
    <div>
      {long ? (
        <details className="group">
          <summary className="cursor-pointer list-none">
            <p className={`whitespace-pre-line line-clamp-6 group-open:line-clamp-none ${className}`}>
              {latest}
            </p>
            <span className="mt-1 inline-block text-xs font-semibold text-brand-dark hover:underline">
              <span className="group-open:hidden">Show full message</span>
              <span className="hidden group-open:inline">Show less</span>
            </span>
          </summary>
        </details>
      ) : (
        <p className={`whitespace-pre-line ${className}`}>{latest}</p>
      )}

      {quoted && (
        <details className="group mt-2">
          <summary
            className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500 hover:border-slate-300 hover:text-slate-700"
            title="The earlier thread, quoted by the mail client"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>
              more_horiz
            </span>
            <span className="group-open:hidden">
              {quotedLines} quoted line{quotedLines === 1 ? "" : "s"}
            </span>
            <span className="hidden group-open:inline">Hide quoted history</span>
          </summary>
          <p className="mt-2 whitespace-pre-line border-l-2 border-slate-200 pl-3 text-xs leading-6 text-slate-500">
            {quoted}
          </p>
        </details>
      )}
    </div>
  );
}
