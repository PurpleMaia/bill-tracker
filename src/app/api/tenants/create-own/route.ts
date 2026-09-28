import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/auth-guards';
import { createOrgSchema } from '@/lib/auth/validators';
import { getUserMemberships, createOrgForUser } from '@/db/queries/tenants';

/**
 * Self-serve org creation: a public user (no memberships) creates an
 * organization and becomes its admin. Intentionally NOT sysadmin-gated like
 * POST /api/tenants — but restricted to users who don't already belong to an
 * org, so it can't be used to spin up arbitrary tenants.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireSession.fromRequest(request);

    // Only public users may promote themselves. Anyone already in an org must
    // go through the normal invite/admin flow. This is a cheap fast-path reject;
    // the authoritative, concurrency-safe check runs inside createOrgForUser's
    // transaction (requireNoExistingMembership).
    const memberships = await getUserMemberships(user.id);
    if (memberships.length > 0) {
      return NextResponse.json(
        { error: 'You already belong to an organization.' },
        { status: 409 }
      );
    }

    const body = await request.json();
    const validation = createOrgSchema.safeParse(body);
    if (!validation.success) {
      const messages = validation.error.issues.map((i) => i.message).join(', ');
      return NextResponse.json({ error: messages }, { status: 400 });
    }

    const tenant = await createOrgForUser(validation.data.name, user.id, {
      requireNoExistingMembership: true,
    });
    return NextResponse.json({ tenant }, { status: 201 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error creating organization:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
