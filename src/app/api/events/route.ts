import { NextRequest, NextResponse } from 'next/server';
import { optionalSession } from '@/lib/auth/auth-guards';
import { recordClientEvent } from '@/db/queries/usage-events';
import { limitFixedWindow } from '@/lib/core/ratelimit-memory';
import { getClientIp } from '@/lib/core/client-ip';

const MAX_BODY_BYTES = 4096;

/**
 * Client usage events (sent via sendBeacon). Always 204 — invalid, limited or
 * failed events are dropped so beacons never retry.
 */
export async function POST(request: NextRequest) {
  try {
    // Per-IP limit first (cheapest check). The IP only lives in the in-memory key.
    if (!limitFixedWindow(`events:ip:${getClientIp(request)}`, 600, 60_000).ok) {
      return new NextResponse(null, { status: 204 });
    }

    const declared = Number(request.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 204 });
    }
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 204 });

    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    if (!body || typeof body !== 'object') return new NextResponse(null, { status: 204 });

    const { user } = await optionalSession.fromRequest(request);
    const anonId = typeof body.anonId === 'string' ? body.anonId.slice(0, 64) : null;
    const key = `events:${user?.id ?? anonId ?? 'unknown'}`;
    if (limitFixedWindow(key, 120, 60_000).ok) {
      await recordClientEvent(user?.id ?? null, body);
    }
  } catch (error) {
    console.error('Error in events POST:', error);
  }
  return new NextResponse(null, { status: 204 });
}
