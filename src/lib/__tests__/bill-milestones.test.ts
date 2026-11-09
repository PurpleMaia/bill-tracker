import { describe, it, expect } from 'vitest';
import {
  classifyUpdate,
  extractMilestones,
  groupByDay,
  milestonesInMonth,
  toIsoDay,
  formatClockTime,
  type MilestoneBill,
} from '../calendar/bill-milestones';

const bill: MilestoneBill = {
  id: 'b1',
  bill_number: 'HB100',
  bill_title: 'Relating to Farms',
  nickname: null,
  dead: false,
};

const HEARING = 'The committee(s) on AGR has scheduled a public hearing on 01-15-26 9:00AM in room 325.';

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
  it('detects each text-matched milestone type', () => {
    expect(classifyUpdate('Passed Third Reading. Transmitted to Senate.')).toBe('crossover');
    expect(classifyUpdate('House Conferees Appointed: Sayama')).toBe('conference');
    expect(classifyUpdate('The conference committee will be scheduled.')).toBe('conference');
    expect(classifyUpdate('Transmitted to Governor.')).toBe('governor');
    expect(classifyUpdate('Act 12, 05/01/2026 (Gov. Msg. No. 1).')).toBe('governor');
  });
  it('does not treat transmission to the Governor as a crossover', () => {
    expect(classifyUpdate('Transmitted to Governor.')).not.toBe('crossover');
  });
  it('no longer treats introduction as a milestone', () => {
    expect(classifyUpdate('Introduced.')).toBeNull();
  });
  it('returns null for ordinary actions', () => {
    expect(classifyUpdate('Referred to AGR, FIN.')).toBeNull();
    expect(classifyUpdate('Passed First Reading.')).toBeNull();
  });
});

describe('extractMilestones', () => {
  it('reports crossover once at its earliest date, sorted by date', () => {
    const result = extractMilestones(bill, [
      { date: '2026-03-12', statustext: 'Transmitted to Senate.' },
      { date: '2026-03-10', statustext: 'Passed Third Reading. Transmitted to Senate.' },
      { date: '2026-04-02', statustext: 'House Conferees Appointed: Sayama' },
    ]);
    expect(result.map((m) => [m.type, m.date])).toEqual([
      ['crossover', '2026-03-10'],
      ['conference', '2026-04-02'],
    ]);
  });

  it('prefers the nickname as the display title', () => {
    const [m] = extractMilestones({ ...bill, nickname: 'Farm Bill' }, [
      { date: '2026-03-10', statustext: 'Transmitted to Senate.' },
    ]);
    expect(m.billTitle).toBe('Farm Bill');
  });

  it('marks dead bills failed at the permanent deferral', () => {
    const result = extractMilestones({ ...bill, dead: true }, [
      { date: '2026-01-20', statustext: 'Referred to AGR.' },
      { date: '2026-02-20', statustext: 'The committee(s) on AGR recommend that the measure be deferred.' },
    ]);
    const failed = result.find((m) => m.type === 'failed');
    expect(failed?.date).toBe('2026-02-20');
  });

  it('falls back to the last action when a dead bill has no deferral', () => {
    const result = extractMilestones({ ...bill, dead: true }, [
      { date: '2026-01-20', statustext: 'Referred to HHS.' },
      { date: '2026-02-05', statustext: 'Referred to AGR.' },
    ]);
    expect(result.find((m) => m.type === 'failed')?.date).toBe('2026-02-05');
  });

  it('never marks a live bill failed', () => {
    const result = extractMilestones(bill, [{ date: '2026-01-20', statustext: 'Referred to AGR.' }]);
    expect(result.some((m) => m.type === 'failed')).toBe(false);
  });

  it('ignores updates with unparseable dates', () => {
    expect(extractMilestones(bill, [{ date: 'bad', statustext: 'Transmitted to Senate.' }])).toEqual([]);
  });
});

