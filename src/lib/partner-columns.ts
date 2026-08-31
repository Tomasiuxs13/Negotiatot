/**
 * The Partners table's properties: what can be shown, sorted and filtered on.
 *
 * One catalogue rather than a hard-coded row of <th>s, because "show me category" and
 * "only creators added this month" are the same question asked of different properties,
 * and every one of them was previously unavailable unless someone edited the table.
 */
export type PartnerColumnKey =
  | "name"
  | "category"
  | "status"
  | "setup"
  | "channels"
  | "email"
  | "added"
  | "deals"
  | "committed"
  | "paid"
  | "cpm"
  | "saved"
  | "tags";

export interface PartnerColumn {
  key: PartnerColumnKey;
  label: string;
  align?: "right";
  sortable?: boolean;
  /** Shown until the manager says otherwise. */
  standard?: boolean;
}

export const PARTNER_COLUMNS: PartnerColumn[] = [
  { key: "name", label: "Partner", sortable: true, standard: true },
  { key: "category", label: "Category", sortable: true, standard: true },
  { key: "status", label: "Status", standard: true },
  { key: "setup", label: "Setup", standard: true },
  { key: "channels", label: "Channels", standard: true },
  { key: "email", label: "Email" },
  { key: "added", label: "Added", sortable: true },
  { key: "tags", label: "Tags" },
  { key: "deals", label: "Deals", align: "right", sortable: true, standard: true },
  { key: "committed", label: "Committed", align: "right", sortable: true, standard: true },
  { key: "paid", label: "Paid", align: "right", sortable: true, standard: true },
  { key: "cpm", label: "Actual CPM", align: "right", sortable: true, standard: true },
  { key: "saved", label: "Saved", align: "right", sortable: true, standard: true },
];

const KEYS = PARTNER_COLUMNS.map((column) => column.key);

export const DEFAULT_PARTNER_COLUMNS: PartnerColumnKey[] = PARTNER_COLUMNS.filter(
  (column) => column.standard
).map((column) => column.key);

/**
 * Reads a stored or submitted selection. The name column is not optional: a table of
 * creators you cannot identify is not a view, and losing it to a bad setting would be
 * unrecoverable from the UI itself.
 */
export function parseColumns(value: unknown): PartnerColumnKey[] {
  if (!Array.isArray(value)) return DEFAULT_PARTNER_COLUMNS;
  const chosen = value.filter((key): key is PartnerColumnKey => KEYS.includes(key as PartnerColumnKey));
  const unique = [...new Set(chosen)];
  if (unique.length === 0) return DEFAULT_PARTNER_COLUMNS;
  // Catalogue order, so columns cannot end up in a different order than the picker shows.
  return KEYS.filter((key) => key === "name" || unique.includes(key));
}

export const ADDED_RANGES = [
  { value: "", label: "Any time" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
] as const;

export type AddedRange = (typeof ADDED_RANGES)[number]["value"];

export function parseAddedRange(value: unknown): AddedRange {
  return ADDED_RANGES.some((range) => range.value === value) ? (value as AddedRange) : "";
}

/**
 * Whether a record was added inside the window. Whole days, counted back from today, so
 * "last 7 days" does not depend on the hour the import happened to run.
 */
export function addedWithin(createdAt: string | null | undefined, range: AddedRange, today?: string): boolean {
  if (!range) return true;
  if (!createdAt) return false;
  const days = Number(range.replace("d", ""));
  const from = new Date((today ?? new Date().toISOString()).slice(0, 10) + "T00:00:00Z").getTime();
  const stamp = new Date(createdAt.slice(0, 10) + "T00:00:00Z").getTime();
  if (!Number.isFinite(stamp)) return false;
  return from - stamp <= (days - 1) * 86_400_000 && stamp <= from;
}
