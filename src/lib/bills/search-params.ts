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

/** Sessions treated as live. Single source for DEFAULT_FILTERS.years and current_committee. */
export const LIVE_SESSION_YEARS: number[] = [2027, 2026];

/** What the user picked; 'auto' is resolved to a SortMode by resolveSortMode. */
export type SortChoice = 'auto' | 'relevance' | 'title';
export type SortMode = 'relevance' | 'title';

export interface SearchFilters {
  q: string;
  years: number[];
  chambers: Chamber[];
  stages: string[];
  deadFilter: DeadFilter;
  trackedFilter: TrackedFilter;
  /** Legislator id (uuid) of a bill introducer, or null. */
  introducerId: string | null;
  /** Legislator id (uuid) of a committee chair/vice chair the bill awaits, or null. */
  chairId: string | null;
  sort: SortChoice;
}

/**
 * 2026 is the live session. Defaulting here (rather than to all 6,126 bills)
 * keeps the first screen relevant; 93% of the corpus is dead and all of 2025
 * is archived. 2027 is the user-testing simulation session (see
 * docs/superpowers/specs/2026-08-26-sim-2027-user-testing-design.md).
 */
export const DEFAULT_FILTERS: SearchFilters = {
  q: '',
  years: [...LIVE_SESSION_YEARS],
  chambers: [],
  stages: [],
  deadFilter: 'all',
  trackedFilter: 'all',
  introducerId: null,
  chairId: null,
  sort: 'auto',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Canonical 8-4-4-4-12 hex uuid, any case. */
export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

function asUuidOrNull(v: unknown): string | null {
  return typeof v === 'string' && isUuid(v) ? v : null;
}

/**
 * Explicit sort wins. 'auto' browses alphabetically when a legislator filter is
 * active and there is no text query (no relevance to rank by); otherwise relevance.
 */
export function resolveSortMode(
  f: Pick<SearchFilters, 'q' | 'introducerId' | 'chairId' | 'sort'>,
): SortMode {
  if (f.sort === 'title' || f.sort === 'relevance') return f.sort;
  const hasLegislator = f.introducerId !== null || f.chairId !== null;
  return hasLegislator && f.q.trim() === '' ? 'title' : 'relevance';
}

/** Title sort key: lowercased trimmed title, else trimmed bill number, else ''. */
export function titleSortKey(title: string | null, billNumber: string | null): string {
  const t = (title ?? '').trim();
  if (t) return t.toLowerCase();
  return (billNumber ?? '').trim().toLowerCase();
}

export const SEARCH_PAGE_SIZE = 40;

/**
 * True when the query looks like a bill number (HB20, SB 1251, HCR-5).
 * Requires at least one digit, so a bare "sb" stays a word query.
 */
export function isBillNumberQuery(q: string): boolean {
  return /^[hs][bcrm]?[cr]?\s*-?\s*\d+/i.test(q.trim());
}

/**
 * Split a word query into the tokens the substring-fallback branch of
 * searchBills matches individually. The English stemmer is inconsistent across
 * word families ("Environmental" stems to `environment`, but the query word
 * "environment" stems to `environ`), so exact-lexeme FTS silently misses real
 * variants. Each token here is matched with `col ILIKE '%token%'` alongside FTS
 * to catch those variants and partial words.
 *
 * Tokens are lowercased and stripped of the LIKE metacharacters %, _ and \ so a
 * user typing them can't change the substring semantics. (Values are still
 * parameterized at the query, so this is about match meaning, not injection.)
 * Empty tokens are dropped.
 */
export function tokenizeSearchQuery(q: string): string[] {
  return q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[%_\\]/g, ''))
    .filter((t) => t.length > 0);
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
    introducerId: filters.introducerId,
    chairId: filters.chairId,
    sort: filters.sort,
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
  if (filters.introducerId) count++;
  if (filters.chairId) count++;
  return count;
}

export type SearchCursor =
  | { mode: 'relevance'; rank: number; updatedAt: string; id: string }
  | { mode: 'title'; key: string; id: string };

/**
 * Keyset cursor. Base64 keeps it opaque and URL-safe. Relevance keeps the
 * original [rank, updatedAt, id] tuple so old bookmarked cursors still decode;
 * title is ['t', key, id].
 */
export function encodeCursor(cursor: SearchCursor): string {
  const json =
    cursor.mode === 'title'
      ? JSON.stringify(['t', cursor.key, cursor.id])
      : JSON.stringify([cursor.rank, cursor.updatedAt, cursor.id]);
  return Buffer.from(json, 'utf8').toString('base64url');
}

/** Returns null when the cursor is malformed or belongs to the other sort mode. */
export function decodeCursor(raw: string, mode: SortMode): SearchCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 3) return null;
    const [a, b, id] = parsed;
    if (typeof id !== 'string' || !isUuid(id)) return null;
    if (mode === 'title') {
      if (a !== 't' || typeof b !== 'string') return null;
      return { mode: 'title', key: b, id };
    }
    if (typeof a !== 'number' || typeof b !== 'string') return null;
    if (Number.isNaN(new Date(b).getTime())) return null;
    return { mode: 'relevance', rank: a, updatedAt: b, id };
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
  if (n.introducerId) qs.set('introducer', n.introducerId);
  if (n.chairId) qs.set('chair', n.chairId);
  if (n.sort !== 'auto') qs.set('sort', n.sort);
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
  const sort = params.get('sort');

  return {
    q: params.get('q') ?? '',
    years: years.length ? years : [],
    chambers,
    stages,
    deadFilter: dead === 'alive' || dead === 'dead' ? dead : 'all',
    trackedFilter: tracked === 'tracked' || tracked === 'untracked' ? tracked : 'all',
    introducerId: asUuidOrNull(params.get('introducer')),
    chairId: asUuidOrNull(params.get('chair')),
    sort: sort === 'relevance' || sort === 'title' ? sort : 'auto',
  };
}
