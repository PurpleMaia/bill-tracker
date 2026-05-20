import { NextRequest, NextResponse } from 'next/server';
import { registerUser, createSession } from '@/lib/auth';
import { db } from '@/db/kysely/client';
import { registerSchema } from '@/lib/validators';
import { setSessionCookie } from '@/lib/cookies';
import { createTenant, addMember, getUserMemberships } from '@/services/data/tenants';
import { limitFixedWindow, retryAfterMs } from '@/lib/ratelimit-memory';
import { ApiError } from '@/lib/errors';

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

    // If inviteToken is provided, validate it before creating the user
    let validatedInvite: { tenant_id: string; id: string } | null = null;
    if (inviteToken) {
      const invite = await db
        .selectFrom('invite_tokens')
        .select(['id', 'tenant_id', 'status', 'expires_at'])
        .where('token', '=', inviteToken)
        .executeTakeFirst();

      if (!invite || invite.status !== 'pending' || new Date(invite.expires_at) < new Date()) {
        return NextResponse.json({ error: 'Invite is invalid, expired, or already used.' }, { status: 400 });
      }
      validatedInvite = { tenant_id: invite.tenant_id, id: invite.id };
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
      const trimmedName = orgName.trim();
      const slug = trimmedName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 50);

      try {
        tenant = await createTenant(trimmedName, slug);
        await addMember(tenant.id, user.id, 'admin');
      } catch (orgError) {
        console.error('Failed to create organization:', orgError);
      }
    }

    // If registering via invite, add user to the org and mark invite as accepted
    if (validatedInvite) {
      await addMember(validatedInvite.tenant_id, user.id, 'worker');
      await db
        .updateTable('invite_tokens')
        .set({ status: 'accepted', accepted_at: new Date() })
        .where('id', '=', validatedInvite.id)
        .execute();
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
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
