import { describe, it, expect } from 'vitest';
import { toDate, formatBillStatusName, canAssignBills, canTrackOwnBills, getAssignableRoles } from '../utils';

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

describe('canAssignBills', () => {
  it('returns true for admin', () => {
    expect(canAssignBills({ role: 'admin' })).toBe(true);
  });

  it('returns true for supervisor', () => {
    expect(canAssignBills({ role: 'supervisor' })).toBe(true);
  });

  it('returns false for user', () => {
    expect(canAssignBills({ role: 'user' })).toBe(false);
  });

  it('returns false for intern', () => {
    expect(canAssignBills({ role: 'intern' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(canAssignBills(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(canAssignBills(undefined)).toBe(false);
  });

  it('returns true for org admin even if legacy role is user', () => {
    expect(canAssignBills({ role: 'user' }, 'admin')).toBe(true);
  });

  it('returns false for org worker with legacy role user', () => {
    expect(canAssignBills({ role: 'user' }, 'worker')).toBe(false);
  });

  it('returns true for legacy admin even without orgRole', () => {
    expect(canAssignBills({ role: 'admin' }, undefined)).toBe(true);
  });
});

describe('canTrackOwnBills', () => {
  it('returns true for admin', () => {
    expect(canTrackOwnBills({ role: 'admin' })).toBe(true);
  });

  it('returns true for supervisor', () => {
    expect(canTrackOwnBills({ role: 'supervisor' })).toBe(true);
  });

  it('returns true for user', () => {
    expect(canTrackOwnBills({ role: 'user' })).toBe(true);
  });

  it('returns false for intern', () => {
    expect(canTrackOwnBills({ role: 'intern' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(canTrackOwnBills(null)).toBe(false);
  });
});

describe('getAssignableRoles', () => {
  it('admin can assign to intern and supervisor', () => {
    expect(getAssignableRoles('admin')).toEqual(['intern', 'supervisor']);
  });

  it('supervisor can only assign to intern', () => {
    expect(getAssignableRoles('supervisor')).toEqual(['intern']);
  });

  it('user cannot assign to anyone', () => {
    expect(getAssignableRoles('user')).toEqual([]);
  });

  it('intern cannot assign to anyone', () => {
    expect(getAssignableRoles('intern')).toEqual([]);
  });
});
