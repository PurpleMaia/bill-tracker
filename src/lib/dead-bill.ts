import { BillStatus } from '@/db/types';
import { COLUMN_INDEX } from '@/lib/kanban-columns';

// --- Types ---

export type ReferralType = 'single' | 'double' | 'triple';
export type Chamber = 'HB' | 'SB';

export interface DeadlineEntry {
  name: string;
  date: string;
  minimumStatus: BillStatus;
}

export interface DeadBillResult {
  dead: boolean;
  reason: string;
}

export interface SessionDeadlines {
  session: number;
  deadlines: {
    first_triple_referral_filing: { HB: string; SB: string };
    first_lateral_filing: string;
    first_lateral: string;
    single_referral_filing: { SB: string; HB: string };
    first_decking: string;
    first_crossover: string;
    second_triple_referral_filing: string;
    second_lateral_filing: string;
    second_lateral: string;
    second_decking: string;
    second_crossover: string;
  };
}

export interface StatusUpdate {
  statustext: string;
  date: string;
  chamber: string;
}

// --- Committee Parsing ---

export function parseCommittees(committeeAssignment: string): string[] {
  return committeeAssignment
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

export function getReferralType(committeeCount: number): ReferralType {
  if (committeeCount >= 3) return 'triple';
  if (committeeCount === 2) return 'double';
  return 'single';
}

export function getBillChamber(billNumber: string): Chamber {
  const prefix = billNumber.replace(/[0-9]/g, '').toUpperCase();
  if (prefix.startsWith('SB')) return 'SB';
  return 'HB';
}

// --- Phase Detection ---

export function isPreCrossover(status: BillStatus): boolean {
  const statusStr = status as string;
  return !statusStr.startsWith('crossover') &&
    !['passedCommittees', 'conferenceAssigned', 'conferenceScheduled',
      'conferenceDeferred', 'conferencePassed', 'transmittedGovernor',
      'vetoList', 'governorSigns', 'lawWithoutSignature'].includes(statusStr);
}

// --- Kill Condition 1: Explicit Deferral ---

/**
 * A permanent deferral looks like: "The committee on JDC deferred the measure."
 * A temporary deferral (NOT a kill) looks like: "...deferred the measure until 04-06-26..."
 *
 * Only permanent deferrals count as kills. A deferral is permanent if:
 * 1. The statustext contains "deferred the measure" WITHOUT "until" after it, AND
 * 2. There is no subsequent status update after the deferral (bill did not recover)
 */
export function findPermanentDeferral(statusUpdates: StatusUpdate[]): StatusUpdate | null {
  // Status updates should be sorted by date ascending
  for (let i = 0; i < statusUpdates.length; i++) {
    const text = statusUpdates[i].statustext.toLowerCase();
    if (!text.includes('deferred the measure')) continue;

    // Skip temporary deferrals ("deferred the measure until ...")
    if (text.includes('deferred the measure until')) continue;

    // Check if the bill recovered — any subsequent status update means it did
    const hasSubsequentActivity = statusUpdates.slice(i + 1).some((u) =>
      !u.statustext.toLowerCase().includes('deferred the measure')
    );
    if (hasSubsequentActivity) continue;

    return statusUpdates[i];
  }
  return null;
}

export function isExplicitlyDeferred(statusUpdates: StatusUpdate[]): boolean {
  return findPermanentDeferral(statusUpdates) !== null;
}

// --- Deadline Resolution ---

function resolveDate(
  entry: string | { HB: string; SB: string },
  chamber: Chamber
): string {
  if (typeof entry === 'string') return entry;
  return entry[chamber];
}

/**
 * Returns all deadlines applicable to this bill, in chronological order,
 * with the minimum status the bill must have reached by each deadline.
 * Minimum status indices are monotonically non-decreasing with date.
 * All dates use YYYY-MM-DD format for lexicographic comparison.
 */
export function getApplicableDeadlines(
  referralType: ReferralType,
  chamber: Chamber,
  preCrossover: boolean,
  deadlines: SessionDeadlines
): DeadlineEntry[] {
  const d = deadlines.deadlines;
  const entries: DeadlineEntry[] = [];

  if (preCrossover) {
    if (referralType === 'triple') {
      entries.push({
        name: 'First Triple Referral Filing',
        date: resolveDate(d.first_triple_referral_filing, chamber),
        minimumStatus: 'waiting2' as BillStatus,
      });
    }

    if (referralType === 'double' || referralType === 'triple') {
      entries.push({
        name: 'First Lateral',
        date: d.first_lateral,
        minimumStatus: (referralType === 'triple' ? 'waiting3' : 'waiting2') as BillStatus,
      });
    }

    // Single referral SBs have a pre-crossover filing deadline (Mar 5).
    // Single referral HBs have a post-crossover filing deadline (Apr 9) — handled in the else branch.
    if (referralType === 'single' && chamber === 'SB') {
      entries.push({
        name: 'Single Referral Filing (SBs)',
        date: resolveDate(d.single_referral_filing, 'SB'),
        minimumStatus: 'waiting2' as BillStatus,
      });
    }

    entries.push({
      name: 'First Decking',
      date: d.first_decking,
      minimumStatus: 'passedCommittees' as BillStatus,
    });

    entries.push({
      name: 'First Crossover',
      date: d.first_crossover,
      minimumStatus: 'crossoverWaiting1' as BillStatus,
    });
  } else {
    if (referralType === 'triple') {
      entries.push({
        name: 'Second Triple Referral Filing',
        date: d.second_triple_referral_filing,
        minimumStatus: 'crossoverWaiting2' as BillStatus,
      });
    }

    if (referralType === 'double' || referralType === 'triple') {
      entries.push({
        name: 'Second Lateral',
        date: d.second_lateral,
        minimumStatus: (referralType === 'triple' ? 'crossoverWaiting3' : 'crossoverWaiting2') as BillStatus,
      });
    }

    if (referralType === 'single' && chamber === 'HB') {
      entries.push({
        name: 'Single Referral Filing (HBs)',
        date: resolveDate(d.single_referral_filing, 'HB'),
        minimumStatus: 'crossoverWaiting2' as BillStatus,
      });
    }

    entries.push({
      name: 'Second Decking',
      date: d.second_decking,
      minimumStatus: 'passedCommittees' as BillStatus,
    });

    entries.push({
      name: 'Second Crossover',
      date: d.second_crossover,
      minimumStatus: 'conferenceAssigned' as BillStatus,
    });
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));
  return entries;
}

