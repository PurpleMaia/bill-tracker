'use server';

import { db } from '@/db/kysely/client';
import type { Membership, OrgRole } from '@/types/tenant';
import { Errors } from '@/lib/errors';
import { auth } from '@/lib/auth';

type MutationOptions = { skipAuth?: boolean };

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
  brandingConfig?: Record<string, unknown>,
  options?: MutationOptions
): Promise<{ id: string; name: string; slug: string }> {
  if (!options?.skipAuth) {
    const session = await auth();
    if (!session) throw Errors.NO_SESSION_COOKIE;
  }

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
  orgRole: OrgRole = 'worker',
  options?: MutationOptions
): Promise<void> {
  if (!options?.skipAuth) {
    const session = await auth();
    if (!session) throw Errors.NO_SESSION_COOKIE;
    const callerRole = await validateMembership(session.user.id, tenantId);
    if (callerRole !== 'admin') throw Errors.UNAUTHORIZED;
  }

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
  userId: string,
  options?: MutationOptions
): Promise<void> {
  if (!options?.skipAuth) {
    const session = await auth();
    if (!session) throw Errors.NO_SESSION_COOKIE;
    const callerRole = await validateMembership(session.user.id, tenantId);
    if (callerRole !== 'admin') throw Errors.UNAUTHORIZED;
  }

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
  newRole: OrgRole,
  options?: MutationOptions
): Promise<void> {
  if (!options?.skipAuth) {
    const session = await auth();
    if (!session) throw Errors.NO_SESSION_COOKIE;
    const callerRole = await validateMembership(session.user.id, tenantId);
    if (callerRole !== 'admin') throw Errors.UNAUTHORIZED;
  }

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

/**
 * All orgs that opted into public board visibility, with an isFollowing flag
 * for the viewer. Used by the Browse Orgs tab.
 */
export async function listPublicTenants(viewerUserId: string) {
  const rows = await db
    .selectFrom('tenants as t')
    .leftJoin('org_follows as f', (join) =>
      join.onRef('f.tenant_id', '=', 't.id').on('f.user_id', '=', viewerUserId),
    )
    .select(['t.id as tenantId', 't.name', 't.slug', 'f.id as followId'])
    .where('t.public_board', '=', true)
    .orderBy('t.name', 'asc')
    .execute();

  return rows.map((r) => ({
    tenantId: r.tenantId,
    name: r.name,
    slug: r.slug,
    isFollowing: r.followId !== null,
  }));
}

/** Returns the org iff it has opted into public visibility, else null. */
export async function getPublicTenant(tenantId: string) {
  const row = await db
    .selectFrom('tenants')
    .select(['id', 'name', 'slug'])
    .where('id', '=', tenantId)
    .where('public_board', '=', true)
    .executeTakeFirst();
  return row ?? null;
}

/** Admin write: toggle this org's public board visibility. */
export async function setPublicBoard(tenantId: string, enabled: boolean): Promise<void> {
  await db
    .updateTable('tenants')
    .set({ public_board: enabled })
    .where('id', '=', tenantId)
    .execute();
}

/** Follow an org (idempotent via UNIQUE(user_id, tenant_id)). */
export async function followOrg(userId: string, tenantId: string): Promise<void> {
  await db
    .insertInto('org_follows')
    .values({ user_id: userId, tenant_id: tenantId })
    .onConflict((oc) => oc.columns(['user_id', 'tenant_id']).doNothing())
    .execute();
}

export async function unfollowOrg(userId: string, tenantId: string): Promise<void> {
  await db
    .deleteFrom('org_follows')
    .where('user_id', '=', userId)
    .where('tenant_id', '=', tenantId)
    .execute();
}

/** Orgs the user follows that are still public, for the board switcher. */
export async function listFollowedTenants(userId: string) {
  const rows = await db
    .selectFrom('org_follows as f')
    .innerJoin('tenants as t', 't.id', 'f.tenant_id')
    .select(['t.id as tenantId', 't.name', 't.slug'])
    .where('f.user_id', '=', userId)
    .where('t.public_board', '=', true)
    .orderBy('t.name', 'asc')
    .execute();

  return rows.map((r) => ({
    tenantId: r.tenantId,
    name: r.name,
    slug: r.slug,
    isFollowing: true as const,
  }));
}
