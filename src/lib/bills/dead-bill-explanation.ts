import type { BillStatus } from '@/db/types';
import { isBillDead, parseCommittees } from '@/lib/bills/dead-bill';
import type { SessionDeadlines, StatusUpdate } from '@/lib/bills/dead-bill';

/** Shown under the explanation when the bill merely stalled (not a closed status). */
export const REVIVAL_NOTE =
  'Bills that fail in committee can sometimes be revived in subsequent sessions or attached to other bills as amendments. This is procedural and not always a final stop.';

export interface DeadBillExplanation {
  heading: 'Why did this bill fail?' | 'Where did this bill end up?';
  summary: string;
  /** Only for missed-deadline deaths (not committee actions / closed statuses). */
  missedDeadline: { name: string; date: string /* e.g. "February 27, 2025" */ } | null;
  committeeExplanation: string;
  showRevivalNote: boolean;
}

// Some rows are flagged dead while carrying an end-of-process status (a bill
// signed into law, transmitted to the Governor, or vetoed). Claiming those
// "failed in committee" would be wrong, so describe where they actually
// ended instead.
const CLOSED_STATUS_SUMMARY: Record<string, string> = {
  governorSigns: 'This bill completed the legislative process and was signed into law.',
  lawWithoutSignature: 'This bill became law without the Governor’s signature.',
  vetoList: 'This bill passed the legislature but was vetoed by the Governor.',
  transmittedGovernor: 'This bill passed the legislature and was transmitted to the Governor.',
  conferencePassed: 'This bill passed conference committee.',
};

function formatDeadlineDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date + 'T00:00:00Z'));
}

/** Pure wording for the "why did this bill fail?" explanation. */
export function explainDeadBill(
  bill: { billNumber: string; billStatus: string; committeeAssignment: string | null },
  statusUpdates: StatusUpdate[],
  deadlines: SessionDeadlines,
  today: string, // YYYY-MM-DD
): DeadBillExplanation {
  const { billNumber, billStatus, committeeAssignment } = bill;
  const committees = committeeAssignment ? parseCommittees(committeeAssignment) : [];
  const committeeList = committees.join(', ');

  const result = isBillDead(
    {
      bill_number: billNumber,
      bill_status: billStatus as BillStatus,
      committee_assignment: committeeAssignment,
    },
    statusUpdates,
    deadlines,
    today,
  );

  // Use the failedDeadline from the algorithm result — this is the FIRST
  // deadline the bill failed to meet, not the most recent one relative to today.
  const failed = result.failedDeadline ?? null;
  const deadlineName = failed?.name ?? null;

  // isBillDead returns five reason shapes. Branch on which one we actually got
  // rather than string-matching a single word: an earlier version only looked
  // for "deferred", so "Recommendation not adopted by WAM" (a committee action,
  // with no failedDeadline) fell through to the deadline copy and rendered
  // "its Unknown deadline".
  const lowerReason = result.reason.toLowerCase();
  const isNotAdopted = lowerReason.includes('recommendation was not adopted')
    || lowerReason.includes('recommendation not adopted');
  const isDeferral = lowerReason.includes('deferred');
  const isCommitteeAction = isNotAdopted || isDeferral;

  const closedSummary = CLOSED_STATUS_SUMMARY[billStatus];

  const summary = closedSummary
    ? closedSummary
    : isNotAdopted
      ? 'This bill failed because a committee did not adopt the recommendation to advance it.'
      : isDeferral
        ? 'This bill failed because it was permanently deferred by a committee.'
        : deadlineName && committees.length === 0
          ? `This bill failed because it was not referred to a committee before the ${deadlineName} deadline.`
          : deadlineName
            ? `This bill failed because it was not scheduled for a committee hearing before its ${deadlineName} deadline.`
            : 'This bill is no longer advancing this session.';

  const committeeLabel = committeeList || 'committee';

  const committeeExplanation = closedSummary
    ? `It is no longer moving through committee because the process for it has concluded. Its referrals were ${committeeLabel}.`
    : isNotAdopted
      ? `${committeeLabel} heard this bill but did not adopt the recommendation needed to move it forward, ending its progress this session.`
      : isDeferral
        ? 'The committee permanently deferred this bill, ending its progress this session.'
        : committees.length === 0
          ? 'This bill has no committee referral on record, so it cannot advance this session.'
          : deadlineName
            ? committees.length > 1
              ? `Bills referred to multiple committees must be scheduled by the ${deadlineName} deadline to remain active in this session. This bill was referred to ${committeeList} but neither chair scheduled it for a hearing in time.`
              : `This bill was referred to ${committeeLabel} but was not scheduled for a hearing before the ${deadlineName} deadline.`
            : `This bill was referred to ${committeeLabel} but did not complete the steps needed to stay active this session.`;

  return {
    heading: closedSummary ? 'Where did this bill end up?' : 'Why did this bill fail?',
    summary,
    missedDeadline:
      failed && !isCommitteeAction && !closedSummary
        ? { name: failed.name, date: formatDeadlineDate(failed.date) }
        : null,
    committeeExplanation,
    showRevivalNote: !closedSummary,
  };
}
