import { describe, it, expect } from 'vitest';
import { explainDeadBill } from '../bills/dead-bill-explanation';
import type { SessionDeadlines } from '../bills/dead-bill';

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

describe('explainDeadBill', () => {
  it('deferral: committee-action copy, no missed deadline, revival note', () => {
    const e = explainDeadBill({ billNumber: 'HB100', billStatus: 'introduced', committeeAssignment: 'JDC' },
      [{ statustext: 'The committee on JDC deferred the measure.', date: '2025-02-10', chamber: 'H' }],
      MOCK_DEADLINES, '2025-03-01');
    expect(e.heading).toBe('Why did this bill fail?');
    expect(e.summary).toBe('This bill failed because it was permanently deferred by a committee.');
    expect(e.missedDeadline).toBeNull();
    expect(e.committeeExplanation).toBe('The committee permanently deferred this bill, ending its progress this session.');
    expect(e.showRevivalNote).toBe(true);
  });

  it('recommendation not adopted: names the committees', () => {
    const e = explainDeadBill({ billNumber: 'SB5', billStatus: 'introduced', committeeAssignment: 'AGR, WAM' },
      [{ statustext: 'The committee(s) on WAM recommend(s) that the measure be PASSED. The recommendation was not adopted.', date: '2025-02-10', chamber: 'S' }],
      MOCK_DEADLINES, '2025-03-01');
    expect(e.summary).toBe('This bill failed because a committee did not adopt the recommendation to advance it.');
    expect(e.committeeExplanation).toContain('AGR, WAM heard this bill but did not adopt');
    expect(e.missedDeadline).toBeNull();
  });

  it('missed deadline: summary names it and the date is formatted timezone-independently', () => {
    const e = explainDeadBill({ billNumber: 'HB100', billStatus: 'introduced', committeeAssignment: 'JDC' },
      [], MOCK_DEADLINES, '2025-03-14');
    expect(e.missedDeadline).not.toBeNull();
    expect(e.summary).toBe(`This bill failed because it was not scheduled for a committee hearing before its ${e.missedDeadline!.name} deadline.`);
    expect(e.missedDeadline!.date).toMatch(/^[A-Z][a-z]+ \d{1,2}, 2025$/);
  });

  it('formats a known deadline date exactly', () => {
    const e = explainDeadBill({ billNumber: 'SB5', billStatus: 'introduced', committeeAssignment: 'AGR, WAM' },
      [], MOCK_DEADLINES, '2025-03-01');
    expect(e.missedDeadline).toEqual({ name: 'First Lateral', date: 'February 27, 2025' });
    expect(e.committeeExplanation).toContain('referred to AGR, WAM but neither chair scheduled it');
  });

  it('closed status: "Where did this bill end up?", no failure wording, no revival note', () => {
    const e = explainDeadBill({ billNumber: 'HB1', billStatus: 'governorSigns', committeeAssignment: 'AGR' },
      [], MOCK_DEADLINES, '2025-06-01');
    expect(e.heading).toBe('Where did this bill end up?');
    expect(e.summary).toBe('This bill completed the legislative process and was signed into law.');
    expect(e.summary).not.toMatch(/fail/i);
    expect(e.showRevivalNote).toBe(false);
  });

  it('no committee assignment: still explains, never "Unknown"', () => {
    const e = explainDeadBill({ billNumber: 'HB9', billStatus: 'introduced', committeeAssignment: null },
      [], MOCK_DEADLINES, '2025-03-14');
    expect(e.summary).toBe('This bill failed because it was not referred to a committee before the First Lateral deadline.');
    expect(e.missedDeadline).toEqual({ name: 'First Lateral', date: 'February 27, 2025' });
    expect(e.committeeExplanation).toBe('This bill has no committee referral on record, so it cannot advance this session.');
    expect(JSON.stringify(e)).not.toContain('Unknown');
  });
});
