import { describe, it, expect } from 'vitest';
import {
  canAssignBills,
  canTrackOwnBills,
  getAssignableRoles,
  canCommitStatus,
} from '../auth/permissions';

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

describe('canCommitStatus', () => {
  it('returns true only for org admin', () => {
    expect(canCommitStatus('admin')).toBe(true);
  });

  it('returns false for worker', () => {
    expect(canCommitStatus('worker')).toBe(false);
  });

  it('returns false when orgRole is undefined', () => {
    expect(canCommitStatus(undefined)).toBe(false);
  });

  it('returns false for an unrelated role string', () => {
    expect(canCommitStatus('supervisor')).toBe(false);
  });
});
