import { describe, it, expect } from 'vitest';
import { currentCommitteeForYear } from '@/lib/bills/current-committee-for-year';

describe('currentCommitteeForYear', () => {
  it('keeps the step for live session years', () => {
    expect(currentCommitteeForYear(2026, ['AEN'])).toEqual(['AEN']);
    expect(currentCommitteeForYear(2027, ['WLA', 'EIG'])).toEqual(['WLA', 'EIG']);
  });
  it('returns null for past years and unknown year', () => {
    expect(currentCommitteeForYear(2025, ['AEN'])).toBeNull();
    expect(currentCommitteeForYear(null, ['AEN'])).toBeNull();
  });
  it('passes a null step through', () => {
    expect(currentCommitteeForYear(2026, null)).toBeNull();
  });
});
