import { describe, it, expect } from 'vitest';
import { shouldOpenInterestPicker } from '@/lib/recommendations/interest-picker';

const base = {
  signedIn: true,
  preferences: { onboarded_at: null as string | null },
  tourRunning: false,
};

describe('shouldOpenInterestPicker', () => {
  it('opens for a signed-in, not-onboarded user with no tour running', () => {
    expect(shouldOpenInterestPicker(base)).toBe(true);
  });
  it('stays closed when signed out', () => {
    expect(shouldOpenInterestPicker({ ...base, signedIn: false })).toBe(false);
  });
  it('stays closed when preferences have not loaded', () => {
    expect(shouldOpenInterestPicker({ ...base, preferences: null })).toBe(false);
  });
  it('stays closed once onboarded', () => {
    expect(
      shouldOpenInterestPicker({ ...base, preferences: { onboarded_at: '2026-01-01T00:00:00Z' } }),
    ).toBe(false);
  });
  it('stays closed while the tour is running', () => {
    expect(shouldOpenInterestPicker({ ...base, tourRunning: true })).toBe(false);
  });
});
