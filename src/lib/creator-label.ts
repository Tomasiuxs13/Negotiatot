/**
 * How a creator is identified on screen and in search.
 *
 * A deal stores one name, and an import fills it with whatever the source called the
 * person. Instagram exports often give a display name — "Mo", "Andrew" — while the thing
 * the manager recognises, `@_morgan.miles_`, goes to the channel record and is never seen
 * again. Two consequences, both reported: cards that read "Mo" among 168 handles, and a
 * board search that returns nothing when you type the handle.
 */
export interface CreatorChannel {
  platform: string;
  handle: string | null;
}

/** Comparable form: case, @, dots and underscores are not identity. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The handle to show for a deal: the one on the deal's own platform when there is one,
 * otherwise the first this creator has. A multi-platform creator should not be labelled
 * with their TikTok handle on a YouTube deal.
 */
export function handleForDeal(
  platform: string | null | undefined,
  channels: CreatorChannel[]
): string | null {
  const usable = channels.filter((c) => c.handle && c.handle.trim());
  if (usable.length === 0) return null;
  const match = platform ? usable.find((c) => c.platform === platform) : undefined;
  return (match ?? usable[0]).handle!.trim();
}

/**
 * Whether showing the handle next to the name tells you anything. "6thGenFarmer" beside
 * @6thGenFarmer is noise; "Mo" beside @_morgan.miles_ is the whole point.
 */
export function handleAddsIdentity(name: string, handle: string | null): boolean {
  if (!handle) return false;
  const a = normalize(name);
  const b = normalize(handle);
  if (!b) return false;
  // Deliberately plain equality. A containment rule reads better until you try it on the
  // reported row: "Mo" is a substring of "morganmiles", so the one card that most needed
  // its handle was the one that hid it. Showing "@joeholland" beside "Joe Holland
  // Fishing" is mild redundancy; hiding it behind "Mo" is the bug.
  return a !== b;
}

/** Everything a deal can be found by, for the board's filter. */
export function creatorSearchFields(
  deal: { creator: string; deliverables?: string | null; campaign?: string | null },
  handle: string | null,
  email: string | null
): (string | null | undefined)[] {
  return [deal.creator, deal.deliverables, deal.campaign, handle, email];
}
