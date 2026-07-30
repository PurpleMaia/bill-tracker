import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/auth-guards';
import { db } from '@/db/kysely/client';
import { limitFixedWindow, retryAfterMs } from '@/lib/core/ratelimit-memory';
import { emailSchema } from '@/lib/auth/validators';
import { sendInviteEmail } from '@/services/email';
import { randomUUID } from 'crypto';

const INVITE_RATE_LIMIT = { limit: 20, windowMs: 15 * 60_000 };
const INVITE_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tenantId } = await params;

    // Rate limit
    const rl = limitFixedWindow(`invite:${tenantId}`, INVITE_RATE_LIMIT.limit, INVITE_RATE_LIMIT.windowMs);
    if (!rl.ok) {
      const retryMs = retryAfterMs(rl.resetAt);
      return NextResponse.json(
        { error: 'Too many invite requests. Please try again later.', retryAfterMs: retryMs },
        { status: 429, headers: { 'Retry-After': Math.ceil(retryMs / 1000).toString() } }
      );
    }

    // Auth — org admin only
    const { user } = await requireAdmin.fromRequest(request, tenantId);

    // Validate email
    const body = await request.json();
    const emailResult = emailSchema.safeParse(body.email);
    if (!emailResult.success) {
      return NextResponse.json({ error: 'Please provide a valid email address.' }, { status: 400 });
    }
    const email = emailResult.data;

    // Check if email is already a member of this tenant
    const existingMember = await db
      .selectFrom('members as m')
      .innerJoin('user as u', 'm.user_id', 'u.id')
      .select('u.id')
      .where('u.email', '=', email)
      .where('m.tenant_id', '=', tenantId)
      .executeTakeFirst();

    if (existingMember) {
      return NextResponse.json(
        { error: 'This user is already a member of the organization.' },
        { status: 409 }
      );
    }

    // Revoke any existing pending invites for this email + tenant
    await db
      .updateTable('invite_tokens')
      .set({ status: 'revoked' })
      .where('email', '=', email)
      .where('tenant_id', '=', tenantId)
      .where('status', '=', 'pending')
      .execute();

    // Create new invite token
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);

    await db
      .insertInto('invite_tokens')
      .values({
        email,
        tenant_id: tenantId,
        token,
        status: 'pending',
        invited_by: user.id,
        expires_at: expiresAt,
      })
      .execute();

    // Get tenant name for the email
    const tenant = await db
      .selectFrom('tenants')
      .select('name')
      .where('id', '=', tenantId)
      .executeTakeFirst();

    const orgName = tenant?.name ?? 'an organization';

    // Send invite email (fire-and-forget — don't block the response)
    sendInviteEmail(email, orgName, token).catch((err) => {
      console.error('Failed to send invite email, but invite token was created:', err);
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
