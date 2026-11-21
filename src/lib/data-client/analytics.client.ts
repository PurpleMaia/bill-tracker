import { defineClient } from './define-client';
import { getAnalyticsDashboardAction, trackEventAction } from '@/app/actions/analytics';
import type { TrackInput } from '@/lib/analytics/events';
import type { AnalyticsRange, DashboardData, OrgFilter } from '@/types/analytics';

// ---- fetch arm (beacons to /api/events) ----

async function trackFetch(input: TrackInput): Promise<void> {
  try {
    const body = JSON.stringify(input);
    const sent =
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }));
    if (sent) return;
    await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
  } catch {
    // tracking never throws
  }
}

// ---- fetch arm (sysadmin dashboard) ----

function orgParam(org: OrgFilter): string {
  return org.kind === 'org' ? org.tenantId : org.kind;
}

async function getDashboardFetch(params: { range: AnalyticsRange; org: OrgFilter }): Promise<DashboardData> {
  const qs = new URLSearchParams({ range: params.range, org: orgParam(params.org) });
  const res = await fetch(`/api/analytics?${qs}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load analytics');
  }
  return res.json();
}

export const analyticsClient = defineClient('analytics', {
  track: { action: trackEventAction, fetch: trackFetch },
  getDashboard: { action: getAnalyticsDashboardAction, fetch: getDashboardFetch },
});
