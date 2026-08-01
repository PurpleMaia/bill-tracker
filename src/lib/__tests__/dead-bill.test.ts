import { describe, it, expect } from 'vitest';
import type { BillStatus } from '@/db/types';
import {
  parseCommittees,
  getReferralType,
  getBillChamber,
  isFiscalBill,
  isPreCrossover,
  findPermanentDeferral,
  isExplicitlyDeferred,
  getDeadReasonFromUpdate,
  getNextDeadline,
  getDeadlineTier,
  getApplicableDeadlines,
  getRelevantDeadline,
  isBillDead,
  isEnacted,
} from '../bills/dead-bill';
import type { SessionDeadlines, StatusUpdate } from '../bills/dead-bill';

// --- Test fixtures ---

const MOCK_DEADLINES: SessionDeadlines = {
  session: 2025,
  deadlines: {
    first_triple_referral_filing: { HB: '2025-02-06', SB: '2025-02-06' },
    first_lateral_filing: '2025-02-20',
    first_lateral: '2025-02-27',
    single_referral_filing: { SB: '2025-03-05', HB: '2025-04-09' },
    first_decking: '2025-03-06',
    first_crossover: '2025-03-13',
    second_triple_referral_filing: '2025-03-27',
    second_lateral_filing: '2025-04-03',
    second_lateral: '2025-04-10',
    second_decking: '2025-04-17',
    second_crossover: '2025-04-24',
    final_decking_non_fiscal: '2025-04-29',
    final_decking_fiscal: '2025-05-01',
    adjournment_sine_die: '2025-05-08',
  },
};

// --- Committee Parsing ---

describe('parseCommittees', () => {
  it('parses single committee', () => {
    expect(parseCommittees('JDC')).toEqual(['JDC']);
  });

  it('parses comma-separated committees', () => {
    expect(parseCommittees('JDC, WAM')).toEqual(['JDC', 'WAM']);
  });

  it('parses three committees', () => {
    expect(parseCommittees('JDC, WAM, FIN')).toEqual(['JDC', 'WAM', 'FIN']);
  });

  it('handles extra whitespace', () => {
    expect(parseCommittees('JDC ,  WAM ,FIN')).toEqual(['JDC', 'WAM', 'FIN']);
  });

  it('filters empty strings', () => {
    expect(parseCommittees('')).toEqual([]);
  });
});

describe('getReferralType', () => {
  it('single for 1 committee', () => {
    expect(getReferralType(1)).toBe('single');
  });

  it('double for 2 committees', () => {
    expect(getReferralType(2)).toBe('double');
  });

  it('triple for 3 committees', () => {
    expect(getReferralType(3)).toBe('triple');
  });

  it('triple for 4+ committees', () => {
    expect(getReferralType(4)).toBe('triple');
  });

  it('single for 0 committees', () => {
    expect(getReferralType(0)).toBe('single');
  });
});

describe('getBillChamber', () => {
  it('returns HB for house bills', () => {
    expect(getBillChamber('HB1234')).toBe('HB');
  });

  it('returns SB for senate bills', () => {
    expect(getBillChamber('SB5678')).toBe('SB');
  });

  it('handles lowercase', () => {
    expect(getBillChamber('sb100')).toBe('SB');
  });

  it('defaults to HB for unknown prefixes', () => {
    expect(getBillChamber('XB100')).toBe('HB');
  });
});

describe('isFiscalBill', () => {
  it('returns true for FIN committee', () => {
    expect(isFiscalBill('JDC, FIN')).toBe(true);
  });

  it('returns true for WAM committee', () => {
    expect(isFiscalBill('WAM')).toBe(true);
  });

  it('returns true for joint committee with WAM', () => {
    expect(isFiscalBill('JDL/WAM')).toBe(true);
  });

  it('returns false for non-fiscal committees', () => {
    expect(isFiscalBill('JDC, LAB')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isFiscalBill('fin')).toBe(true);
    expect(isFiscalBill('wam')).toBe(true);
  });
});

// --- Phase Detection ---