describe('formatClockTime', () => {
  it('uses a 12-hour clock with AM/PM', () => {
    expect(formatClockTime(new Date(2026, 0, 15, 9, 0))).toBe('9:00 AM');
    expect(formatClockTime(new Date(2026, 0, 15, 15, 5))).toBe('3:05 PM');
  });
  it('handles noon and midnight', () => {
    expect(formatClockTime(new Date(2026, 0, 15, 12, 30))).toBe('12:30 PM');
    expect(formatClockTime(new Date(2026, 0, 15, 0, 15))).toBe('12:15 AM');
  });
});

describe('testimony milestone', () => {
  it('carries the hearing time, and other milestones carry none', () => {
    const result = extractMilestones(bill, [
      { date: '2026-01-10', statustext: HEARING },
      { date: '2026-03-10', statustext: 'Transmitted to Senate.' },
    ]);
    expect(result.find((m) => m.type === 'testimony')?.time).toBe('9:00 AM');
    expect(result.find((m) => m.type === 'crossover')?.time).toBeNull();
  });

  it('uses the time from the latest notice when a hearing is rescheduled', () => {
    const result = extractMilestones(bill, [
      { date: '2026-01-10', statustext: HEARING },
      {
        date: '2026-01-20',
        statustext: 'The committee(s) on AGR has scheduled a public hearing on 01-27-26 2:00PM in room 325.',
      },
    ]);
    expect(result.find((m) => m.type === 'testimony')?.time).toBe('2:00 PM');
  });

  it('is dated at the hearing, not at the day the notice was posted', () => {
    const result = extractMilestones(bill, [{ date: '2026-01-10', statustext: HEARING }]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('testimony');
    expect(result[0].date).toBe('2026-01-15');
    expect(result[0].detail).toBe(HEARING);
  });

  it('follows the most recent notice when a hearing is rescheduled', () => {
    const result = extractMilestones(bill, [
      { date: '2026-01-10', statustext: HEARING },
      {
        date: '2026-01-20',
        statustext: 'The committee(s) on AGR has scheduled a public hearing on 01-27-26 2:00PM in room 325.',
      },
    ]);
    expect(result.find((m) => m.type === 'testimony')?.date).toBe('2026-01-27');
  });

  it('reports one testimony milestone per bill even with several notices', () => {
    const result = extractMilestones(bill, [
      { date: '2026-01-10', statustext: HEARING },
      { date: '2026-02-10', statustext: 'Bill scheduled to be heard by FIN on Friday, 02-20-26 10:00AM in room 308.' },
    ]);
    expect(result.filter((m) => m.type === 'testimony')).toHaveLength(1);
  });

  it('ignores an action that mentions a time but is not a hearing notice', () => {
    const result = extractMilestones(bill, [
      { date: '2026-01-10', statustext: 'Reconvened 01-15-26 9:00AM.' },
    ]);
    expect(result.some((m) => m.type === 'testimony')).toBe(false);
  });

  it('is absent when no hearing has been scheduled', () => {
    const result = extractMilestones(bill, [{ date: '2026-01-10', statustext: 'Referred to AGR.' }]);
    expect(result.some((m) => m.type === 'testimony')).toBe(false);
  });

  it('sorts alongside the other milestones by date', () => {
    const result = extractMilestones(bill, [
      { date: '2026-01-10', statustext: HEARING },
      { date: '2026-03-10', statustext: 'Transmitted to Senate.' },
    ]);
    expect(result.map((m) => m.type)).toEqual(['testimony', 'crossover']);
  });
});

describe('groupByDay / milestonesInMonth', () => {
  const ms = extractMilestones(bill, [
    { date: '2026-01-10', statustext: HEARING },
    { date: '2026-03-10', statustext: 'Transmitted to Senate.' },
  ]);
  it('groups by day', () => {
    expect(groupByDay(ms).get('2026-01-15')).toHaveLength(1);
    expect(groupByDay(ms).get('2026-01-16')).toBeUndefined();
  });
  it('filters by month key', () => {
    expect(milestonesInMonth(ms, '2026-03').map((m) => m.type)).toEqual(['crossover']);
  });
});
