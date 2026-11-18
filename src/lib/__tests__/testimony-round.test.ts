import { describe, it, expect } from 'vitest';
import {
  coversRound,
  currentTestimonyRound,
  groupByBill,
  originChamber,
  roundLabel,
  sameRound,
} from '@/lib/testimony/testimony-round';

const base = { committeeAssignment: 'AGR, FIN', updates: [], dead: false, currentCommittee: null };

describe('currentTestimonyRound', () => {
  it('uses the origin chamber before crossover', () => {
    expect(
      currentTestimonyRound({ ...base, billNumber: 'HB123', billStatus: 'scheduled1', currentCommittee: ['AGR'] }),
    ).toEqual({ chamber: 'house', committee: 'AGR' });
  });

  it('flips the chamber on crossover statuses', () => {
    expect(
      currentTestimonyRound({
        ...base,
        billNumber: 'HB123',
        billStatus: 'crossoverScheduled1',
        currentCommittee: ['AGL', 'WTL'],
      }),
    ).toEqual({ chamber: 'senate', committee: 'AGL/WTL' });
  });

  it('gives conference no committee', () => {
    expect(currentTestimonyRound({ ...base, billNumber: 'SB9', billStatus: 'conferenceScheduled' })).toEqual({
      chamber: 'conference',
      committee: null,
    });
  });

  it('falls back to the live committee step when current_committee is empty', () => {
    expect(currentTestimonyRound({ ...base, billNumber: 'SB9', billStatus: 'introduced' })).toEqual({
      chamber: 'senate',
      committee: 'AGR',
    });
  });

  it('leaves committee null when the bill has no referral', () => {
    expect(
      currentTestimonyRound({ ...base, committeeAssignment: null, billNumber: 'SB9', billStatus: 'unassigned' }),
    ).toEqual({ chamber: 'senate', committee: null });
  });
});

describe('roundLabel', () => {
  it('labels each kind of round', () => {
    expect(roundLabel({ chamber: 'house', committee: 'AGR' })).toBe('House · AGR');
    expect(roundLabel({ chamber: 'senate', committee: null })).toBe('Senate');
    expect(roundLabel({ chamber: 'conference', committee: null })).toBe('Conference');
    expect(roundLabel({ chamber: null, committee: null })).toBe('Earlier testimony');
  });
});

describe('sameRound', () => {
  it('treats nulls as equal and ignores committee case', () => {
    expect(sameRound({ chamber: null, committee: null }, { chamber: null, committee: null })).toBe(true);
    expect(sameRound({ chamber: 'house', committee: 'agr' }, { chamber: 'house', committee: 'AGR' })).toBe(true);
    expect(sameRound({ chamber: 'house', committee: 'AGR' }, { chamber: 'senate', committee: 'AGR' })).toBe(false);
  });
});

describe('groupByBill', () => {
  it('keeps first-seen bill order and item order', () => {
    const groups = groupByBill([
      { billId: 'a', n: 1 },
      { billId: 'b', n: 2 },
      { billId: 'a', n: 3 },
    ]);
    expect(groups.map((g) => [g.billId, g.items.map((i) => i.n)])).toEqual([
      ['a', [1, 3]],
      ['b', [2]],
    ]);
  });
});

describe('originChamber', () => {
  it('reads the chamber from the bill number prefix', () => {
    expect(originChamber('SB 12')).toBe('senate');
    expect(originChamber('HCR5')).toBe('house');
    expect(originChamber('')).toBe(null);
  });
});

describe('coversRound', () => {
  const senate = { chamber: 'senate' as const, committee: 'AGL' };
  const legacy = { chamber: null, committee: null };
  it('matches a testimony for the same round', () => {
    expect(coversRound([{ chamber: 'senate', committee: 'agl' }], senate)).toBe(true);
    expect(coversRound([{ chamber: 'house', committee: 'AGR' }], senate)).toBe(false);
  });
  it('treats legacy-only testimonies as covering, as before rounds existed', () => {
    expect(coversRound([legacy], senate)).toBe(true);
  });
  it('stops trusting legacy rows once the user has written a round-tagged testimony', () => {
    expect(coversRound([legacy, { chamber: 'house', committee: 'AGR' }], senate)).toBe(false);
  });
  it('is false with no testimonies', () => {
    expect(coversRound([], senate)).toBe(false);
  });
});
