'use server';

import { db } from '@/db/kysely/client';
import type { Membership, OrgRole } from '@/types/tenant';
import { Errors } from '@/lib/errors';

/**
 * Fetches all tenant memberships for a user.
 * Used by the session endpoint to populate the AuthContext.
 */
export async function getUserMemberships(userId: string): Promise<Membership[]> {
  const rows = await db
    .selectFrom('members as m')
    .innerJoin('tenants as t', 'm.tenant_id', 't.id')
    .select([
      't.id as tenantId',
      't.slug',
      't.name',
      'm.org_role as orgRole',
    ])
    .where('m.user_id', '=', userId)
    .execute();

  return rows.map(r => ({
    tenantId: r.tenantId,
    slug: r.slug,
    name: r.name,
    orgRole: r.orgRole as OrgRole,
  }));
}

/**
 * Validates that a user is a member of a tenant.
 * Returns the org role if valid, throws 403 if not.
 */
export async function validateMembership(
  userId: string,
  tenantId: string
): Promise<OrgRole> {
  const row = await db
    .selectFrom('members')
    .select('org_role')
    .where('user_id', '=', userId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  if (!row) {
    throw Errors.NOT_A_MEMBER;
  }

  return row.org_role as OrgRole;
}

/**
 * Creates a new tenant. Sysadmin only.
 */
export async function createTenant(
  name: string,
  slug: string,
  brandingConfig?: Record<string, unknown>
): Promise<{ id: string; name: string; slug: string }> {
  const result = await db
    .insertInto('tenants')
    .values({
      name,
      slug,
      branding_config: brandingConfig ? JSON.stringify(brandingConfig) : null,
    })
    .returning(['id', 'name', 'slug'])
    .executeTakeFirst();

  if (!result) {
    throw Errors.INTERNAL_ERROR;
  }

  return { id: result.id, name: result.name, slug: result.slug };
}

/**
 * Adds a user as a member of a tenant.
 */
export async function addMember(
  tenantId: string,
  userId: string,
  orgRole: OrgRole = 'worker'
): Promise<void> {
  await db
    .insertInto('members')
    .values({
      user_id: userId,
      tenant_id: tenantId,
      org_role: orgRole,
    })
    .execute();
}

/**
 * Removes a user from a tenant.
 */
export async function removeMember(
  tenantId: string,
  userId: string
): Promise<void> {
  await db
    .deleteFrom('members')
    .where('tenant_id', '=', tenantId)
    .where('user_id', '=', userId)
    .execute();
}

/**
 * Updates a member's org role.
 */
export async function updateMemberRole(
  tenantId: string,
  userId: string,
  newRole: OrgRole
): Promise<void> {
  await db
    .updateTable('members')
    .set({ org_role: newRole })
    .where('tenant_id', '=', tenantId)
    .where('user_id', '=', userId)
    .execute();
}

/**
 * Fetches all members of a tenant with user details.
 */
export async function getTenantMembers(tenantId: string) {
  return db
    .selectFrom('members as m')
    .innerJoin('user as u', 'm.user_id', 'u.id')
    .select([
      'u.id',
      'u.username',
      'u.email',
      'm.org_role',
      'm.created_at',
    ])
    .where('m.tenant_id', '=', tenantId)
    .orderBy('u.username', 'asc')
    .execute();
}
