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
    .select((eb) => [
      't.id as tenantId',
      't.name',
      't.slug',
      't.description',
      'f.id as followId',
      // How many users follow this org.
      eb
        .selectFrom('org_follows as fc')
        .whereRef('fc.tenant_id', '=', 't.id')
        .select(eb.fn.countAll<string>().as('c'))
        .as('followerCount'),
      // How many distinct bills anyone in this org tracks (its board size).
      eb
        .selectFrom('user_bills as ub')
        .whereRef('ub.tenant_id', '=', 't.id')
        .select((eb2) => eb2.fn.count<string>('ub.bill_id').distinct().as('c'))
        .as('billCount'),
    ])
    .where('t.public_board', '=', true)
    .orderBy('t.name', 'asc')
    .execute();

  const samples = await getSampleBillsForTenants(rows.map((r) => r.tenantId));

  return rows.map((r) => ({
    tenantId: r.tenantId,
    name: r.name,
    slug: r.slug,
    description: r.description,
    isFollowing: r.followId !== null,
    followerCount: Number(r.followerCount ?? 0),
    billCount: Number(r.billCount ?? 0),
    sampleBills: samples.get(r.tenantId) ?? [],
  }));
}

/**
 * For each given tenant, the 3 most-recently-updated distinct bills anyone in
 * that org tracks. Batched (one query) and keyed by tenant for the Browse card
 * preview. Uses a window function to take the top 3 per tenant.
 */
async function getSampleBillsForTenants(
  tenantIds: string[],
): Promise<Map<string, { id: string; billNumber: string | null; billTitle: string | null }[]>> {
  const out = new Map<string, { id: string; billNumber: string | null; billTitle: string | null }[]>();
  if (tenantIds.length === 0) return out;

  const ranked = db
    .selectFrom('user_bills as ub')
    .innerJoin('bills as b', 'b.id', 'ub.bill_id')
    .where('ub.tenant_id', 'in', tenantIds)
    .where('b.archived', '=', false)
    .select((eb) => [
      'ub.tenant_id as tenantId',
      'b.id as billId',
      'b.bill_number as billNumber',
      'b.bill_title as billTitle',
      'b.updated_at as updatedAt',
      eb.fn
        .agg<number>('row_number')
        .over((ob) =>
          ob
            .partitionBy('ub.tenant_id')
            // DISTINCT bill per tenant: partition also by bill so duplicate
            // adoptions of the same bill don't each consume a slot.
            .partitionBy('b.id')
            .orderBy('b.updated_at', 'desc'),
        )
        .as('dupRank'),
    ])
    .as('r');

  // First collapse to one row per (tenant, bill) via dupRank = 1, then rank
  // those distinct bills per tenant and keep the top 3.
  const rows = await db
    .selectFrom(ranked)
    .where('r.dupRank', '=', 1)
    .select((eb) => [
      'r.tenantId',
      'r.billId',
      'r.billNumber',
      'r.billTitle',
      eb.fn
        .agg<number>('row_number')
        .over((ob) => ob.partitionBy('r.tenantId').orderBy('r.updatedAt', 'desc'))
        .as('rank'),
    ])
    .execute();

  for (const row of rows) {
    // tenant_id is filtered to the non-null tenantIds above; guard for the type.
    if (row.tenantId === null || Number(row.rank) > 3) continue;
    const list = out.get(row.tenantId) ?? [];
    list.push({ id: row.billId, billNumber: row.billNumber, billTitle: row.billTitle });
    out.set(row.tenantId, list);
  }
  return out;
}

/**
 * Stats for one org the viewer is a member of, for the "Your Organization" card
 * on the Browse page. Same shape as listPublicTenants, but scoped to a single
 * tenant and NOT gated on public_board — a member of a private org still sees
 * their own stats. Caller must have verified membership.
 */
export async function getMyOrgStats(tenantId: string, viewerUserId: string) {
  const row = await db
    .selectFrom('tenants as t')
    .leftJoin('org_follows as f', (join) =>
      join.onRef('f.tenant_id', '=', 't.id').on('f.user_id', '=', viewerUserId),
    )
    .select((eb) => [
      't.id as tenantId',
      't.name',
      't.slug',
      't.description',
      't.public_board as publicBoard',
      'f.id as followId',
      eb
        .selectFrom('org_follows as fc')
        .whereRef('fc.tenant_id', '=', 't.id')
        .select(eb.fn.countAll<string>().as('c'))
        .as('followerCount'),
      eb
        .selectFrom('user_bills as ub')
        .whereRef('ub.tenant_id', '=', 't.id')
        .select((eb2) => eb2.fn.count<string>('ub.bill_id').distinct().as('c'))
        .as('billCount'),
    ])
    .where('t.id', '=', tenantId)
    .executeTakeFirst();

  if (!row) return null;

  const samples = await getSampleBillsForTenants([tenantId]);

  return {
    tenantId: row.tenantId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    publicBoard: row.publicBoard,
    isFollowing: row.followId !== null,
    followerCount: Number(row.followerCount ?? 0),
    billCount: Number(row.billCount ?? 0),
    sampleBills: samples.get(tenantId) ?? [],
  };
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

/** Admin write: set this org's public Browse-Orgs description. */
export async function setTenantDescription(tenantId: string, description: string): Promise<void> {
  await db
    .updateTable('tenants')
    .set({ description })
    .where('id', '=', tenantId)
    .execute();
}

/** Admin read: current public board visibility + description for the Org Settings dialog. */
export async function getTenantSettings(
  tenantId: string,
): Promise<{ publicBoard: boolean; description: string }> {
  const row = await db
    .selectFrom('tenants')
    .select(['public_board', 'description'])
    .where('id', '=', tenantId)
    .executeTakeFirst();
  return { publicBoard: row?.public_board ?? false, description: row?.description ?? '' };
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
    .select((eb) => [
      't.id as tenantId',
      't.name',
      't.slug',
      't.description',
      eb
        .selectFrom('org_follows as fc')
        .whereRef('fc.tenant_id', '=', 't.id')
        .select(eb.fn.countAll<string>().as('c'))
        .as('followerCount'),
      eb
        .selectFrom('user_bills as ub')
        .whereRef('ub.tenant_id', '=', 't.id')
        .select((eb2) => eb2.fn.count<string>('ub.bill_id').distinct().as('c'))
        .as('billCount'),
    ])
    .where('f.user_id', '=', userId)
    .where('t.public_board', '=', true)
    .orderBy('t.name', 'asc')
    .execute();

  return rows.map((r) => ({
    tenantId: r.tenantId,
    name: r.name,
    slug: r.slug,
    description: r.description,
    isFollowing: true as const,
    followerCount: Number(r.followerCount ?? 0),
    billCount: Number(r.billCount ?? 0),
    // The switcher dropdown (sole consumer) doesn't render bill previews, so
    // skip the extra sample-bills query here.
    sampleBills: [],
  }));
}