describe('isPreCrossover', () => {
  it('returns true for introduced', () => {
    expect(isPreCrossover('introduced' as BillStatus)).toBe(true);
  });

  it('returns true for scheduled1', () => {
    expect(isPreCrossover('scheduled1' as BillStatus)).toBe(true);
  });

  it('returns true for waiting2', () => {
    expect(isPreCrossover('waiting2' as BillStatus)).toBe(true);
  });

  it('returns false for crossoverWaiting1', () => {
    expect(isPreCrossover('crossoverWaiting1' as BillStatus)).toBe(false);
  });

  it('returns false for passedCommittees', () => {
    expect(isPreCrossover('passedCommittees' as BillStatus)).toBe(false);
  });

  it('returns false for conferenceAssigned', () => {
    expect(isPreCrossover('conferenceAssigned' as BillStatus)).toBe(false);
  });

  it('returns false for transmittedGovernor', () => {
    expect(isPreCrossover('transmittedGovernor' as BillStatus)).toBe(false);
  });

  it('returns false for governorSigns', () => {
    expect(isPreCrossover('governorSigns' as BillStatus)).toBe(false);
  });

  it('returns true for unassigned', () => {
    expect(isPreCrossover('unassigned' as BillStatus)).toBe(true);
  });
});

describe('isEnacted', () => {
  it('returns true for governorSigns (signed into law)', () => {
    expect(isEnacted('governorSigns' as BillStatus)).toBe(true);
  });

  it('returns true for lawWithoutSignature (became law without a signature)', () => {
    expect(isEnacted('lawWithoutSignature' as BillStatus)).toBe(true);
  });

  it('returns false for transmittedGovernor (not yet enacted)', () => {
    expect(isEnacted('transmittedGovernor' as BillStatus)).toBe(false);
  });

  it('returns false for vetoList (vetoed, not enacted)', () => {
    expect(isEnacted('vetoList' as BillStatus)).toBe(false);
  });

  it('returns false for an in-progress status', () => {
    expect(isEnacted('introduced' as BillStatus)).toBe(false);
  });

  it('returns false for null/undefined/empty', () => {
    expect(isEnacted(null)).toBe(false);
    expect(isEnacted(undefined)).toBe(false);
    expect(isEnacted('')).toBe(false);
  });
});

// --- Deferral Detection ---

describe('findPermanentDeferral', () => {
  it('returns null when no deferrals', () => {
    const updates: StatusUpdate[] = [
      { statustext: 'The committee heard testimony.', date: '2025-02-01', chamber: 'H' },
    ];
    expect(findPermanentDeferral(updates)).toBeNull();
  });

  it('detects "deferred the measure" as permanent', () => {
    const updates: StatusUpdate[] = [
      { statustext: 'The committee on JDC deferred the measure.', date: '2025-02-10', chamber: 'H' },
    ];
    const result = findPermanentDeferral(updates);
    expect(result).not.toBeNull();
    expect(result!.statustext).toContain('deferred the measure');
  });

  it('ignores temporary deferrals with "until"', () => {
    const updates: StatusUpdate[] = [
      { statustext: 'The committee on JDC deferred the measure until 04-06-25.', date: '2025-02-10', chamber: 'H' },
    ];
    expect(findPermanentDeferral(updates)).toBeNull();
  });

  it('detects "recommendation was not adopted"', () => {
    const updates: StatusUpdate[] = [
      { statustext: 'The recommendation was not adopted.', date: '2025-02-15', chamber: 'H' },
    ];
    expect(findPermanentDeferral(updates)).not.toBeNull();
  });

  it('detects "measure be deferred"', () => {
    const updates: StatusUpdate[] = [
      { statustext: 'The committee(s) on LAB recommend(s) that the measure be deferred.', date: '2025-03-01', chamber: 'H' },
    ];
    expect(findPermanentDeferral(updates)).not.toBeNull();
  });

  it('returns null if bill recovered after deferral', () => {
    const updates: StatusUpdate[] = [
      { statustext: 'The committee on JDC deferred the measure.', date: '2025-02-10', chamber: 'H' },
      { statustext: 'The committee heard testimony.', date: '2025-02-15', chamber: 'H' },
    ];
    expect(findPermanentDeferral(updates)).toBeNull();
  });

  it('returns deferral if only subsequent updates are also deferrals', () => {
    const updates: StatusUpdate[] = [
      { statustext: 'The committee on JDC deferred the measure.', date: '2025-02-10', chamber: 'H' },
      { statustext: 'The recommendation was not adopted.', date: '2025-02-15', chamber: 'H' },
    ];
    expect(findPermanentDeferral(updates)).not.toBeNull();
  });

  it('sorts by date before checking', () => {
    const updates: StatusUpdate[] = [
      { statustext: 'The committee heard testimony.', date: '2025-02-15', chamber: 'H' },
      { statustext: 'The committee on JDC deferred the measure.', date: '2025-02-10', chamber: 'H' },
    ];
    // Deferral came before testimony, so bill recovered
    expect(findPermanentDeferral(updates)).toBeNull();
  });
});

