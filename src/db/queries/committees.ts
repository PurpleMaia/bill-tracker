import { db } from '@/db/kysely/client';

/** acronym (upper-cased) -> full committee name. */
export type CommitteeNameMap = Record<string, string>;

/**
 * The committees lookup: every committee's acronym mapped to its full name.
 *
 * This is the single source of truth for committee names — the app used to
 * carry a hardcoded copy in src/lib. Keyed by UPPER-CASED acronym so callers
 * (which upper-case referral codes) match regardless of the row's casing.
 * Small, static-per-session data; fetched once and cached client-side.
 */
export async function getCommitteeNames(): Promise<CommitteeNameMap> {
  const rows = await db
    .selectFrom('committees')
    .select(['acronym', 'name'])
    .execute();

  const map: CommitteeNameMap = {};
  for (const row of rows) {
    const key = row.acronym?.trim().toUpperCase();
    if (key) map[key] = row.name;
  }
  return map;
}
