import Link from "next/link";

export interface FilterOption {
  value: string;
  label: string;
  /** Shown next to the label — a filter is far more useful when it says how many. */
  count?: number;
}

/**
 * A row of filter pills backed by the URL, so a filtered view can be bookmarked,
 * shared, and survives a refresh.
 */
export default function FilterPills({
  options,
  active,
  href,
}: {
  options: FilterOption[];
  active: string;
  href: (value: string) => string;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((o) => {
        const isActive = o.value === active;
        return (
          <Link
            key={o.value || "all"}
            href={href(o.value)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${
              isActive
                ? "bg-slate-900 text-white border-slate-900"
                : "border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
          >
            {o.label}
            {o.count != null && (
              <span className={`ml-1.5 font-tabular ${isActive ? "text-white/60" : "text-slate-400"}`}>
                {o.count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

/** A column header that sorts, showing direction only on the column in use. */
export function SortHeader({
  label,
  href,
  active,
  dir,
  align = "left",
}: {
  label: string;
  href: string;
  active: boolean;
  dir: "asc" | "desc";
  align?: "left" | "right";
}) {
  return (
    <th scope="col" className={`px-4 py-3 font-medium ${align === "right" ? "text-right" : "text-left"}`}>
      <Link
        href={href}
        className={`inline-flex items-center gap-0.5 hover:text-slate-800 transition-colors ${
          active ? "text-slate-900" : ""
        }`}
      >
        {label}
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 14, opacity: active ? 1 : 0.25 }}
        >
          {active && dir === "asc" ? "arrow_upward" : "arrow_downward"}
        </span>
      </Link>
    </th>
  );
}
