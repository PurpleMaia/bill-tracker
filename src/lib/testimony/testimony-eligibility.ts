// ==============================================
// TESTIMONY ELIGIBILITY — pure rules for when the
// "Write Testimony" action is open or closed
// ==============================================
// Testimony is closed when the bill is enacted into law, dead, or the
// session's final hearing deadline (final decking) has passed — fiscal
// bills (FIN/WAM) get the later fiscal decking date.

import type { BillStatus } from '@/db/types';
import type { SessionDeadlines } from '@/lib/bills/dead-bill';
import { isFiscalBill, isEnacted } from '@/lib/bills/dead-bill';
import { isConferenceOrLater } from '@/lib/bills/progress-stages';

// A committee that has voted issues a recommendation — "recommend(s) that the
// measure be PASSED / DEFERRED" — which means its hearing has concluded and the
// public testimony window for it is closed, whether or not the notice also carries
// a hearing date. The bill then advances to a waiting/deferred status.
const COMMITTEE_RECOMMENDATION_PATTERN = /recommend(?:\(s\)|s)?\s+that\s+the\s+measure\s+be\s+(?:passed|deferred)/i;

/**
 * True when the status text records a committee recommendation (PASSED/DEFERRED),
 * i.e. that committee's hearing has already been held.
 */
export function hasCommitteeRecommendation(statusText: string): boolean {
  return COMMITTEE_RECOMMENDATION_PATTERN.test(statusText);
}

export const SCHEDULED_STATUSES: BillStatus[] = [
  'scheduled1',
  'scheduled2',
  'scheduled3',
  'crossoverScheduled1',
  'crossoverScheduled2',
  'crossoverScheduled3',
  'conferenceScheduled',
];

/**
 * True when a hearing is scheduled for the bill — testimony should be
 * submitted at least 24 hours before the hearing, so the window is closing.
 */
export function isTestimonyUrgent(billStatus: BillStatus): boolean {
  return SCHEDULED_STATUSES.includes(billStatus);
}

export interface TestimonyEligibility {
  allowed: boolean;
  /** Human-readable reason testimony is closed; null when allowed. */
  reason: string | null;
}

export function getTestimonyEligibility(params: {
  dead: boolean;
  billStatus: BillStatus;
  committeeAssignment: string | null;
  deadlines: SessionDeadlines;
  /** Today's date as YYYY-MM-DD (lexicographically comparable). */
  today: string;
  /**
   * True when the bill's scheduled hearing has already been held (its 24-hour
   * submission window closed). Derived from the hearing datetime in the latest
   * status update — see getTestimonyDeadline().hearingPassed. When set, testimony
   * is closed for that hearing even though the session deadline is still ahead,
   * keeping the card's "Testimony closed" chip and the dialog's Write action in sync.
   */
  hearingPassed?: boolean;
  /**
   * The latest status-update text. When it records a committee recommendation
   * (PASSED/DEFERRED) the hearing is over and testimony closes — even if the text
   * carries no parseable hearing date for hearingPassed to key off.
   */
  latestStatusText?: string | null;
}): TestimonyEligibility {
  if (isEnacted(params.billStatus)) {
    return { allowed: false, reason: 'This bill has been enacted into law' };
  }

  if (params.dead) {
    return { allowed: false, reason: 'This bill failed' };
  }

  // Once a bill reaches conference (or Governor/Law after it), public testimony
  // is no longer taken — the process has moved to conferee negotiation.
  if (isConferenceOrLater(params.billStatus)) {
    return { allowed: false, reason: 'This bill has moved past public testimony (in conference or later)' };
  }

  if (params.hearingPassed) {
    return { allowed: false, reason: 'The hearing has already been held' };
  }

  // A committee recommendation (PASSED/DEFERRED) in the latest text means that
  // committee's hearing has concluded — close testimony even when no hearing date
  // is present for hearingPassed to fire.
  if (params.latestStatusText && hasCommitteeRecommendation(params.latestStatusText)) {
    return { allowed: false, reason: 'The hearing has already been held' };
  }

  const fiscal = params.committeeAssignment ? isFiscalBill(params.committeeAssignment) : false;
  const finalHearingDeadline = fiscal
    ? params.deadlines.deadlines.final_decking_fiscal
    : params.deadlines.deadlines.final_decking_non_fiscal;
  if (params.today > finalHearingDeadline) {
    return { allowed: false, reason: 'The final hearing deadline has passed' };
  }

  return { allowed: true, reason: null };
}
