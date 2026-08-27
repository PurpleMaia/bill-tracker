// PURE standing derivation for the bill Learn page (/learn?bill=<id>).
//
// Answers "why is this bill in this spot, and what is the next action?" in one
// plain sentence: the concrete reason (which committee, in which chamber, a
// scheduled hearing, waiting on conferees, waiting for the Governor) rather
// than the coarse stage name. No DB, no AI. Reuses the same status buckets and
// testimony rules the rest of the app already trusts, so this cannot drift
// from the board.
import type { BillDetails } from '@/types/legislation';
import type { BillStatus as DBBillStatus } from '@/db/types';
import { getTestimonyEligibility } from '@/lib/testimony/testimony-eligibility';
import { SESSION_DEADLINES } from '@/lib/testimony/session-deadlines';
import { isEnacted, getBillChamber } from '@/lib/bills/dead-bill';
import { parseCommitteeCodes } from '@/lib/testimony/committees';

export interface BillStanding {
  /** One plain-language sentence: the real reason the bill is where it is. */
  reason: string;
  /** A short next-action nudge (descriptive only), or null when there is
   *  nothing the reader can do at this stage. */
  action: string | null;
}

// Statuses where a hearing is on the calendar (mirror of SCHEDULED_STATUSES,
// but we key off the shared list to avoid drift).
const CONFERENCE_STATUSES: DBBillStatus[] = [
  'conferenceAssigned',
  'conferenceScheduled',
  'conferenceDeferred',
  'conferencePassed',
];
const GOVERNOR_STATUSES: DBBillStatus[] = ['transmittedGovernor', 'vetoList'];
const SCHEDULED_STATUSES: DBBillStatus[] = [
  'scheduled1',
  'scheduled2',
  'scheduled3',
  'crossoverScheduled1',
  'crossoverScheduled2',
  'crossoverScheduled3',
];

// A bill introduced in the House ('HB') is originally in the House. After
// crossover (any status prefixed 'crossover') it sits in the other chamber.
function chamberName(chamber: 'HB' | 'SB'): string {
  return chamber === 'SB' ? 'Senate' : 'House';
}

function currentChamberPhrase(billNumber: string, status: DBBillStatus): string {
  const home = getBillChamber(billNumber);
  const inCrossover = status.startsWith('crossover');
  const other: 'HB' | 'SB' = home === 'SB' ? 'HB' : 'SB';
  return `the ${chamberName(inCrossover ? other : home)}`;
}

export function deriveBillStanding(bill: BillDetails, today: string): BillStanding {
  const status = bill.current_bill_status as DBBillStatus;
  const committeeAssignment = bill.committee_assignment || null;
  const codes = parseCommitteeCodes(committeeAssignment);
  const committeeLabel = codes.length > 0 ? ` (${codes.join(', ')})` : '';

  if (bill.dead) {
    return {
      reason:
        'This bill is no longer moving. Most bills die because a deadline passed or a committee chair never scheduled a hearing.',
      action: null,
    };
  }

  if (isEnacted(status)) {
    return { reason: 'This bill has become law.', action: null };
  }

  if (GOVERNOR_STATUSES.includes(status)) {
    return {
      reason: 'Waiting for the Governor to sign it, veto it, or let it become law without a signature.',
      action: null,
    };
  }

  if (CONFERENCE_STATUSES.includes(status)) {
    return {
      reason:
        'Waiting on conferees, the negotiators from both chambers, to agree on a single compromise draft.',
      action: null,
    };
  }

  // From here down the bill is in a chamber's committee process. Whether the
  // reader can act depends on the testimony window, so resolve that once.
  const chamber = currentChamberPhrase(bill.bill_number, status);
  const eligibility = getTestimonyEligibility({
    dead: bill.dead,
    billStatus: status,
    committeeAssignment,
    deadlines: SESSION_DEADLINES,
    today,
  });
  const testimonyAction = eligibility.allowed ? 'Submit testimony on this bill.' : null;

  if (SCHEDULED_STATUSES.includes(status)) {
    return {
      reason: `A committee hearing${committeeLabel} is scheduled in ${chamber}. This is when the public can weigh in.`,
      action: testimonyAction,
    };
  }

  if (status === 'introduced') {
    return {
      reason: `Introduced in ${chamber} and referred to committee${committeeLabel}. A committee must schedule a hearing before it can advance.`,
      action: testimonyAction,
    };
  }

  // Remaining committee statuses (waiting*, deferred*, crossover waiting/deferred,
  // passedCommittees): the bill is sitting with a committee awaiting a hearing.
  return {
    reason: `Waiting on a committee${committeeLabel} in ${chamber} to schedule a hearing. A chair is not required to schedule one, which is where most bills stall.`,
    action: testimonyAction,
  };
}
