/**
 * Persists the /search page's filter selection to localStorage so it survives
 * navigation away/back and a full page reload. The search page seeds its
 * filters from the URL once on mount and never pushes back, so without this a
 * remount (navigation or refresh) resets everything to DEFAULT_FILTERS.
 *
 * Browser-only: every function guards `typeof window` and swallows storage
 * errors (private mode, quota, disabled storage). Reads validate the parsed
 * shape defensively so a stale or hand-edited blob falls back to `null` rather
 * than poisoning state.
 *
 * No DB access — safe for src/lib. Mirrors board-filter-storage.ts.
 */

import type {
  SearchFilters,
  Chamber,
  DeadFilter,
  TrackedFilter,
} from '@/lib/bills/search-params';

const STORAGE_KEY = 'billSearchFilters';

const DEAD_FILTERS: readonly DeadFilter[] = ['all', 'alive', 'dead'];
const TRACKED_FILTERS: readonly TrackedFilter[] = ['all', 'tracked', 'untracked'];

/** Returns the persisted filters, or `null` if none/invalid/unavailable. */
export function loadSearchFilters(): SearchFilters | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const value = parsed as Record<string, unknown>;

    const q = typeof value.q === 'string' ? value.q : '';
    const years = Array.isArray(value.years)
      ? value.years.filter((y): y is number => typeof y === 'number' && Number.isFinite(y))
      : [];
    const chambers = Array.isArray(value.chambers)
      ? value.chambers.filter((c): c is Chamber => c === 'house' || c === 'senate')
      : [];
    const stages = Array.isArray(value.stages)
      ? value.stages.filter((s): s is string => typeof s === 'string')
      : [];
    const deadFilter = DEAD_FILTERS.includes(value.deadFilter as DeadFilter)
      ? (value.deadFilter as DeadFilter)
      : 'all';
    const trackedFilter = TRACKED_FILTERS.includes(value.trackedFilter as TrackedFilter)
      ? (value.trackedFilter as TrackedFilter)
      : 'all';

    return { q, years, chambers, stages, deadFilter, trackedFilter };
  } catch {
    return null;
  }
}

/** Writes the current filters to localStorage; no-ops if unavailable. */
export function saveSearchFilters(filters: SearchFilters): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Ignore write failures (quota, private mode, disabled storage).
  }
}
