import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { getSessionCookie } from '@/lib/cookies';
import {
  validateMembership,
  getTenantMembers,
  addMember,
  removeMember,
  updateMemberRole,
} from '@/services/data/tenants';
import { db } from '@/db/kysely/client';
import { uuidSchema, emailSchema } from '@/lib/validators';
import type { OrgRole } from '@/types/tenant';

const ORG_ROLES: OrgRole[] = ['admin', 'worker'];

function isValidOrgRole(role: unknown): role is OrgRole {
  return typeof role === 'string' && (ORG_ROLES as string[]).includes(role);
}

// GET /api/members?tenantId=uuid
// Lists all members of a tenant. Requires org admin.
export async function GET(request: NextRequest) {
  try {
    const sessionToken = getSessionCookie(request);
    if (!sessionToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await validateSession(sessionToken);
    if (!user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    const tenantIdValidation = uuidSchema.safeParse(tenantId);
    if (!tenantIdValidation.success) {
      return NextResponse.json({ error: 'Invalid tenantId format' }, { status: 400 });
    }

    const orgRole = await validateMembership(user.id, tenantId);
    if (orgRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: org admin role required' }, { status: 403 });
    }

    const members = await getTenantMembers(tenantId);
    return NextResponse.json({ members }, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in members GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/members
// Invites a member to the org. Body: { tenantId, email, orgRole }. Requires org admin.
export async function POST(request: NextRequest) {
  try {
    const sessionToken = getSessionCookie(request);
    if (!sessionToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await validateSession(sessionToken);
    if (!user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const body = await request.json();
    const { tenantId, email, orgRole } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    const tenantIdValidation = uuidSchema.safeParse(tenantId);
    if (!tenantIdValidation.success) {
      return NextResponse.json({ error: 'Invalid tenantId format' }, { status: 400 });
    }

    const emailValidation = emailSchema.safeParse(email);
    if (!emailValidation.success) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    if (orgRole !== undefined && !isValidOrgRole(orgRole)) {
      return NextResponse.json({ error: `Invalid orgRole. Must be one of: ${ORG_ROLES.join(', ')}` }, { status: 400 });
    }

    const callerRole = await validateMembership(user.id, tenantId);
    if (callerRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: org admin role required' }, { status: 403 });
    }

    // Look up user by email
    const targetUser = await db
      .selectFrom('user')
      .select(['id'])
      .where('email', '=', email)
      .executeTakeFirst();

    if (!targetUser) {
      return NextResponse.json({ error: 'No user found with that email address' }, { status: 404 });
    }

    await addMember(tenantId, targetUser.id, orgRole ?? 'worker', { skipAuth: true });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in members POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/members
// Updates a member's org role. Body: { tenantId, userId, orgRole }. Requires org admin.
export async function PATCH(request: NextRequest) {
  try {
    const sessionToken = getSessionCookie(request);
    if (!sessionToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await validateSession(sessionToken);
    if (!user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const body = await request.json();
    const { tenantId, userId, orgRole } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    const tenantIdValidation = uuidSchema.safeParse(tenantId);
    if (!tenantIdValidation.success) {
      return NextResponse.json({ error: 'Invalid tenantId format' }, { status: 400 });
    }

    const userIdValidation = uuidSchema.safeParse(userId);
    if (!userIdValidation.success) {
      return NextResponse.json({ error: 'Invalid userId format' }, { status: 400 });
    }

    if (!isValidOrgRole(orgRole)) {
      return NextResponse.json({ error: `Invalid orgRole. Must be one of: ${ORG_ROLES.join(', ')}` }, { status: 400 });
    }

    const callerRole = await validateMembership(user.id, tenantId);
    if (callerRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: org admin role required' }, { status: 403 });
    }

    // Prevent demoting the last admin
    if (orgRole !== 'admin') {
      const currentRole = await db
        .selectFrom('members')
        .select('org_role')
        .where('tenant_id', '=', tenantId)
        .where('user_id', '=', userId)
        .executeTakeFirst();

      if (currentRole?.org_role === 'admin') {
        const adminCount = await db
          .selectFrom('members')
          .select(db.fn.countAll().as('count'))
          .where('tenant_id', '=', tenantId)
          .where('org_role', '=', 'admin')
          .executeTakeFirst();

        if (Number(adminCount?.count ?? 0) <= 1) {
          return NextResponse.json({ error: 'Cannot demote the last admin of the organization' }, { status: 400 });
        }
      }
    }

    await updateMemberRole(tenantId, userId, orgRole, { skipAuth: true });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in members PATCH:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/members
// Removes a member from the org. Body: { tenantId, userId }. Requires org admin.
export async function DELETE(request: NextRequest) {
  try {
    const sessionToken = getSessionCookie(request);
    if (!sessionToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await validateSession(sessionToken);
    if (!user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const body = await request.json();
    const { tenantId, userId } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    const tenantIdValidation = uuidSchema.safeParse(tenantId);
    if (!tenantIdValidation.success) {
      return NextResponse.json({ error: 'Invalid tenantId format' }, { status: 400 });
    }

    const userIdValidation = uuidSchema.safeParse(userId);
    if (!userIdValidation.success) {
      return NextResponse.json({ error: 'Invalid userId format' }, { status: 400 });
    }

    const callerRole = await validateMembership(user.id, tenantId);
    if (callerRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: org admin role required' }, { status: 403 });
    }

    // Prevent removing the last admin
    const targetMember = await db
      .selectFrom('members')
      .select('org_role')
      .where('tenant_id', '=', tenantId)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (targetMember?.org_role === 'admin') {
      const adminCount = await db
        .selectFrom('members')
        .select(db.fn.countAll().as('count'))
        .where('tenant_id', '=', tenantId)
        .where('org_role', '=', 'admin')
        .executeTakeFirst();

      if (Number(adminCount?.count ?? 0) <= 1) {
        return NextResponse.json({ error: 'Cannot remove the last admin of the organization' }, { status: 400 });
      }
    }

    await removeMember(tenantId, userId, { skipAuth: true });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in members DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
