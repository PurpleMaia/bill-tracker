import { describe, it, expect } from 'vitest';
import { buildReadingSteps, type ReadingInput } from '../bills/bill-reading-steps';

const base: ReadingInput = {
  billNumber: 'HB100',
  billTitle: 'RELATING TO FARMS',
  introducer: 'SAYAMA',
  committeeAssignment: 'AGR, FIN',
  latestVersionLabel: 'HB100_HD1',
  currentStatus: 'scheduled1',
  deadlineName: null,
  dead: false,
  committeeNames: { AGR: 'Agriculture', FIN: 'Finance' },
};

const ids = (input: ReadingInput) => buildReadingSteps(input).map((s) => s.id);

describe('buildReadingSteps', () => {
  it('always starts with the bill number, explained by chamber', () => {
    const [first] = buildReadingSteps(base);
    expect(first.id).toBe('number');
    expect(first.value).toBe('HB100');
    expect(first.explanation).toContain('House bill');
    expect(buildReadingSteps({ ...base, billNumber: 'SB5' })[0].explanation).toContain('Senate bill');
  });

  it('includes the parts a full bill has, in reading order', () => {
    expect(ids(base)).toEqual([
      'number',
      'title',
      'introducer',
      'committees',
      'version',
      'status',
      'stage',
    ]);
  });

  it('omits parts the bill does not have', () => {
    const sparse = buildReadingSteps({
      ...base,
      billTitle: null,
      introducer: null,
      committeeAssignment: null,
      latestVersionLabel: null,
    });
    expect(sparse.map((s) => s.id)).toEqual(['number', 'status', 'stage']);
  });

  it('uses the real committee values and counts the ones to clear', () => {
    const committees = buildReadingSteps(base).find((s) => s.id === 'committees')!;
    expect(committees.value).toBe('AGR, FIN');
    expect(committees.explanation).toContain('must clear all 2');
  });

  it('drops the stage step for a failed bill', () => {
    expect(ids({ ...base, dead: true })).not.toContain('stage');
  });

  it('adds a deadline step only when the deadline has a definition', () => {
    expect(ids({ ...base, deadlineName: 'First Decking' })).toContain('deadline');
    expect(ids({ ...base, deadlineName: 'Not A Real Deadline' })).not.toContain('deadline');
  });

  it('gives every step a non-empty value and explanation', () => {
    for (const step of buildReadingSteps({ ...base, deadlineName: 'First Decking' })) {
      expect(step.value.length).toBeGreaterThan(0);
      expect(step.explanation.length).toBeGreaterThan(0);
    }
  });
});
