import { sql } from 'kysely';
import { db } from '@/db/kysely/client';
import { getUserPreferences } from '@/db/queries/user-preferences';
import { getLatestStatusUpdates } from '@/db/queries/bills-read';
import { toBillSearchResult } from '@/db/queries/bill-mappers';
import {
  buildInterestTerms,
  groupInterestTerms,
  wordMatchPattern,
} from '@/lib/bills/recommendation-topics';
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
 * SQL prefilter for status updates that carry a hearing date/time, mirroring
 * HEARING_DATETIME_PATTERN in lib/testimony/hearing-schedule.ts (e.g. "... on
 * Friday, 01-31-25 9:15AM ..."). The ranking parses the text itself.
 */
// Also matches deletion/cancellation notices, which repeat the old date; the
// ranking treats those as "no hearing", so the latest notice wins either way.
const HEARING_NOTICE_PATTERN =
  '[0-9]{1,2}-[0-9]{1,2}-[0-9]{2,4}[,[:space:]]+(at[[:space:]]+)?[0-9]{1,2}:[0-9]{2}[[:space:]]*[AP]';

/**
 * Each bill's most recent hearing notice. Looked up separately from the latest
 * status update, because a newer update ("Referred to WAM") would otherwise
 * hide a hearing that is still coming up.
 */
async function getLatestHearingNotices(billIds: string[]): Promise<Map<string, string>> {
  if (billIds.length === 0) return new Map();
  const rows = await db
    .selectFrom('status_updates')
    .select(['bill_id', 'statustext'])
    .where('bill_id', 'in', billIds)
    .where(sql<boolean>`statustext ~* ${HEARING_NOTICE_PATTERN}`)
    .distinctOn('bill_id')
    .orderBy('bill_id')
    // `date` is text (M/D/YYYY): cast so 10/1 sorts after 9/30.
    .orderBy(sql`cast(date as date)`, 'desc')
    .execute();
  return new Map(rows.map((r) => [r.bill_id, r.statustext]));
}

/**
 * Bills in the current session matching the user's interests. Excludes bills the
 * user already tracks in the active org (`tenantId`), or anywhere when there is
 * no org: the same rule Find Bills uses for is_tracked, so the two never
 * disagree. A term matches by phrase FTS or as a word-anchored regex on
 * title/description (never per-token).
 */
export async function getRecommendedBills(
  userId: string,
  { tenantId = null, now = new Date() }: { tenantId?: string | null; now?: Date } = {},
): Promise<RecommendationsResponse> {
  const prefs = await getUserPreferences(userId);
  const groups = groupInterestTerms(buildInterestTerms(prefs.interest_topics, prefs.interest_keywords));
  if (groups.length === 0) return { hasInterests: false, items: [] };

  const trackedExpr = tenantId
    ? sql<boolean>`exists (select 1 from user_bills ub where ub.bill_id = bills.id and ub.user_id = ${userId} and ub.tenant_id = ${tenantId})`
    : sql<boolean>`exists (select 1 from user_bills ub where ub.bill_id = bills.id and ub.user_id = ${userId})`;

  // One match flag per distinct term, computed once in the inner query. OFFSET 0
  // keeps Postgres from inlining it, which would re-evaluate every expression in
  // the outer WHERE.
  let inner = db
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
    .where(sql<boolean>`not ${trackedExpr}`);
  groups.forEach(({ term }, i) => {
    const pattern = wordMatchPattern(term);
    inner = inner.select(
      sql<boolean>`(search_vector @@ phraseto_tsquery('english', ${term}) OR bill_title ~* ${pattern} OR description ~* ${pattern})`.as(`m${i}`),
    ) as typeof inner;
  });

  const anyMatch = sql.join(
    groups.map((_, i) => sql.ref(`c.m${i}`)),
    sql` OR `,
  );
  const rows: any[] = await db
    .selectFrom(inner.offset(0).as('c'))
    .selectAll()
    .where(sql<boolean>`(${anyMatch})`)
    .orderBy(sql`c.dead asc, c.updated_at desc nulls last`)
    .limit(CANDIDATE_CAP)
    .execute();

  const ids = rows.map((r) => r.id);
  const [updates, notices] = await Promise.all([
    getLatestStatusUpdates(ids),
    getLatestHearingNotices(ids),
  ]);

  const candidates = rows.map((r) => {
    const matched: string[] = [];
    groups.forEach(({ labels }, i) => {
      if (!r[`m${i}`]) return;
      for (const label of labels) if (!matched.includes(label)) matched.push(label);
    });
    return {
      ...toBillSearchResult(r, updates.get(r.id), false),
      matched,
      hearing_notice: notices.get(r.id) ?? null,
    };
  });

  return { hasInterests: true, items: rankRecommendations(candidates, now) };
}
