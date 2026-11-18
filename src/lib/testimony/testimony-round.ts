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
 * The round a bill is in right now: the chamber hearing it (flipped after
 * crossover, 'conference' in conference) and the committee step it waits on.
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
  const status = bill.billStatus ?? '';
  if (status.startsWith('conference')) return { chamber: 'conference', committee: null };

  const origin = originChamber(bill.billNumber);
  const chamber: TestimonyChamber | null =
    origin && status.startsWith('crossover') ? (origin === 'house' ? 'senate' : 'house') : origin;

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
