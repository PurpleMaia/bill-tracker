import type { BillStatus } from '@/db/types';
import { PROGRESS_STAGES } from '@/lib/bills/progress-stages';
import { currentCommitteeStep, type StatusLine } from '@/lib/testimony/committees';

/** Which chamber's hearing a testimony is for. Mirrors the `testimonies.chamber` CHECK. */
export type TestimonyChamber = 'house' | 'senate' | 'conference';

/**
 * The hearing round a testimony belongs to. Both null for testimonies written
 * before rounds existed (migration 000036).
 */
export interface TestimonyRound {
  chamber: TestimonyChamber | null;
  /** The committee step, joint referrals joined with '/' ("AGL/WTL"); null for conference. */
  committee: string | null;
}

/** The chamber a bill was introduced in, from its number prefix (HB/HCR → house, SB/SCR → senate). */
export function originChamber(billNumber: string): 'house' | 'senate' | null {
  const prefix = billNumber.trim().toUpperCase();
  if (prefix.startsWith('S')) return 'senate';
  if (prefix.startsWith('H')) return 'house';
  return null;
}

/**
 * The round a bill is in right now: the chamber hearing it (flipped in the
 * non-originating-chamber stage, 'conference' in conference) and the committee step it waits on.
 * Prefers the stored `current_committee`, else computes the step live. Pure.
 */
export function currentTestimonyRound(bill: {
  billNumber: string;
  billStatus: string | null;
  currentCommittee: string[] | null;
  committeeAssignment: string | null;
  updates?: StatusLine[] | null;
  dead: boolean;
}): TestimonyRound {
  // Chamber follows the bill's progress stage (PROGRESS_STAGES), not status
  // prefixes: crossoverWaiting1 still sits in the originating chamber, and
  // passedCommittees belongs to the non-originating one.
  const stage = PROGRESS_STAGES.find((s) => s.statuses.includes(bill.billStatus as BillStatus))?.id;
  if (stage === 'conference') return { chamber: 'conference', committee: null };

  const origin = originChamber(bill.billNumber);
  const chamber: TestimonyChamber | null =
    origin && stage === 'non-orig-chamber' ? (origin === 'house' ? 'senate' : 'house') : origin;

  const step =
    bill.currentCommittee && bill.currentCommittee.length > 0
      ? bill.currentCommittee
      : currentCommitteeStep({
          committeeAssignment: bill.committeeAssignment,
          updates: bill.updates,
          billStatus: bill.billStatus,
          dead: bill.dead,
        });

  return { chamber, committee: step && step.length > 0 ? step.join('/').toUpperCase() : null };
}

/** True when two rounds are the same hearing (nulls equal, committee case-insensitive). */
export function sameRound(a: TestimonyRound, b: TestimonyRound): boolean {
  return a.chamber === b.chamber && (a.committee ?? '').toUpperCase() === (b.committee ?? '').toUpperCase();
}

/**
 * Whether a bill's testimonies already cover its current round. Testimonies
 * written before rounds existed (both fields null) can't be placed in a round,
 * so while they are all the user has, they count as covering it — the
 * pre-migration behavior — rather than prompting a duplicate for the same
 * hearing. Once a round-tagged testimony exists, only an exact match covers.
 */
export function coversRound(testimonies: TestimonyRound[], round: TestimonyRound): boolean {
  if (testimonies.some((t) => sameRound(t, round))) return true;
  return testimonies.length > 0 && testimonies.every((t) => t.chamber === null && t.committee === null);
}

/**
 * Whether a testimony is for the bill's current hearing round — the round the
 * bill's latest hearing notice and deadline apply to. Pre-round testimonies
 * (both fields null) can't be placed, so they're treated as current.
 */
export function isCurrentRoundTestimony(testimony: TestimonyRound, current: TestimonyRound): boolean {
  if (testimony.chamber === null && testimony.committee === null) return true;
  return sameRound(testimony, current);
}

/**
 * Whether the bill's current round warrants offering an ADDITIONAL testimony
 * version: only a committee hearing round. A round with no committee
 * (passedCommittees, awaiting a floor vote; conference; no referral) has no
 * hearing to testify at. A bill's first testimony doesn't go through this.
 */
export function opensNewRound(round: TestimonyRound): boolean {
  return round.committee !== null && round.chamber !== 'conference';
}

const CHAMBER_LABELS: Record<TestimonyChamber, string> = {
  house: 'House',
  senate: 'Senate',
  conference: 'Conference',
};

/** "House · AGR", "Senate", "Conference", or "Earlier testimony" for pre-round rows. */
export function roundLabel(round: TestimonyRound): string {
  if (!round.chamber) return round.committee ?? 'Earlier testimony';
  const chamber = CHAMBER_LABELS[round.chamber];
  return round.committee ? `${chamber} · ${round.committee}` : chamber;
}

/** Groups items by bill, keeping first-seen bill order and the items' own order. */
export function groupByBill<T extends { billId: string }>(items: T[]): { billId: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(item.billId);
    if (group) group.push(item);
    else groups.set(item.billId, [item]);
  }
  return Array.from(groups, ([billId, grouped]) => ({ billId, items: grouped }));
}
