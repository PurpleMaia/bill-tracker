import { describe, it, expect } from 'vitest';
import {
  normalizeFilters,
  isBillNumberQuery,
  tokenizeSearchQuery,
  chamberPrefixes,
  encodeCursor,
  decodeCursor,
  activeFilterCount,
  filtersToQueryString,
  parseSearchParams,
  DEFAULT_FILTERS,
  LIVE_SESSION_YEARS,
  isUuid,
  resolveSortMode,
  titleSortKey,
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

describe('tokenizeSearchQuery', () => {
  it('splits a query into lowercased whitespace-separated tokens', () => {
    expect(tokenizeSearchQuery('environment agriculture')).toEqual([
      'environment',
      'agriculture',
    ]);
  });

  it('collapses extra whitespace and trims', () => {
    expect(tokenizeSearchQuery('  Environment   Water  ')).toEqual(['environment', 'water']);
  });

  it('returns an empty array for blank input', () => {
    expect(tokenizeSearchQuery('')).toEqual([]);
    expect(tokenizeSearchQuery('   ')).toEqual([]);
  });

  it('strips ILIKE wildcard metacharacters so a token stays a literal substring', () => {
    // %, _ and \ are LIKE metacharacters; a user typing them should not change
    // the match semantics of the substring fallback.
    expect(tokenizeSearchQuery('100%')).toEqual(['100']);
    expect(tokenizeSearchQuery('a_b')).toEqual(['ab']);
    expect(tokenizeSearchQuery('back\\slash')).toEqual(['backslash']);
  });

  it('drops tokens that are empty after metacharacter stripping', () => {
    expect(tokenizeSearchQuery('%% __')).toEqual([]);
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
    const cursor = {
      mode: 'relevance' as const,
      rank: 0.30879,
      updatedAt: '2026-06-29T20:25:47.016Z',
      id: '11111111-1111-1111-1111-111111111111',
    };
    expect(decodeCursor(encodeCursor(cursor), 'relevance')).toEqual(cursor);
  });

  it('returns null for malformed input', () => {
    expect(decodeCursor('not-base64!!', 'relevance')).toBeNull();
    expect(decodeCursor('', 'relevance')).toBeNull();
    expect(decodeCursor('', 'title')).toBeNull();
  });

  const legacy = Buffer.from(JSON.stringify([0.5, '2026-01-01T00:00:00.000Z', '11111111-1111-1111-1111-111111111111'])).toString(
    'base64url',
  );

  it('legacy 3-tuple decodes as relevance', () => {
    expect(decodeCursor(legacy, 'relevance')).toEqual({
      mode: 'relevance',
      rank: 0.5,
      updatedAt: '2026-01-01T00:00:00.000Z',
      id: '11111111-1111-1111-1111-111111111111',
    });
  });

  it('rejects legacy 3-tuple cursor in title mode', () => {
    expect(decodeCursor(legacy, 'title')).toBeNull();
  });

  it('rejects a relevance cursor in title mode', () => {
    const c = encodeCursor({ mode: 'relevance', rank: 1, updatedAt: '2026-01-01T00:00:00.000Z', id: '11111111-1111-1111-1111-111111111111' });
    expect(decodeCursor(c, 'title')).toBeNull();
  });

  it('round-trips a title cursor and rejects it in relevance mode', () => {
    const c = { mode: 'title' as const, key: 'farm bill', id: '11111111-1111-1111-1111-111111111111' };
    const enc = encodeCursor(c);
    expect(decodeCursor(enc, 'title')).toEqual(c);
    expect(decodeCursor(enc, 'relevance')).toBeNull();
  });

  it('rejects a cursor whose id is not a uuid', () => {
    const t = encodeCursor({ mode: 'title', key: 'k', id: 'not-a-uuid' });
    expect(decodeCursor(t, 'title')).toBeNull();
    const r = encodeCursor({ mode: 'relevance', rank: 1, updatedAt: '2026-01-01T00:00:00.000Z', id: 'not-a-uuid' });
    expect(decodeCursor(r, 'relevance')).toBeNull();
  });

  it('rejects a relevance cursor with an invalid updatedAt', () => {
    const r = encodeCursor({ mode: 'relevance', rank: 1, updatedAt: 'garbage', id: '11111111-1111-1111-1111-111111111111' });
    expect(decodeCursor(r, 'relevance')).toBeNull();
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

const U1 = '123e4567-e89b-12d3-a456-426614174000';
const U2 = 'ABCDEF01-2345-6789-ABCD-EF0123456789';

describe('isUuid', () => {
  it('accepts canonical uuids in any case', () => {
    expect(isUuid(U1)).toBe(true);
    expect(isUuid(U2)).toBe(true);
  });
  it('rejects others', () => {
    expect(isUuid('abc')).toBe(false);
    expect(isUuid('1;drop')).toBe(false);
    expect(isUuid(U1 + 'x')).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});

describe('LIVE_SESSION_YEARS', () => {
  it('is [2027, 2026] and backs DEFAULT_FILTERS.years', () => {
    expect(LIVE_SESSION_YEARS).toEqual([2027, 2026]);
    expect(DEFAULT_FILTERS.years).toEqual(LIVE_SESSION_YEARS);
  });
});

describe('resolveSortMode', () => {
  const base = { q: '', introducerId: null, chairId: null, sort: 'auto' as const };
  it('explicit choice always wins', () => {
    expect(resolveSortMode({ ...base, sort: 'title' })).toBe('title');
    expect(resolveSortMode({ ...base, sort: 'relevance', introducerId: U1 })).toBe('relevance');
  });
  it('auto + legislator filter + empty q is title', () => {
    expect(resolveSortMode({ ...base, introducerId: U1 })).toBe('title');
    expect(resolveSortMode({ ...base, chairId: U1 })).toBe('title');
  });
  it('auto + legislator filter + q is relevance', () => {
    expect(resolveSortMode({ ...base, introducerId: U1, q: 'food' })).toBe('relevance');
  });
  it('auto without legislator filter is relevance', () => {
    expect(resolveSortMode(base)).toBe('relevance');
  });
});

describe('titleSortKey', () => {
  it('uses lowercased trimmed title, else bill number', () => {
    expect(titleSortKey('  ', 'HB12')).toBe('hb12');
    expect(titleSortKey(null, 'SB3')).toBe('sb3');
    expect(titleSortKey('Farm Bill', 'HB1')).toBe('farm bill');
    expect(titleSortKey(null, null)).toBe('');
  });
});

describe('legislator filters and sort in URL + count', () => {
  it('round-trips introducerId, chairId, sort', () => {
    const f = { ...DEFAULT_FILTERS, introducerId: U1, chairId: U2, sort: 'title' as const };
    const parsed = parseSearchParams(new URLSearchParams(filtersToQueryString(f)));
    expect(parsed.introducerId).toBe(U1);
    expect(parsed.chairId).toBe(U2);
    expect(parsed.sort).toBe('title');
  });
  it('omits null ids and auto sort from the query string', () => {
    const qs = filtersToQueryString(DEFAULT_FILTERS);
    expect(qs).not.toMatch(/introducer|chair|sort/);
  });
  it('drops non-uuid introducer/chair ids', () => {
    const p = parseSearchParams(new URLSearchParams('introducer=abc&chair=1;drop'));
    expect(p.introducerId).toBeNull();
    expect(p.chairId).toBeNull();
  });
  it('counts introducer and chair once each; sort does not count', () => {
    expect(activeFilterCount({ ...DEFAULT_FILTERS, introducerId: U1 })).toBe(1);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, introducerId: U1, chairId: U2 })).toBe(2);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, sort: 'title' })).toBe(0);
  });
});
