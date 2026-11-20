'use server';

import { optionalSession } from '@/lib/auth/auth-guards';
import { recordClientEvent } from '@/db/queries/usage-events';
import { limitFixedWindow } from '@/lib/core/ratelimit-memory';
import type { TrackInput } from '@/lib/analytics/events';

/** Server-action arm for data.analytics.track. Never throws: tracking must not break the UI. */
export async function trackEventAction(input: TrackInput): Promise<void> {
  try {
    const { user } = await optionalSession.fromAction();
    const key = `events:${user?.id ?? input?.anonId ?? 'unknown'}`;
    if (!limitFixedWindow(key, 120, 60_000).ok) return;
    await recordClientEvent(user?.id ?? null, input);
  } catch (error) {
    console.error('[analytics] trackEventAction failed', error);
  }
}
