// PURE briefing-fact derivation — no DB, no AI. This is what lets the Bill
// Briefing render a useful summary when the user opts out of AI.
import type { BillDetails } from '@/types/legislation';
import type { BillStatus as DBBillStatus } from '@/db/types';
import { getTestimonyEligibility, isTestimonyUrgent } from '@/lib/testimony/testimony-eligibility';
import { getTestimonyDeadline } from '@/lib/testimony/hearing-schedule';
import { getNextDeadline, isFiscalBill, isEnacted, formatDeadlineStanding, parseCommittees } from '@/lib/bills/dead-bill';
import { COLUMN_DESCRIPTIONS, COLUMN_TITLES, isAwaitingHearing } from '@/lib/bills/kanban-columns';
import { formatBillStatusName } from '@/lib/core/utils';
import { SESSION_DEADLINES } from '@/lib/testimony/session-deadlines';
import { sortVersions } from '@/lib/versions/bill-versions';
import { parseCommitteeCodes } from '@/lib/testimony/committees';

export interface BriefingStep {
  text: string;
  action: 'testimony' | 'diff' | 'reports' | 'contact';
}

export interface BriefingFacts {
  testimony: { open: boolean; urgent: boolean; message: string };
  standing: string;
  latestVersionLabel: string | null;
  latestVersionHtml: string | null;
  /** Flattened, de-duped codes — used for counts and next-step gating. */
  committeeCodes: string[];
  /** Raw referral tokens with joints intact ("HHS/AEN" stays one entry) — used
   *  for display, so a joint referral reads as a joint referral. */
  committeeReferrals: string[];
  reportCount: number;
  nextSteps: BriefingStep[];
}

export function deriveBriefingFacts(bill: BillDetails, today: string): BriefingFacts {
  const status = bill.current_bill_status as DBBillStatus;
  const committeeAssignment = bill.committee_assignment || null;

  // Close testimony once THIS scheduled hearing has passed — not only at the
  // session's final deadline — so the briefing agrees with the card's
  // "Testimony closed" chip and the dialog's Write action.
  const testimonyDeadline = getTestimonyDeadline({
    billStatus: status,
    latestStatusText: bill.latest_update?.statustext ?? null,
    now: new Date(today + 'T00:00:00'),
  });
  const eligibility = getTestimonyEligibility({
    dead: bill.dead,
    billStatus: status,
    committeeAssignment,
    deadlines: SESSION_DEADLINES,
    today,
    hearingPassed: testimonyDeadline.hearingPassed,
  });
  const urgent = eligibility.allowed && isTestimonyUrgent(status);
  // Lowercase the reason's leading letter so it reads as one sentence
  // ("Testimony is closed — the hearing has already been held.").
  const closedReason = eligibility.reason
    ? eligibility.reason.charAt(0).toLowerCase() + eligibility.reason.slice(1)
    : 'testimony is not currently being accepted';
  const testimony = {
    open: eligibility.allowed,
    urgent,
    message: eligibility.allowed
      ? urgent
        ? 'Testimony is open and a hearing is imminent. Submit as soon as possible.'
        : 'You can prepare testimony before a hearing is scheduled. Submit it once a hearing is set.'
      : `Testimony is closed! ${closedReason}.`,
  };

  // Where it stands: dead reason, the upcoming-deadline sentence (identical to
  // the card's countdown-chip tooltip), or a plain status line for terminal
  // statuses that have no upcoming deadline.
  const fiscal = committeeAssignment ? isFiscalBill(committeeAssignment) : false;
  let standing: string;
  if (bill.dead) {
    standing = 'This bill is no longer moving (marked failed).';
  } else {
    const next = committeeAssignment
      ? getNextDeadline(bill.bill_number, status, committeeAssignment, SESSION_DEADLINES, today)
      : null;
    if (next) {
      const daysAway = Math.ceil(
        (new Date(next.date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) /
          86_400_000,
      );
      // Same verbiage as the kanban card's deadline chip tooltip (shared helper).
      standing = formatDeadlineStanding(next, daysAway, isAwaitingHearing(status));
    } else if (isEnacted(status)) {
      standing = 'This bill has passed and is now law.';
    } else {
      // Terminal statuses without an upcoming deadline: show the friendly board
      // title, never the raw enum value.
      const label = COLUMN_DESCRIPTIONS[status] ?? formatBillStatusName(status);
      standing = `Currently ${label.toLowerCase()}${fiscal ? ' · fiscal bill' : ''}.`;
    }
  }

  // Tolerate a bill whose versions/reports haven't loaded yet (plain Bill).
  const versions = Array.isArray(bill.versions) ? bill.versions : [];
  const reports = Array.isArray(bill.reports) ? bill.reports : [];
  const sorted = sortVersions(versions);
  const latest = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  const committeeCodes = parseCommitteeCodes(committeeAssignment);
  const committeeReferrals = committeeAssignment ? parseCommittees(committeeAssignment) : [];

  const nextSteps: BriefingStep[] = [];
  if (testimony.open) {
    nextSteps.push({ text: 'Write and submit testimony on this bill.', action: 'testimony' });
  }
  if (versions.length >= 2) {
    nextSteps.push({ text: 'Compare the two most recent drafts to see what changed.', action: 'diff' });
  }
  if (reports.length > 0) {
    nextSteps.push({ text: `Review the ${reports.length} committee report(s).`, action: 'reports' });
  }
  // No point contacting legislators once the bill is law — the process is over.
  if (committeeCodes.length > 0 && !isEnacted(status)) {
    nextSteps.push({ text: 'Contact the committee chairs to schedule a hearing.', action: 'contact' });
  }

  return {
    testimony,
    standing,
    latestVersionLabel: latest?.label ?? null,
    latestVersionHtml: latest?.htmlLink ?? null,
    committeeCodes,
    committeeReferrals,
    reportCount: reports.length,
    nextSteps,
  };
}
