import type { AnalyticsRange, WeeklyPoint } from '@/types/analytics';

// Pure date helpers for the analytics dashboard. Weeks are Monday-start weeks
// in Pacific/Honolulu, matching the SQL bucketing
// (date_trunc('week', col AT TIME ZONE 'Pacific/Honolulu')).

const DAY_MS = 24 * 60 * 60 * 1000;
/** Hawaii observes no DST, so its UTC offset is a constant -10h. */
const HONOLULU_OFFSET_MS = -10 * 60 * 60 * 1000;

const RANGE_DAYS: Record<Exclude<AnalyticsRange, 'all'>, number> = {
  '30d': 30,
  '90d': 90,
  '1y': 365,
};

export const ANALYTICS_RANGES: readonly AnalyticsRange[] = ['30d', '90d', '1y', 'all'];

export function isAnalyticsRange(value: unknown): value is AnalyticsRange {
  return typeof value === 'string' && (ANALYTICS_RANGES as readonly string[]).includes(value);
}

/** Start of the current window (`all` → null: no lower bound). */
export function rangeStart(range: AnalyticsRange, now: Date): Date | null {
  if (range === 'all') return null;
  return new Date(now.getTime() - RANGE_DAYS[range] * DAY_MS);
}

/** Start of the equal-length window immediately before the current one (`all` → null). */
export function previousRangeStart(range: AnalyticsRange, now: Date): Date | null {
  if (range === 'all') return null;
  return new Date(now.getTime() - 2 * RANGE_DAYS[range] * DAY_MS);
}

/** Honolulu-local Monday (as a UTC-midnight Date) of the week containing `date`. */
function honoluluMonday(date: Date): Date {
  const local = new Date(date.getTime() + HONOLULU_OFFSET_MS);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  return new Date(midnight - daysSinceMonday * DAY_MS);
}

/** Every Honolulu week from `from` to `to` (inclusive), ascending, zero-filled where `rows` has no value. */
export function fillWeeks(rows: WeeklyPoint[], from: Date, to: Date): WeeklyPoint[] {
  const values = new Map(rows.map((r) => [r.week, r.value]));
  const out: WeeklyPoint[] = [];
  const end = honoluluMonday(to).getTime();
  for (let t = honoluluMonday(from).getTime(); t <= end; t += 7 * DAY_MS) {
    const week = new Date(t).toISOString().slice(0, 10);
    out.push({ week, value: values.get(week) ?? 0 });
  }
  return out;
}

/** Percent change from `previous` to `current`, rounded; null when there is no baseline. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
