import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { getSessionCookie } from '@/lib/cookies';
import { validateMembership } from '@/db/queries/tenants';
import { db } from '@/db/kysely/client';
import { uuidSchema } from '@/lib/validators';
import crypto from 'crypto';

// GET /api/supervisors
// Query params:
//   ?tenantId=uuid  — filter adoptees to those who are also members of the tenant
//   ?available=true — list users available for adoption (not yet adopted by this supervisor)
export async function GET(request: NextRequest) {
  try {
    const sessionToken = getSessionCookie(request);
    if (!sessionToken) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const user = await validateSession(sessionToken);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });
    }

    if (user.role !== 'supervisor') {
      return NextResponse.json({ success: false, error: 'Unauthorized: Supervisor access only' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || undefined;
    const available = searchParams.get('available') === 'true';

    if (tenantId) {
      await validateMembership(user.id, tenantId);
    }

    if (available) {
      // List users available for adoption (not yet adopted by this supervisor)
      let query = db
        .selectFrom('user')
        .select(['id', 'email', 'username', 'role'])
        .where('role', '=', 'user')
        .where('account_status', '=', 'active');

      if (tenantId) {
        // Filter to only users who are members of the same tenant
        query = query.where('id', 'in', (eb) =>
          eb
            .selectFrom('members')
            .select('user_id')
            .where('tenant_id', '=', tenantId)
        );
      }

      const allUsers = await query.execute();

      // Get already adopted users by this supervisor
      const adopted = await db
        .selectFrom('supervisor_users')
        .select(['user_id'])
        .where('supervisor_id', '=', user.id)
        .execute();

      const adoptedIds = new Set(adopted.map((a: any) => a.user_id));
      const availableUsers = allUsers.filter((u: any) => !adoptedIds.has(u.id));

      return NextResponse.json({ success: true, users: availableUsers });
    }

    // Default: list this supervisor's adoptees
    const superUserRecords = await db
      .selectFrom('supervisor_users')
      .selectAll()
      .where('supervisor_id', '=', user.id)
      .execute();

    let userIds = superUserRecords.map((su: any) => su.user_id);

    if (userIds.length === 0) {
      return NextResponse.json({ success: true, adoptees: [] });
    }

    if (tenantId) {
      // Filter to only adoptees who are also members of the tenant
      const tenantMembers = await db
        .selectFrom('members')
        .select('user_id')
        .where('tenant_id', '=', tenantId)
        .where('user_id', 'in', userIds)
        .execute();

      const tenantMemberIds = new Set(tenantMembers.map((m: any) => m.user_id));
      userIds = userIds.filter((id: string) => tenantMemberIds.has(id));

      if (userIds.length === 0) {
        return NextResponse.json({ success: true, adoptees: [] });
      }
    }

    const adoptees = await db
      .selectFrom('user')
      .select(['id', 'email', 'username'])
      .where('id', 'in', userIds)
      .execute();

    const adopteesWithDates = adoptees.map((adoptee) => {
      const record = superUserRecords.find((su: any) => su.user_id === adoptee.id);
      return {
        id: adoptee.id,
        email: adoptee.email,
        username: adoptee.username,
        adopted_at: record ? record.created_at : null,
      };
    });

    return NextResponse.json({ success: true, adoptees: adopteesWithDates });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in supervisors GET:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/supervisors
// Body: { userId, tenantId? }
// Adopts a user. When tenantId provided, validates both users are members.
export async function POST(request: NextRequest) {
  try {
    const sessionToken = getSessionCookie(request);
    if (!sessionToken) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const user = await validateSession(sessionToken);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });
    }

    if (user.role !== 'supervisor') {
      return NextResponse.json({ success: false, error: 'Unauthorized: Supervisor access only' }, { status: 403 });
    }

    const body = await request.json();
    const { userId: internId, tenantId } = body;

    const validation = uuidSchema.safeParse(internId);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: 'Invalid user ID format' }, { status: 400 });
    }

    if (tenantId) {
      // Validate supervisor is a member of the tenant
      await validateMembership(user.id, tenantId);
      // Validate intern is also a member of the tenant
      await validateMembership(internId, tenantId);
    }

    // Check if user exists and is a regular user
    const internUser = await db
      .selectFrom('user')
      .selectAll()
      .where('id', '=', internId)
      .executeTakeFirst();

    if (!internUser) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    if (internUser.role !== 'user') {
      return NextResponse.json({ success: false, error: 'User must be a regular user to be adopted' }, { status: 400 });
    }

    // Check if already adopted
    const existing = await db
      .selectFrom('supervisor_users')
      .selectAll()
      .where('supervisor_id', '=', user.id)
      .where('user_id', '=', internId)
      .executeTakeFirst();

    if (existing) {
      return NextResponse.json({ success: false, error: 'User already adopted by this supervisor' }, { status: 400 });
    }

    // Create adoption relationship
    const adoptionId = crypto.randomUUID();
    await db
      .insertInto('supervisor_users')
      .values({
        id: adoptionId,
        supervisor_id: user.id,
        user_id: internId,
        created_at: new Date(),
      })
      .execute();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in supervisors POST:', error);
    return NextResponse.json({ success: false, error: 'Failed to adopt user' }, { status: 500 });
  }
}

// DELETE /api/supervisors
// Body: { userId, tenantId? }
// Drops a user (removes supervisor_users row).
export async function DELETE(request: NextRequest) {
  try {
    const sessionToken = getSessionCookie(request);
    if (!sessionToken) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const user = await validateSession(sessionToken);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });
    }

    if (user.role !== 'supervisor') {
      return NextResponse.json({ success: false, error: 'Unauthorized: Supervisor access only' }, { status: 403 });
    }

    const body = await request.json();
    const { userId, tenantId } = body;

    const validation = uuidSchema.safeParse(userId);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: 'Invalid user ID format' }, { status: 400 });
    }

    if (tenantId) {
      await validateMembership(user.id, tenantId);
    }

    await db
      .deleteFrom('supervisor_users')
      .where('supervisor_id', '=', user.id)
      .where('user_id', '=', userId)
      .execute();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in supervisors DELETE:', error);
    return NextResponse.json({ success: false, error: 'Failed to drop user' }, { status: 500 });
  }
}
