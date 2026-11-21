import type { Section } from '@/lib/analytics/paths';
import type { ClientEventName, ServerEventName } from '@/lib/analytics/events';
import type { OrgFilter } from '@/types/analytics';

// Feature-usage rows on the analytics dashboard. Keys are `page_view:<section>`
// for page views and the bare event name for every other client event (plus
// the server-logged status_change, which has no other home on the dashboard); the UI
// and src/db/queries/analytics.ts share these so labels always agree.

const SECTION_LABELS: Record<Section, string> = {
  tracker: 'Tracker page',
  'find-bills': 'Find Bills page',
  'take-action': 'Take Action page',
  community: 'Community page',
  guide: 'Guide page',
  learn: 'Learn page',
  bill: 'Bill page',
};

const EVENT_LABELS: Record<Exclude<ClientEventName, 'page_view'> | Extract<ServerEventName, 'status_change'>, string> = {
  bill_opened: 'Opened a bill',
  bill_search: 'Searched bills',
  testimony_exported: 'Exported testimony',
  csv_exported: 'Exported CSV',
  tracker_view_changed: 'Switched tracker view',
  tour_finished: 'Finished the welcome tour',
  status_change: 'Changed a bill status',
};

/** Every known feature key, in display order (page views first). */
export const FEATURE_KEYS: string[] = [
  ...Object.keys(SECTION_LABELS).map((s) => `page_view:${s}`),
  ...Object.keys(EVENT_LABELS),
];

export function featureKey(event: string, section: string | null): string {
  return event === 'page_view' ? `page_view:${section ?? 'unknown'}` : event;
}

/** Human-readable label; falls back to the raw key for anything unknown. */
export function featureLabel(key: string): string {
  if (key.startsWith('page_view:')) {
    const section = key.slice('page_view:'.length);
    return SECTION_LABELS[section as Section] ?? `${section} page`;
  }
  return EVENT_LABELS[key as keyof typeof EVENT_LABELS] ?? key;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parses the `org` query param: `all` | `none` | a tenant uuid. Empty/missing → all;
 * anything else → null (invalid).
 */
export function parseOrgFilter(value: string | null | undefined): OrgFilter | null {
  if (!value || value === 'all') return { kind: 'all' };
  if (value === 'none') return { kind: 'none' };
  return UUID_RE.test(value) ? { kind: 'org', tenantId: value } : null;
}

/** Shape check for an OrgFilter coming from an untrusted caller (server-action arm). */
export function isValidOrgFilter(value: unknown): value is OrgFilter {
  if (!value || typeof value !== 'object') return false;
  const v = value as { kind?: unknown; tenantId?: unknown };
  if (v.kind === 'all' || v.kind === 'none') return true;
  return v.kind === 'org' && typeof v.tenantId === 'string' && UUID_RE.test(v.tenantId);
}
