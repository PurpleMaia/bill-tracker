import { NextRequest, NextResponse } from 'next/server';
import { registerUser, createSession } from '@/lib/auth/session';
import { registerSchema } from '@/lib/auth/validators';
import { setSessionCookie } from '@/lib/auth/cookies';
import {
  getUserMemberships,
  checkInviteToken,
  redeemInviteToken,
  createOrgForNewUser,
  tenantNameExists,
} from '@/db/queries/tenants';
import { limitFixedWindow, retryAfterMs } from '@/lib/core/ratelimit-memory';
import { ApiError } from '@/lib/core/errors';
import { deriveOrgSlug } from '@/lib/tenants/org-slug';

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

    const { username, email, password, firstName, lastName, orgName, inviteToken } = await req.json();
    const validation = registerSchema.safeParse({ username, email, password, firstName, lastName });
    if (!validation.success) {
      const messages = validation.error.issues.map(i => i.message).join(', ');
      return NextResponse.json({ error: messages }, { status: 400 });
    }

    // Reject a bad invite before creating the user, but don't consume it yet:
    // if account creation fails below, the invitee must still be able to retry.
    if (inviteToken) {
      const check = await checkInviteToken(inviteToken, email);
      if (!check.ok) {
        return NextResponse.json({ error: check.reason }, { status: 400 });
      }
    }

    // Validate orgName if provided
    if (!inviteToken && orgName !== undefined && orgName !== null) {
      const trimmed = typeof orgName === 'string' ? orgName.trim() : '';
      if (trimmed.length === 0 || trimmed.length > 100) {
        return NextResponse.json({ error: 'Organization name must be between 1 and 100 characters.' }, { status: 400 });
      }
      // A name with no slug-able characters (e.g. "!!!" or "日本語") would derive
      // to an empty slug and be silently dropped by createOrgForNewUser, leaving
      // the user registered with no org while the UI reports success. Reject it
      // up front instead.
      if (!deriveOrgSlug(trimmed)) {
        return NextResponse.json({ error: 'Organization name must contain at least one letter or number.' }, { status: 400 });
      }
      // tenants.name is UNIQUE — a duplicate would also be swallowed to a silent
      // no-org success, so reject it here before the user is created.
      if (await tenantNameExists(trimmed)) {
        return NextResponse.json({ error: 'An organization with that name already exists. Please choose a different name.' }, { status: 409 });
      }
    }

    // Validate email domain
    // if (!isValidEmailDomain(email)) {
    //   return NextResponse.json({ 
    //     error: `Registration is only allowed for email addresses ending in: ${ALLOWED_EMAIL_DOMAINS.join(', ')}` 
    //   }, { status: 403 });
    // }

    const { user } = await registerUser(email, username, password, {
      firstName: validation.data.firstName,
      lastName: validation.data.lastName,
    });
    if (!user) {
      return NextResponse.json({ error: 'User already exists or registration failed.' }, { status: 400 });
    }

    // If orgName provided, create the organization and add user as admin
    let tenant = null;
    if (orgName && typeof orgName === 'string' && orgName.trim().length > 0) {
      tenant = await createOrgForNewUser(orgName, user.id);
    }

    // Claim the invite and add the membership atomically, now that the user
    // exists. This can only fail if another request redeemed the token since
    // the check above; the account is already valid, so sign them in anyway
    // and surface the invite failure alongside.
    let inviteError: string | undefined;
    if (inviteToken) {
      const redeemed = await redeemInviteToken(inviteToken, email, user.id);
      if (!redeemed.ok) {
        console.warn('[register] Invite redemption failed after user creation:', redeemed.reason);
        inviteError = redeemed.reason;
      }
    }

    // Auto-login: create session and return cookie + memberships
    const token = await createSession(user.id);
    const memberships = await getUserMemberships(user.id);

    return NextResponse.json(
      {
        success: true,
        user,
        memberships,
        ...(inviteError && { inviteError }),
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
