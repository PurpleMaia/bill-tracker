import { describe, it, expect } from 'vitest';
import { getTestimonyEligibility, isTestimonyUrgent } from '@/lib/testimony/testimony-eligibility';
import type { SessionDeadlines } from '@/lib/bills/dead-bill';

const DEADLINES: SessionDeadlines = {
  session: 2026,
  deadlines: {
    first_triple_referral_filing: { HB: '2026-02-13', SB: '2026-02-13' },
    first_lateral_filing: '2026-02-20',
    first_lateral: '2026-02-20',
    single_referral_filing: { SB: '2026-03-05', HB: '2026-04-09' },
    first_decking: '2026-03-03',
    first_crossover: '2026-03-10',
    second_triple_referral_filing: '2026-03-20',
    second_lateral_filing: '2026-03-27',
    second_lateral: '2026-03-27',
    second_decking: '2026-04-10',
    second_crossover: '2026-04-16',
    final_decking_non_fiscal: '2026-04-29',
    final_decking_fiscal: '2026-05-01',
    adjournment_sine_die: '2026-05-07',
  },
};

const base = {
  dead: false,
  billStatus: 'waiting2' as const,
  committeeAssignment: 'AGR, CPC',
  deadlines: DEADLINES,
  today: '2026-03-15',
};

describe('getTestimonyEligibility', () => {
  it('allows testimony for a live bill during the session', () => {
    expect(getTestimonyEligibility(base)).toEqual({ allowed: true, reason: null });
  });

  it('closes testimony when the bill is enacted into law', () => {
    expect(getTestimonyEligibility({ ...base, billStatus: 'governorSigns' })).toEqual({
      allowed: false,
      reason: 'This bill has been enacted into law',
    });
    expect(getTestimonyEligibility({ ...base, billStatus: 'lawWithoutSignature' })).toEqual({
      allowed: false,
      reason: 'This bill has been enacted into law',
    });
  });

  it('closes testimony when the bill is dead', () => {
    expect(getTestimonyEligibility({ ...base, dead: true })).toEqual({
      allowed: false,
      reason: 'This bill is dead',
    });
  });

  it('closes testimony after the final hearing deadline for non-fiscal bills', () => {
    expect(getTestimonyEligibility({ ...base, today: '2026-04-30' })).toEqual({
      allowed: false,
      reason: 'The final hearing deadline has passed',
    });
  });

  it('gives fiscal bills until the fiscal final decking date', () => {
    const fiscal = { ...base, committeeAssignment: 'AGR, FIN' };
    expect(getTestimonyEligibility({ ...fiscal, today: '2026-04-30' })).toEqual({
      allowed: true,
      reason: null,
    });
    expect(getTestimonyEligibility({ ...fiscal, today: '2026-05-02' })).toEqual({
      allowed: false,
      reason: 'The final hearing deadline has passed',
    });
  });

  it('treats a bill with no committee assignment as non-fiscal', () => {
    expect(getTestimonyEligibility({ ...base, committeeAssignment: null, today: '2026-04-30' })).toEqual({
      allowed: false,
      reason: 'The final hearing deadline has passed',
    });
    expect(getTestimonyEligibility({ ...base, committeeAssignment: null })).toEqual({
      allowed: true,
      reason: null,
    });
  });

  it('reports enacted rather than deadline-passed for bills signed after session', () => {
    expect(
      getTestimonyEligibility({ ...base, billStatus: 'governorSigns', today: '2026-06-01' }),
    ).toEqual({ allowed: false, reason: 'This bill has been enacted into law' });
  });
});

describe('isTestimonyUrgent', () => {
  it('is urgent for every scheduled-hearing status', () => {
    for (const status of [
      'scheduled1',
      'scheduled2',
      'scheduled3',
      'crossoverScheduled1',
      'crossoverScheduled2',
      'crossoverScheduled3',
      'conferenceScheduled',
    ] as const) {
      expect(isTestimonyUrgent(status)).toBe(true);
    }
  });

  it('is not urgent for waiting, deferred, or terminal statuses', () => {
    for (const status of [
      'introduced',
      'waiting2',
      'deferred1',
      'crossoverWaiting1',
      'passedCommittees',
      'transmittedGovernor',
      'governorSigns',
    ] as const) {
      expect(isTestimonyUrgent(status)).toBe(false);
    }
  });
});
