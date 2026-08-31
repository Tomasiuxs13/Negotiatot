"use server";

import { searchRecords, type SearchHit } from "@/lib/db";

/** The global search's only door. Capped: a palette shows a shortlist, not a report. */
export async function searchAction(query: string): Promise<{ hits: SearchHit[] }> {
  return { hits: searchRecords(query, 5) };
}
