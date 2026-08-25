/**
 * Pure filter/param logic for the bill search page. No DB access — safe for
 * src/lib per project convention. Shared by the API route, the server action,
 * and the client hook so the three can never disagree about what a filter set
 * means or how a cursor is encoded.
 */

export type DeadFilter = 'all' | 'alive' | 'dead';
export type Chamber = 'house' | 'senate';
/** 'tracked'/'untracked' are user-scoped and only meaningful when logged in. */
export type TrackedFilter = 'all' | 'tracked' | 'untracked';

export interface SearchFilters {
  q: string;
  years: number[];
  chambers: Chamber[];
  stages: string[];
  deadFilter: DeadFilter;
  trackedFilter: TrackedFilter;
}

/**
 * 2026 is the live session. Defaulting here (rather than to all 6,126 bills)
 * keeps the first screen relevant; 93% of the corpus is dead and all of 2025
 * is archived.
 */
export const DEFAULT_FILTERS: SearchFilters = {
  q: '',
  years: [2026],
  chambers: [],
  stages: [],
  deadFilter: 'all',
  trackedFilter: 'all',
};

export const SEARCH_PAGE_SIZE = 40;

/**
 * True when the query looks like a bill number (HB20, SB 1251, HCR-5).
 * Requires at least one digit, so a bare "sb" stays a word query.
 */
export function isBillNumberQuery(q: string): boolean {
  return /^[hs][bcrm]?[cr]?\s*-?\s*\d+/i.test(q.trim());
}

/** House bills start with H, Senate with S — derived, not stored. */
export function chamberPrefixes(chambers: Chamber[]): string[] {
  return chambers.map((c) => (c === 'house' ? 'H' : 'S'));
}

/**
 * Canonical form of a filter set. Sorting arrays and trimming the query is what
 * makes the React Query cache key stable — without it [2025,2026] and
 * [2026,2025] would be cache misses of each other.
 */
export function normalizeFilters(filters: SearchFilters): SearchFilters {
  return {
    q: filters.q.trim().toLowerCase(),
    years: [...filters.years].sort((a, b) => a - b),
    chambers: [...filters.chambers].sort(),
    stages: [...filters.stages].sort(),
    deadFilter: filters.deadFilter,
    trackedFilter: filters.trackedFilter,
  };
}

/** Number of filter groups differing from the default — drives the mobile badge. */
export function activeFilterCount(filters: SearchFilters): number {
  let count = 0;
  const years = [...filters.years].sort((a, b) => a - b);
  const defaultYears = [...DEFAULT_FILTERS.years].sort((a, b) => a - b);
  if (JSON.stringify(years) !== JSON.stringify(defaultYears)) count++;
  if (filters.chambers.length > 0) count++;
  if (filters.stages.length > 0) count++;
  if (filters.deadFilter !== DEFAULT_FILTERS.deadFilter) count++;
  if (filters.trackedFilter !== DEFAULT_FILTERS.trackedFilter) count++;
  return count;
}

export interface SearchCursor {
  rank: number;
  updatedAt: string;
  id: string;
}

/** Keyset cursor. Base64 keeps it opaque and URL-safe. */
export function encodeCursor(cursor: SearchCursor): string {
  const json = JSON.stringify([cursor.rank, cursor.updatedAt, cursor.id]);
  return Buffer.from(json, 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): SearchCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 3) return null;
    const [rank, updatedAt, id] = parsed;
    if (typeof rank !== 'number' || typeof updatedAt !== 'string' || typeof id !== 'string') {
      return null;
    }
    return { rank, updatedAt, id };
  } catch {
    return null;
  }
}

/** Serializes filters for the fetch arm's query string. */
export function filtersToQueryString(
  filters: SearchFilters,
  cursor?: string | null,
): string {
  const n = normalizeFilters(filters);
  const qs = new URLSearchParams();
  if (n.q) qs.set('q', n.q);
  if (n.years.length) qs.set('years', n.years.join(','));
  if (n.chambers.length) qs.set('chambers', n.chambers.join(','));
  if (n.stages.length) qs.set('stages', n.stages.join(','));
  if (n.deadFilter !== 'all') qs.set('dead', n.deadFilter);
  if (n.trackedFilter !== 'all') qs.set('tracked', n.trackedFilter);
  if (cursor) qs.set('cursor', cursor);
  return qs.toString();
}

/** Parses a query string back into filters. Unknown values fall back to defaults. */
export function parseSearchParams(params: URLSearchParams): SearchFilters {
  const years = (params.get('years') ?? '')
    .split(',')
    .map((y) => parseInt(y, 10))
    .filter((y) => Number.isFinite(y));
  const chambers = (params.get('chambers') ?? '')
    .split(',')
    .filter((c): c is Chamber => c === 'house' || c === 'senate');
  const stages = (params.get('stages') ?? '').split(',').filter(Boolean);
  const dead = params.get('dead');
  const tracked = params.get('tracked');

  return {
    q: params.get('q') ?? '',
    years: years.length ? years : [],
    chambers,
    stages,
    deadFilter: dead === 'alive' || dead === 'dead' ? dead : 'all',
    trackedFilter: tracked === 'tracked' || tracked === 'untracked' ? tracked : 'all',
  };
}
