import { describe, it, expect } from 'vitest';
import {
  normalizeFilters,
  isBillNumberQuery,
  chamberPrefixes,
  encodeCursor,
  decodeCursor,
  activeFilterCount,
  filtersToQueryString,
  parseSearchParams,
  DEFAULT_FILTERS,
  type SearchFilters,
} from '@/lib/bills/search-params';

describe('isBillNumberQuery', () => {
  it('detects bill numbers in common shapes', () => {
    expect(isBillNumberQuery('hb20')).toBe(true);
    expect(isBillNumberQuery('HB 20')).toBe(true);
    expect(isBillNumberQuery('sb-1251')).toBe(true);
    expect(isBillNumberQuery('  SB1251  ')).toBe(true);
    expect(isBillNumberQuery('hcr5')).toBe(true);
    expect(isBillNumberQuery('hb2')).toBe(true);
  });

  it('rejects ordinary word queries', () => {
    expect(isBillNumberQuery('housing')).toBe(false);
    expect(isBillNumberQuery('agriculture')).toBe(false);
    expect(isBillNumberQuery('')).toBe(false);
    // "sb" alone has no digits, so it is a word query, not a number lookup
    expect(isBillNumberQuery('sb')).toBe(false);
  });
});

describe('chamberPrefixes', () => {
  it('maps chambers to bill_number prefixes', () => {
    expect(chamberPrefixes(['house'])).toEqual(['H']);
    expect(chamberPrefixes(['senate'])).toEqual(['S']);
    expect(chamberPrefixes(['house', 'senate']).sort()).toEqual(['H', 'S']);
    expect(chamberPrefixes([])).toEqual([]);
  });
});

describe('normalizeFilters', () => {
  it('produces a stable key regardless of array order', () => {
    const a = normalizeFilters({ ...DEFAULT_FILTERS, years: [2025, 2026] });
    const b = normalizeFilters({ ...DEFAULT_FILTERS, years: [2026, 2025] });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('trims and lowercases the query', () => {
    expect(normalizeFilters({ ...DEFAULT_FILTERS, q: '  Agriculture  ' }).q).toBe('agriculture');
  });

  it('sorts chambers and stages', () => {
    const n = normalizeFilters({
      ...DEFAULT_FILTERS,
      chambers: ['senate', 'house'],
      stages: ['simpleScheduled', 'simpleWaiting'],
    });
    expect(n.chambers).toEqual(['house', 'senate']);
    expect(n.stages).toEqual(['simpleScheduled', 'simpleWaiting']);
  });

  it('defaults to the 2027 sim + 2026 live sessions', () => {
    expect(DEFAULT_FILTERS.years).toEqual([2027, 2026]);
    expect(DEFAULT_FILTERS.deadFilter).toBe('all');
  });

  it('defaults trackedFilter to all and preserves it', () => {
    expect(DEFAULT_FILTERS.trackedFilter).toBe('all');
    expect(normalizeFilters({ ...DEFAULT_FILTERS, trackedFilter: 'tracked' }).trackedFilter).toBe(
      'tracked',
    );
    expect(
      normalizeFilters({ ...DEFAULT_FILTERS, trackedFilter: 'untracked' }).trackedFilter,
    ).toBe('untracked');
  });
});

describe('cursor codec', () => {
  it('round-trips a cursor', () => {
    const cursor = { rank: 0.30879, updatedAt: '2026-06-29T20:25:47.016Z', id: 'abc-123' };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('returns null for malformed input', () => {
    expect(decodeCursor('not-base64!!')).toBeNull();
    expect(decodeCursor('')).toBeNull();
  });
});

describe('activeFilterCount', () => {
  it('does not count defaults', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
  });

  it('counts each non-default group once', () => {
    const filters: SearchFilters = {
      ...DEFAULT_FILTERS,
      years: [2025, 2026],
      chambers: ['house'],
      deadFilter: 'alive',
    };
    expect(activeFilterCount(filters)).toBe(3);
  });

  it('counts a non-default trackedFilter', () => {
    expect(activeFilterCount({ ...DEFAULT_FILTERS, trackedFilter: 'tracked' })).toBe(1);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, trackedFilter: 'untracked' })).toBe(1);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, trackedFilter: 'all' })).toBe(0);
  });
});

describe('trackedFilter query-string round-trip', () => {
  it('omits the default and serializes non-defaults', () => {
    expect(filtersToQueryString(DEFAULT_FILTERS)).not.toContain('tracked=');
    expect(filtersToQueryString({ ...DEFAULT_FILTERS, trackedFilter: 'tracked' })).toContain(
      'tracked=tracked',
    );
    expect(filtersToQueryString({ ...DEFAULT_FILTERS, trackedFilter: 'untracked' })).toContain(
      'tracked=untracked',
    );
  });

  it('parses back to the same value, falling back to all', () => {
    const parse = (qs: string) => parseSearchParams(new URLSearchParams(qs)).trackedFilter;
    expect(parse('tracked=tracked')).toBe('tracked');
    expect(parse('tracked=untracked')).toBe('untracked');
    expect(parse('')).toBe('all');
    expect(parse('tracked=bogus')).toBe('all');
  });
});
