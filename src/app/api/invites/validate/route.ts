import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/kysely/client';
import { limitFixedWindow, retryAfterMs } from '@/lib/ratelimit-memory';

const VALIDATE_RATE_LIMIT = { limit: 60, windowMs: 15 * 60_000 };

function getClientIp(request: NextRequest): string {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function GET(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);
    const rl = limitFixedWindow(`validate-invite:${clientIp}`, VALIDATE_RATE_LIMIT.limit, VALIDATE_RATE_LIMIT.windowMs);
    if (!rl.ok) {
      const retryMs = retryAfterMs(rl.resetAt);
      return NextResponse.json(
        { valid: false, reason: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': Math.ceil(retryMs / 1000).toString() } }
      );
    }

    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ valid: false, reason: 'No token provided.' }, { status: 400 });
    }

    const invite = await db
      .selectFrom('invite_tokens as it')
      .innerJoin('tenants as t', 'it.tenant_id', 't.id')
      .select(['it.status', 'it.expires_at', 'it.email', 't.name as orgName'])
      .where('it.token', '=', token)
      .executeTakeFirst();

    if (!invite) {
      return NextResponse.json({ valid: false, reason: 'Invite not found.' }, { status: 404 });
    }

    if (invite.status === 'revoked') {
      return NextResponse.json({ valid: false, reason: 'This invite is no longer valid.' }, { status: 200 });
    }

    if (invite.status === 'accepted') {
      return NextResponse.json({ valid: false, reason: 'This invite has already been used.' }, { status: 200 });
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, reason: 'This invite has expired. Please ask the admin to resend.' }, { status: 200 });
    }

    return NextResponse.json({
      valid: true,
      orgName: invite.orgName,
      email: invite.email,
    }, { status: 200 });
  } catch (error: any) {
    console.error('Validate invite error:', error);
    return NextResponse.json({ valid: false, reason: 'Internal server error.' }, { status: 500 });
  }
}
