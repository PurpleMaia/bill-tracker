import { describe, it, expect } from 'vitest';
import fixture from './fixtures/legislator-links.json';
import { normalizeName, resolveIntroducers } from '@/lib/legislators/introducer-links';

describe('normalizeName', () => {
  it('strips okina, macrons and case', () => {
    expect(normalizeName('Kaʻāpuni')).toBe('kaapuni');
  });
  it('collapses whitespace and removes apostrophes', () => {
    expect(normalizeName("  San   O’Brien ")).toBe('san obrien');
  });
});

describe('resolveIntroducers (shared fixture)', () => {
  for (const c of fixture.introducers) {
    it(c.name, () => {
      expect(resolveIntroducers(c.introducer, c.billNumber, fixture.legislators)).toEqual(c.expected);
    });
  }
});
