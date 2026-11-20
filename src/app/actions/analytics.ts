'use server';

import { optionalSession, requireSysadmin } from '@/lib/auth/auth-guards';
import { getAnalyticsDashboard } from '@/db/queries/analytics';
import { isAnalyticsRange } from '@/lib/analytics/buckets';
import { isValidOrgFilter } from '@/lib/analytics/features';
import { Errors } from '@/lib/core/errors';
import type { AnalyticsRange, DashboardData, OrgFilter } from '@/types/analytics';
import { recordClientEvent } from '@/db/queries/usage-events';
import { limitFixedWindow } from '@/lib/core/ratelimit-memory';
import { validateClientEvent, type TrackInput } from '@/lib/analytics/events';

/** Server-action arm for data.analytics.track. Never throws: tracking must not break the UI. */
export async function trackEventAction(input: TrackInput): Promise<void> {
  try {
    // Validate first so an unvalidated anonId never becomes a limiter key.
    const valid = validateClientEvent(input);
    if (!valid) return;
    const { user } = await optionalSession.fromAction();
    const key = `events:${user?.id ?? valid.anonId ?? 'unknown'}`;
    if (!limitFixedWindow(key, 120, 60_000).ok) return;
    await recordClientEvent(user?.id ?? null, valid);
  } catch (error) {
    console.error('[analytics] trackEventAction failed', error);
  }
}

/** Server-action arm for data.analytics.getDashboard. Sysadmin only. */
export async function getAnalyticsDashboardAction(params: {
  range: AnalyticsRange;
  org: OrgFilter;
}): Promise<DashboardData> {
  await requireSysadmin.fromAction();
  if (!isAnalyticsRange(params?.range) || !isValidOrgFilter(params?.org)) throw Errors.INVALID_REQUEST;
  return getAnalyticsDashboard({ range: params.range, org: params.org });
}