describe('isExplicitlyDeferred', () => {
  it('returns true when permanent deferral found', () => {
    const updates: StatusUpdate[] = [
      { statustext: 'The committee on JDC deferred the measure.', date: '2025-02-10', chamber: 'H' },
    ];
    expect(isExplicitlyDeferred(updates)).toBe(true);
  });

  it('returns false when no deferral', () => {
    expect(isExplicitlyDeferred([])).toBe(false);
  });
});

describe('getDeadReasonFromUpdate', () => {
  it('returns "Missed deadline" for null', () => {
    expect(getDeadReasonFromUpdate(null)).toBe('Missed deadline');
  });

  it('returns "Missed deadline" for non-deferral text', () => {
    expect(getDeadReasonFromUpdate('The committee heard testimony.')).toBe('Missed deadline');
  });

  it('extracts committee name from deferral', () => {
    const reason = getDeadReasonFromUpdate('The committee on JDC deferred the measure.');
    expect(reason).toBe('Deferred by JDC');
  });

  it('handles recommendation not adopted with committee', () => {
    const reason = getDeadReasonFromUpdate('The committee on LAB: The recommendation was not adopted.');
    expect(reason).toContain('Recommendation not adopted');
    expect(reason).toContain('LAB');
  });

  it('returns generic message when no committee found in deferral', () => {
    const reason = getDeadReasonFromUpdate('deferred the measure');
    expect(reason).toBe('Deferred by committee');
  });
});

// --- Deadline Computation ---

describe('getApplicableDeadlines', () => {
  it('includes first crossover for pre-crossover single referral SB', () => {
    const deadlines = getApplicableDeadlines('single', 'SB', true, MOCK_DEADLINES, 'JDC');
    const names = deadlines.map((d) => d.name);
    expect(names).toContain('Single Referral Filing (SBs)');
    expect(names).toContain('First Decking');
    expect(names).toContain('First Crossover');
  });

  it('includes triple referral filing for pre-crossover triple referral', () => {
    const deadlines = getApplicableDeadlines('triple', 'HB', true, MOCK_DEADLINES, 'JDC, WAM, FIN');
    const names = deadlines.map((d) => d.name);
    expect(names).toContain('First Triple Referral Filing');
    expect(names).toContain('First Lateral');
  });

  it('includes second crossover for post-crossover bills', () => {
    const deadlines = getApplicableDeadlines('single', 'HB', false, MOCK_DEADLINES, 'JDC');
    const names = deadlines.map((d) => d.name);
    expect(names).toContain('Single Referral Filing (HBs)');
    expect(names).toContain('Second Decking');
    expect(names).toContain('Second Crossover');
  });

  it('always includes endgame deadlines', () => {
    const deadlines = getApplicableDeadlines('single', 'HB', true, MOCK_DEADLINES, 'JDC');
    const names = deadlines.map((d) => d.name);
    expect(names).toContain('Final Decking (Non-Fiscal)');
    expect(names).toContain('Adjournment Sine Die');
  });

  it('uses fiscal deadline for fiscal bills', () => {
    const deadlines = getApplicableDeadlines('single', 'HB', true, MOCK_DEADLINES, 'FIN');
    const names = deadlines.map((d) => d.name);
    expect(names).toContain('Final Decking (Fiscal)');
    expect(names).not.toContain('Final Decking (Non-Fiscal)');
  });

  it('returns deadlines in chronological order', () => {
    const deadlines = getApplicableDeadlines('triple', 'HB', true, MOCK_DEADLINES, 'JDC, WAM, FIN');
    for (let i = 1; i < deadlines.length; i++) {
      expect(deadlines[i].date >= deadlines[i - 1].date).toBe(true);
    }
  });
});

describe('getNextDeadline', () => {
  it('returns next upcoming deadline for an introduced bill', () => {
    const result = getNextDeadline(
      'HB100',
      'introduced' as BillStatus,
      'JDC',
      MOCK_DEADLINES,
      '2025-01-15'
    );
    expect(result).not.toBeNull();
    expect(result!.date >= '2025-01-15').toBe(true);
  });

  it('returns null when bill has met all deadlines', () => {
    const result = getNextDeadline(
      'HB100',
      'governorSigns' as BillStatus,
      'JDC',
      MOCK_DEADLINES,
      '2025-05-10'
    );
    expect(result).toBeNull();
  });
});

