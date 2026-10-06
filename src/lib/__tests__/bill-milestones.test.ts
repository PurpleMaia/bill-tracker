import { describe, it, expect } from 'vitest';
import {
  classifyUpdate,
  extractMilestones,
  groupByDay,
  milestonesInMonth,
  toIsoDay,
  type MilestoneBill,
} from '../calendar/bill-milestones';

const bill: MilestoneBill = {
  id: 'b1',
  bill_number: 'HB100',
  bill_title: 'Relating to Farms',
  nickname: null,
  dead: false,
};

describe('toIsoDay', () => {
  it('slices ISO dates without timezone shifting', () => {
    expect(toIsoDay('2026-02-12')).toBe('2026-02-12');
    expect(toIsoDay('2026-02-12T00:00:00.000Z')).toBe('2026-02-12');
  });
  it('parses M/D/YYYY', () => {
    expect(toIsoDay('2/5/2026')).toBe('2026-02-05');
  });
  it('returns null for junk and empty values', () => {
    expect(toIsoDay('not a date')).toBeNull();
    expect(toIsoDay(null)).toBeNull();
    expect(toIsoDay('')).toBeNull();
  });
});

describe('classifyUpdate', () => {
  it('detects each milestone type', () => {
    expect(classifyUpdate('Introduced.')).toBe('introduced');
    expect(classifyUpdate('Passed Third Reading. Transmitted to Senate.')).toBe('crossover');
    expect(classifyUpdate('House Conferees Appointed: Sayama')).toBe('conference');
    expect(classifyUpdate('The conference committee will be scheduled.')).toBe('conference');
    expect(classifyUpdate('Transmitted to Governor.')).toBe('governor');
    expect(classifyUpdate('Act 12, 05/01/2026 (Gov. Msg. No. 1).')).toBe('governor');
  });
  it('does not treat transmission to the Governor as a crossover', () => {
    expect(classifyUpdate('Transmitted to Governor.')).not.toBe('crossover');
  });
  it('returns null for ordinary actions', () => {
    expect(classifyUpdate('Referred to AGR, FIN.')).toBeNull();
    expect(classifyUpdate('Passed First Reading.')).toBeNull();
  });
});

describe('extractMilestones', () => {
  it('reports each type once at its earliest date, sorted by date', () => {
    const result = extractMilestones(bill, [
      { date: '2026-03-10', statustext: 'Passed Third Reading. Transmitted to Senate.' },
      { date: '2026-01-20', statustext: 'Introduced.' },
      { date: '2026-03-12', statustext: 'Transmitted to Senate.' },
      { date: '2026-02-01', statustext: 'Referred to AGR.' },
    ]);
    expect(result.map((m) => [m.type, m.date])).toEqual([
      ['introduced', '2026-01-20'],
      ['crossover', '2026-03-10'],
    ]);
  });

  it('prefers the nickname as the display title', () => {
    const [m] = extractMilestones({ ...bill, nickname: 'Farm Bill' }, [
      { date: '2026-01-20', statustext: 'Introduced.' },
    ]);
    expect(m.billTitle).toBe('Farm Bill');
  });

  it('marks dead bills failed at the permanent deferral', () => {
    const result = extractMilestones({ ...bill, dead: true }, [
      { date: '2026-01-20', statustext: 'Introduced.' },
      { date: '2026-02-20', statustext: 'The committee(s) on AGR recommend that the measure be deferred.' },
    ]);
    const failed = result.find((m) => m.type === 'failed');
    expect(failed?.date).toBe('2026-02-20');
  });

  it('falls back to the last action when a dead bill has no deferral', () => {
    const result = extractMilestones({ ...bill, dead: true }, [
      { date: '2026-01-20', statustext: 'Introduced.' },
      { date: '2026-02-05', statustext: 'Referred to AGR.' },
    ]);
    expect(result.find((m) => m.type === 'failed')?.date).toBe('2026-02-05');
  });

  it('never marks a live bill failed', () => {
    const result = extractMilestones(bill, [{ date: '2026-01-20', statustext: 'Introduced.' }]);
    expect(result.some((m) => m.type === 'failed')).toBe(false);
  });

  it('ignores updates with unparseable dates', () => {
    expect(extractMilestones(bill, [{ date: 'bad', statustext: 'Introduced.' }])).toEqual([]);
  });
});

describe('groupByDay / milestonesInMonth', () => {
  const ms = extractMilestones(bill, [
    { date: '2026-01-20', statustext: 'Introduced.' },
    { date: '2026-03-10', statustext: 'Transmitted to Senate.' },
  ]);
  it('groups by day', () => {
    expect(groupByDay(ms).get('2026-01-20')).toHaveLength(1);
    expect(groupByDay(ms).get('2026-01-21')).toBeUndefined();
  });
  it('filters by month key', () => {
    expect(milestonesInMonth(ms, '2026-03').map((m) => m.type)).toEqual(['crossover']);
  });
});
