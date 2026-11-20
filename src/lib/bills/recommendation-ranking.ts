import type { BillSearchResult, RecommendedBill } from '@/types/legislation';
import { parseHearingDatetime } from '@/lib/testimony/hearing-schedule';

export const RECOMMENDATION_LIMIT = 10;

function activityTime(b: BillSearchResult): number {
  for (const raw of [b.latest_update?.date, b.updated_at]) {
    if (!raw) continue;
    const t = new Date(raw).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return -Infinity;
}

/**
 * Orders matched bills by timing only (never term frequency): alive first,
 * then upcoming hearing (soonest first), then most recent activity, then
 * number of matched interests, then bill number for determinism.
 */
export function rankRecommendations(
  candidates: Array<BillSearchResult & { matched: string[] }>,
  now: Date,
  limit: number = RECOMMENDATION_LIMIT,
): RecommendedBill[] {
  const nowMs = now.getTime();
  const keyed = candidates.map((c) => {
    const hearing = c.latest_update ? parseHearingDatetime(c.latest_update.statustext) : null;
    const hearingMs = hearing && hearing.getTime() > nowMs ? hearing.getTime() : null;
    const bill: RecommendedBill = {
      ...c,
      matched: c.matched,
      next_hearing_at: hearingMs === null ? null : new Date(hearingMs).toISOString(),
    };
    return { bill, hearingMs, activity: activityTime(c) };
  });

  keyed.sort((a, b) => {
    if (a.bill.dead !== b.bill.dead) return a.bill.dead ? 1 : -1;
    if ((a.hearingMs === null) !== (b.hearingMs === null)) return a.hearingMs === null ? 1 : -1;
    if (a.hearingMs !== null && b.hearingMs !== null && a.hearingMs !== b.hearingMs) {
      return a.hearingMs - b.hearingMs;
    }
    if (a.activity !== b.activity) return a.activity < b.activity ? 1 : -1;
    if (a.bill.matched.length !== b.bill.matched.length) {
      return b.bill.matched.length - a.bill.matched.length;
    }
    return a.bill.bill_number < b.bill.bill_number ? -1 : a.bill.bill_number > b.bill.bill_number ? 1 : 0;
  });

  return keyed.slice(0, limit).map((k) => k.bill);
}
