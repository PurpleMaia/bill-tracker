import { describe, it, expect } from 'vitest';
import { deriveOrgSlug, slugCandidate, MAX_SLUG_LENGTH } from '@/lib/tenants/org-slug';

describe('deriveOrgSlug', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(deriveOrgSlug('Hawaii Food Coalition')).toBe('hawaii-food-coalition');
  });

  it('strips punctuation and symbols', () => {
    expect(deriveOrgSlug('Farmers & Ranchers, Inc.')).toBe('farmers-ranchers-inc');
  });

  it('collapses runs of separators into a single hyphen', () => {
    expect(deriveOrgSlug('A   ---   B')).toBe('a-b');
  });

  it('trims leading and trailing hyphens', () => {
    expect(deriveOrgSlug('  -Food-  ')).toBe('food');
  });

  it('returns empty string when nothing slug-able remains', () => {
    expect(deriveOrgSlug('!!!')).toBe('');
    expect(deriveOrgSlug('   ')).toBe('');
  });

  it('caps length at MAX_SLUG_LENGTH', () => {
    const long = 'a'.repeat(80);
    expect(deriveOrgSlug(long)).toHaveLength(MAX_SLUG_LENGTH);
  });
});

describe('slugCandidate', () => {
  it('returns the base slug unchanged for attempt 0', () => {
    expect(slugCandidate('food-coalition', 0)).toBe('food-coalition');
  });

  it('appends -2, -3, ... for later attempts', () => {
    expect(slugCandidate('food-coalition', 1)).toBe('food-coalition-2');
    expect(slugCandidate('food-coalition', 2)).toBe('food-coalition-3');
  });

  it('keeps suffixed candidates within MAX_SLUG_LENGTH', () => {
    const base = 'a'.repeat(MAX_SLUG_LENGTH);
    const candidate = slugCandidate(base, 1);
    expect(candidate.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(candidate.endsWith('-2')).toBe(true);
  });
});
