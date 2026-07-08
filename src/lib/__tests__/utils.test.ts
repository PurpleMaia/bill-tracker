import { describe, it, expect } from 'vitest';
import { toDate, formatBillStatusName, todayHawaii } from '../utils';

describe('toDate', () => {
  it('returns null for null/undefined', () => {
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(toDate('')).toBeNull();
  });

  it('returns the same Date if given a Date', () => {
    const d = new Date('2025-01-15');
    expect(toDate(d)).toBe(d);
  });

  it('parses a valid ISO string', () => {
    const result = toDate('2025-01-15T00:00:00Z');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2025);
  });

  it('parses a numeric timestamp', () => {
    const ts = new Date('2025-06-01').getTime();
    const result = toDate(ts);
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBe(ts);
  });

  it('returns null for invalid date string', () => {
    expect(toDate('not-a-date')).toBeNull();
  });

  it('returns null for objects that are not Date', () => {
    expect(toDate({})).toBeNull();
    expect(toDate([])).toBeNull();
  });

  it('returns null for 0 (falsy number)', () => {
    expect(toDate(0)).toBeNull();
  });
});

describe('formatBillStatusName', () => {
  it('returns "No Assigned Status" for null', () => {
    expect(formatBillStatusName(null)).toBe('No Assigned Status');
  });

  it('formats introduced status', () => {
    expect(formatBillStatusName('introduced')).toBe('Introduced');
  });

  it('formats waiting status', () => {
    expect(formatBillStatusName('waiting2')).toBe('Waiting');
  });

  it('formats scheduled status', () => {
    expect(formatBillStatusName('scheduled1')).toBe('Scheduled');
  });

  it('formats passed status', () => {
    expect(formatBillStatusName('passedCommittees')).toBe('Passed');
  });

  it('formats unassigned as N/A', () => {
    expect(formatBillStatusName('unassigned')).toBe('N/A');
  });

  it('formats transmitted status', () => {
    expect(formatBillStatusName('transmittedGovernor')).toBe('Transmitted');
  });

  it('formats veto status', () => {
    expect(formatBillStatusName('vetoList')).toBe('Vetoed');
  });

  it('formats governor signs as Became Law', () => {
    expect(formatBillStatusName('governorSigns')).toBe('Became Law');
  });

  it('formats law without signature as Became Law', () => {
    expect(formatBillStatusName('lawWithoutSignature')).toBe('Became Law');
  });

  it('is case-insensitive', () => {
    expect(formatBillStatusName('INTRODUCED')).toBe('Introduced');
  });
});

describe('todayHawaii', () => {
  it('returns YYYY-MM-DD format', () => {
    expect(todayHawaii()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('matches the UTC date when both are on the same day', () => {
    // 08:00 UTC = 22:00 HST the previous day — dates differ
    // 20:00 UTC = 10:00 HST the same day — dates match
    expect(todayHawaii(new Date('2026-07-07T20:00:00Z'))).toBe('2026-07-07');
  });

  it('stays on the previous day when UTC has rolled over', () => {
    // 2026-07-08 02:00 UTC is still 2026-07-07 16:00 in Hawaii.
    // toISOString() would say 2026-07-08 — the bug this helper fixes.
    expect(todayHawaii(new Date('2026-07-08T02:00:00Z'))).toBe('2026-07-07');
  });

  it('rolls to the next Hawaii day at 10:00 UTC', () => {
    expect(todayHawaii(new Date('2026-07-08T09:59:00Z'))).toBe('2026-07-07');
    expect(todayHawaii(new Date('2026-07-08T10:00:00Z'))).toBe('2026-07-08');
  });
});
