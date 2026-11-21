import type { BillSearchResult, RecommendedBill } from '@/types/legislation';
import { parseHearingDatetime } from '@/lib/testimony/hearing-schedule';

/** Ranked pool sent to the client; the panel pages through it on Refresh. */
export const RECOMMENDATION_LIMIT = 30;

/** A notice that a measure was pulled from (or a meeting canceled for) its hearing. */
const CANCELED_HEARING = /\b(deleted|cancell?ed|withdrawn|postponed)\b/i;

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
  candidates: Array<BillSearchResult & { matched: string[]; hearing_notice?: string | null }>,
  now: Date,
  limit: number = RECOMMENDATION_LIMIT,
): RecommendedBill[] {
  const nowMs = now.getTime();
  const keyed = candidates.map((c) => {
    // The bill's latest hearing notice, when the caller found one; otherwise
    // the latest update, which may itself be the notice.
    const noticeText = c.hearing_notice ?? c.latest_update?.statustext ?? null;
    // A deletion/cancellation notice repeats the old date; it means no hearing.
    const hearing =
      noticeText && !CANCELED_HEARING.test(noticeText) ? parseHearingDatetime(noticeText) : null;
    const hearingMs = hearing && hearing.getTime() > nowMs ? hearing.getTime() : null;
    const { hearing_notice: _notice, ...rest } = c;
    const bill: RecommendedBill = {
      ...rest,
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
