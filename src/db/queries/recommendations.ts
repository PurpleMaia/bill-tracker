import { sql } from 'kysely';
import { db } from '@/db/kysely/client';
import { getUserPreferences } from '@/db/queries/user-preferences';
import { getLatestStatusUpdates } from '@/db/queries/bills-read';
import { toBillSearchResult } from '@/db/queries/bill-mappers';
import { buildInterestTerms, wordMatchPattern } from '@/lib/bills/recommendation-topics';
import { SESSION_YEARS } from '@/lib/bills/session-years';
import { rankRecommendations } from '@/lib/bills/recommendation-ranking';
import type { RecommendedBill } from '@/types/legislation';

export interface RecommendationsResponse {
  hasInterests: boolean;
  items: RecommendedBill[];
}

/** Safety cap on candidates pulled before ranking. */
const CANDIDATE_CAP = 500;

/**
 * Bills in the current session matching the user's interests, excluding any
 * bill the user tracks in ANY tenant. A term matches by phrase FTS or by the
 * whole term as a word-anchored regex on title/description (never per-token).
 */
export async function getRecommendedBills(
  userId: string,
  now: Date = new Date(),
): Promise<RecommendationsResponse> {
  const prefs = await getUserPreferences(userId);
  const terms = buildInterestTerms(prefs.interest_topics, prefs.interest_keywords);
  if (terms.length === 0) return { hasInterests: false, items: [] };

  const matchExprs = terms.map(
    (t) =>
      sql<boolean>`(search_vector @@ phraseto_tsquery('english', ${t.term}) OR bill_title ~* ${wordMatchPattern(t.term)} OR description ~* ${wordMatchPattern(t.term)})`,
  );

  let query = db
    .selectFrom('bills')
    .select([
      'id',
      'bill_number',
      'bill_title',
      'description',
      'year',
      'bill_status',
      'dead',
      'bill_url',
      'updated_at',
      'nickname',
      'committee_assignment',
    ])
    .where('year', 'in', SESSION_YEARS)
    .where(
      sql<boolean>`not exists (select 1 from user_bills ub where ub.bill_id = bills.id and ub.user_id = ${userId})`,
    )
    .where(sql<boolean>`(${sql.join(matchExprs, sql` OR `)})`);

  matchExprs.forEach((expr, i) => {
    query = query.select(expr.as(`m${i}`)) as typeof query;
  });

  const rows: any[] = await query
    .orderBy('dead', 'asc')
    .orderBy(sql`updated_at desc nulls last`)
    .limit(CANDIDATE_CAP)
    .execute();

  const updates = await getLatestStatusUpdates(rows.map((r) => r.id));

  const candidates = rows.map((r) => {
    const matched: string[] = [];
    terms.forEach((t, i) => {
      if (r[`m${i}`] && !matched.includes(t.label)) matched.push(t.label);
    });
    return { ...toBillSearchResult(r, updates.get(r.id), false), matched };
  });

  return { hasInterests: true, items: rankRecommendations(candidates, now) };
}
