import { NextRequest, NextResponse } from 'next/server';
import { optionalSession } from '@/lib/auth/auth-guards';
import { recordClientEvent } from '@/db/queries/usage-events';
import { limitFixedWindow } from '@/lib/core/ratelimit-memory';

/**
 * Client usage events (sent via sendBeacon). Always 204 — invalid, limited or
 * failed events are dropped so beacons never retry.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const { user } = await optionalSession.fromRequest(request);
    const anonId = typeof body?.anonId === 'string' ? body.anonId : null;
    const key = `events:${user?.id ?? anonId ?? 'unknown'}`;
    if (limitFixedWindow(key, 120, 60_000).ok) {
      await recordClientEvent(user?.id ?? null, body);
    }
  } catch (error) {
    console.error('Error in events POST:', error);
  }
  return new NextResponse(null, { status: 204 });
}
