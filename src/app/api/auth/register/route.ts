import { NextRequest, NextResponse } from 'next/server';
import { registerUser, createSession } from '@/lib/auth/session';
import { registerSchema } from '@/lib/auth/validators';
import { setSessionCookie } from '@/lib/auth/cookies';
import {
  addMember,
  getUserMemberships,
  claimInviteToken,
  createOrgForNewUser,
} from '@/db/queries/tenants';
import { limitFixedWindow, retryAfterMs } from '@/lib/core/ratelimit-memory';
import { ApiError } from '@/lib/core/errors';

const REGISTER_RATE_LIMIT = { limit: 5, windowMs: 15 * 60_000 };

function getClientIp(request: NextRequest): string {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const rl = limitFixedWindow(`register:${clientIp}`, REGISTER_RATE_LIMIT.limit, REGISTER_RATE_LIMIT.windowMs);
    if (!rl.ok) {
      const retryMs = retryAfterMs(rl.resetAt);
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.', retryAfterMs: retryMs },
        { status: 429, headers: { 'Retry-After': Math.ceil(retryMs / 1000).toString() } }
      );
    }

    const { username, email, password, orgName, inviteToken } = await req.json();
    const validation = registerSchema.safeParse({ username, email, password });
    if (!validation.success) {
      const messages = validation.error.issues.map(i => i.message).join(', ');
      return NextResponse.json({ error: messages }, { status: 400 });
    }

    // If inviteToken is provided, atomically claim it before creating the user.
    // Shared with the Google OAuth callback via db/queries/tenants.
    let validatedInvite: { tenant_id: string } | null = null;
    if (inviteToken) {
      const claimed = await claimInviteToken(inviteToken, email);
      if (!claimed.ok) {
        return NextResponse.json({ error: claimed.reason }, { status: 400 });
      }
      validatedInvite = { tenant_id: claimed.tenantId };
    }

    // Validate orgName if provided
    if (!inviteToken && orgName !== undefined && orgName !== null) {
      const trimmed = typeof orgName === 'string' ? orgName.trim() : '';
      if (trimmed.length === 0 || trimmed.length > 100) {
        return NextResponse.json({ error: 'Organization name must be between 1 and 100 characters.' }, { status: 400 });
      }
    }

    // Validate email domain
    // if (!isValidEmailDomain(email)) {
    //   return NextResponse.json({ 
    //     error: `Registration is only allowed for email addresses ending in: ${ALLOWED_EMAIL_DOMAINS.join(', ')}` 
    //   }, { status: 403 });
    // }

    const { user } = await registerUser(email, username, password);
    if (!user) {
      return NextResponse.json({ error: 'User already exists or registration failed.' }, { status: 400 });
    }

    // If orgName provided, create the organization and add user as admin
    let tenant = null;
    if (orgName && typeof orgName === 'string' && orgName.trim().length > 0) {
      tenant = await createOrgForNewUser(orgName, user.id);
    }

    // If registering via invite, add user to the org (invite already marked accepted atomically above)
    if (validatedInvite) {
      await addMember(validatedInvite.tenant_id, user.id, 'worker', { skipAuth: true });
    }

    // Auto-login: create session and return cookie + memberships
    const token = await createSession(user.id);
    const memberships = await getUserMemberships(user.id);

    return NextResponse.json(
      {
        success: true,
        user,
        memberships,
      },
      {
        status: 200,
        headers: {
          'Set-Cookie': setSessionCookie(token),
        },
      }
    );
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: error?.message ?? 'Registration failed' }, { status: 500 });
  }
}