/**
 * Given today's date (YYYY-MM-DD), find the most recent deadline that has passed
 * and return it. Returns null if no deadlines have passed yet.
 */
export function getRelevantDeadline(
  referralType: ReferralType,
  chamber: Chamber,
  preCrossover: boolean,
  deadlines: SessionDeadlines,
  today: string
): DeadlineEntry | null {
  const applicable = getApplicableDeadlines(referralType, chamber, preCrossover, deadlines);
  const passed = applicable.filter((d) => d.date <= today);
  if (passed.length === 0) return null;
  return passed[passed.length - 1];
}

// --- Top-Level Verdict ---

export function isBillDead(
  bill: {
    bill_number: string;
    bill_status: BillStatus;
    committee_assignment: string;
  },
  statusUpdates: StatusUpdate[],
  deadlines: SessionDeadlines,
  today: string
): DeadBillResult {
  // Kill Condition 1: Explicit deferral
  const deferralUpdate = findPermanentDeferral(statusUpdates);
  if (deferralUpdate) {
    return {
      dead: true,
      reason: `Explicitly deferred: "${deferralUpdate.statustext}"`,
    };
  }

  // Parse bill properties
  const committees = parseCommittees(bill.committee_assignment);
  const referralType = getReferralType(committees.length);
  const chamber = getBillChamber(bill.bill_number);
  const preCrossover = isPreCrossover(bill.bill_status);

  // Kill Condition 2: Missed deadline
  const deadline = getRelevantDeadline(
    referralType,
    chamber,
    preCrossover,
    deadlines,
    today
  );

  if (!deadline) {
    return {
      dead: false,
      reason: 'No applicable deadline has passed yet',
    };
  }

  const currentIndex = COLUMN_INDEX[bill.bill_status] ?? 0;
  const requiredIndex = COLUMN_INDEX[deadline.minimumStatus] ?? 0;

  if (currentIndex < requiredIndex) {
    return {
      dead: true,
      reason: `Missed deadline: ${deadline.name} (${deadline.date}). Bill is at "${bill.bill_status}" (index ${currentIndex}) but should be at or past "${deadline.minimumStatus}" (index ${requiredIndex})`,
    };
  }

  return {
    dead: false,
    reason: `Bill meets the most recent deadline: ${deadline.name} (${deadline.date}). Status "${bill.bill_status}" (index ${currentIndex}) >= required "${deadline.minimumStatus}" (index ${requiredIndex})`,
  };
}
