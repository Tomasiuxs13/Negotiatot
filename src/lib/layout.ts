/**
 * The width every CRM page's content is capped at.
 *
 * Pages were individually capped at max-w-5xl (1024px) — with the 256px sidebar that
 * left more than half of a normal desktop window empty while the content inside was
 * squeezed: analysis prose ran at a ~30-character measure, metric card labels truncated
 * mid-word, and the pipeline board clipped its last column. The cap exists only to stop
 * tables and prose stretching absurdly on ultrawide monitors; it should never be the
 * reason a 1440px screen looks half-used.
 *
 * Public creator-facing pages (/ship, /portal) keep their own narrow measure — they are
 * single-purpose forms, not dashboards.
 */
export const PAGE_WIDTH = "max-w-[1600px]";