describe('getRelevantDeadline', () => {
  it('returns the most recent passed deadline', () => {
    const result = getRelevantDeadline('single', 'SB', true, MOCK_DEADLINES, '2025-03-10', 'JDC');
    expect(result).not.toBeNull();
    expect(result!.date <= '2025-03-10').toBe(true);
  });

  it('returns null when no deadlines have passed', () => {
    const result = getRelevantDeadline('single', 'SB', true, MOCK_DEADLINES, '2025-01-01', 'JDC');
    expect(result).toBeNull();
  });
});

// --- Top-Level Verdict ---

describe('isBillDead', () => {
  it('returns dead=true for permanently deferred bill', () => {
    const result = isBillDead(
      { bill_number: 'HB100', bill_status: 'introduced' as BillStatus, committee_assignment: 'JDC' },
      [{ statustext: 'The committee on JDC deferred the measure.', date: '2025-02-10', chamber: 'H' }],
      MOCK_DEADLINES,
      '2025-03-01'
    );
    expect(result.dead).toBe(true);
    expect(result.reason).toContain('Deferred by JDC');
  });

  it('returns dead=true for bill that missed first crossover', () => {
    const result = isBillDead(
      { bill_number: 'HB100', bill_status: 'introduced' as BillStatus, committee_assignment: 'JDC' },
      [],
      MOCK_DEADLINES,
      '2025-03-14' // after first crossover
    );
    expect(result.dead).toBe(true);
    expect(result.reason).toContain('Missed');
  });

  it('returns dead=false for bill on track', () => {
    const result = isBillDead(
      { bill_number: 'HB100', bill_status: 'crossoverWaiting1' as BillStatus, committee_assignment: 'JDC' },
      [],
      MOCK_DEADLINES,
      '2025-03-14'
    );
    expect(result.dead).toBe(false);
  });

  it('returns dead=false when no deadlines have passed yet', () => {
    const result = isBillDead(
      { bill_number: 'HB100', bill_status: 'unassigned' as BillStatus, committee_assignment: 'JDC' },
      [],
      MOCK_DEADLINES,
      '2025-01-01'
    );
    expect(result.dead).toBe(false);
    expect(result.reason).toContain('No applicable deadline');
  });

  it('prioritizes deferral over missed deadline', () => {
    const result = isBillDead(
      { bill_number: 'HB100', bill_status: 'introduced' as BillStatus, committee_assignment: 'JDC' },
      [{ statustext: 'The committee on JDC deferred the measure.', date: '2025-02-10', chamber: 'H' }],
      MOCK_DEADLINES,
      '2025-05-09' // after adjournment
    );
    expect(result.dead).toBe(true);
    expect(result.reason).toContain('Deferred'); // deferral, not missed deadline
  });

  it('returns dead=true for bill that missed adjournment', () => {
    const result = isBillDead(
      { bill_number: 'HB100', bill_status: 'transmittedGovernor' as BillStatus, committee_assignment: 'JDC' },
      [],
      MOCK_DEADLINES,
      '2025-05-09'
    );
    expect(result.dead).toBe(true);
    expect(result.reason).toContain('Missed');
  });

  it('returns dead=false for signed bill after adjournment', () => {
    const result = isBillDead(
      { bill_number: 'HB100', bill_status: 'governorSigns' as BillStatus, committee_assignment: 'JDC' },
      [],
      MOCK_DEADLINES,
      '2025-05-09'
    );
    expect(result.dead).toBe(false);
  });

  it('handles recommendation not adopted', () => {
    const result = isBillDead(
      { bill_number: 'SB200', bill_status: 'scheduled1' as BillStatus, committee_assignment: 'LAB' },
      [{ statustext: 'The recommendation was not adopted.', date: '2025-02-20', chamber: 'S' }],
      MOCK_DEADLINES,
      '2025-03-01'
    );
    expect(result.dead).toBe(true);
    expect(result.reason).toContain('Recommendation not adopted');
  });
});

describe('getDeadlineTier', () => {
  it('is urgent at 7 days or fewer', () => {
    expect(getDeadlineTier(0)).toBe('urgent');
    expect(getDeadlineTier(3)).toBe('urgent');
    expect(getDeadlineTier(7)).toBe('urgent');
  });

  it('is warning between 8 and 14 days', () => {
    expect(getDeadlineTier(8)).toBe('warning');
    expect(getDeadlineTier(14)).toBe('warning');
  });

  it('is safe beyond 14 days', () => {
    expect(getDeadlineTier(15)).toBe('safe');
    expect(getDeadlineTier(60)).toBe('safe');
  });
});
