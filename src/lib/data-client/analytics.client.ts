import { defineClient } from './define-client';
import { trackEventAction } from '@/app/actions/analytics';
import type { TrackInput } from '@/lib/analytics/events';

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

export const analyticsClient = defineClient('analytics', {
  track: { action: trackEventAction, fetch: trackFetch },
});
