import { db } from '@/db/kysely/client';
import { BillWithInterns, InternWithBills, PendingProposal, PendingUser, SupervisorWithInterns } from '@/types/admin';

// ==============================================
// ADMIN DASHBOARD — DATA ACCESS
// ==============================================
// Pure Kysely query functions backing the admin server actions. Auth checks,
// ActionResult wrapping, and revalidatePath() stay in @/app/actions/admin;
// the query text here is the single source of truth. Most reads support a
// tenant-scoped branch and a legacy global branch.

// ---------- Reads ----------

/** Pending account requests (legacy/global only; tenants have no pending concept). */
export async function selectPendingRequests(excludeUserId: string): Promise<PendingUser[]> {
  return db.selectFrom('user')
    .select(['id', 'email', 'username', 'created_at', 'requested_admin', 'requested_supervisor', 'account_status'])
    .where('account_status', '=', 'pending')
    .where('id', '!=', excludeUserId) // Exclude current user (should never happen)
    .execute();
}

/** All active accounts — tenant members when tenant-scoped, else all active users. */
export async function selectAllAccounts(tenantId?: string): Promise<PendingUser[]> {
  if (tenantId) {
    // Tenant-scoped: get members of this tenant
    return db.selectFrom('user')
      .innerJoin('members', 'user.id', 'members.user_id')
      .select([
        'user.id', 'user.email', 'user.username', 'user.created_at',
        'user.requested_admin', 'user.requested_supervisor', 'user.account_status',
        'members.org_role as role'
      ])
      .where('members.tenant_id', '=', tenantId)
      .where('user.account_status', '=', 'active')
      .orderBy('user.created_at', 'desc')
      .execute();
  }

  // Legacy: all active users
  return db.selectFrom('user')
    .selectAll()
    .where('account_status', '=', 'active')
    .orderBy('created_at', 'desc')
    .execute();
}

/** Pending proposals with proposer + bill info, formatted for the admin view. */
export async function selectPendingProposals(tenantId?: string): Promise<PendingProposal[]> {
  let query = db
    .selectFrom('pending_proposals')
    .leftJoin('user as proposer', (join: any) =>
      join.onRef('pending_proposals.proposed_by_user_id', '=', 'proposer.id')
    )
    .leftJoin('bills', (join: any) =>
      join.onRef('pending_proposals.bill_id', '=', 'bills.id')
    )
    .selectAll('pending_proposals')
    .select([
      'proposer.username as proposer_username',
      'proposer.email as proposer_email',
      'proposer.role as proposer_role',
      'bills.bill_number',
      'bills.bill_title',
    ])
    .where('pending_proposals.approval_status', '=', 'pending');

  if (tenantId) {
    query = query.where('pending_proposals.tenant_id', '=', tenantId);
  }

  const proposals = await query.execute();

  return proposals.map((proposal) => ({
    ...proposal,
    bill_number: proposal.bill_number,
    bill_title: proposal.bill_title,
    proposer: {
      username: proposal.proposer_username,
      email: proposal.proposer_email,
      role: proposal.proposer_role,
    }
  }));
}

/** All interns with their adopted bills + supervisor info, aggregated. */
export async function selectAllInterns(tenantId?: string): Promise<InternWithBills[]> {
  let rows;
  if (tenantId) {
    // Tenant-scoped: workers in the tenant
    rows = await db
      .selectFrom('user')
      .innerJoin('members', 'user.id', 'members.user_id')
      .leftJoin('supervisor_users', 'user.id', 'supervisor_users.user_id')
      .leftJoin('user as supervisor', 'supervisor_users.supervisor_id', 'supervisor.id')
      .leftJoin('user_bills', (join) =>
        join.onRef('user.id', '=', 'user_bills.user_id')
          .on('user_bills.tenant_id', '=', tenantId)
      )
      .leftJoin('bills', 'user_bills.bill_id', 'bills.id')
      .select([
        'user.id',
        'user.email',
        'user.username',
        'user.created_at',
        'user.account_status',
        'supervisor.id as supervisor_id',
        'supervisor.email as supervisor_email',
        'supervisor.username as supervisor_username',
        'bills.id as bill_id',
        'bills.bill_number',
        'bills.bill_title',
        'bills.bill_status',
        'user_bills.adopted_at'
      ])
      .where('members.tenant_id', '=', tenantId)
      .where('members.org_role', '=', 'worker')
      .where('user.account_status', '!=', 'denied')
      .where('user.account_status', '!=', 'unverified')
      .orderBy('user.account_status', 'asc')
      .execute();
  } else {
    // Legacy: all interns by global role
    rows = await db
      .selectFrom('user')
      .leftJoin('supervisor_users', 'user.id', 'supervisor_users.user_id')
      .leftJoin('user as supervisor', 'supervisor_users.supervisor_id', 'supervisor.id')
      .leftJoin('user_bills', 'user.id', 'user_bills.user_id')
      .leftJoin('bills', 'user_bills.bill_id', 'bills.id')
      .select([
        'user.id',
        'user.email',
        'user.username',
        'user.created_at',
        'user.account_status',
        'supervisor.id as supervisor_id',
        'supervisor.email as supervisor_email',
        'supervisor.username as supervisor_username',
        'bills.id as bill_id',
        'bills.bill_number',
        'bills.bill_title',
        'bills.bill_status',
        'user_bills.adopted_at'
      ])
      .where('user.role', '=', 'user')
      .where('user.account_status', '!=', 'denied')
      .where('user.account_status', '!=', 'unverified')
      .orderBy('account_status', 'asc')
      .execute();
  }

  // Aggregate rows into nested structure
  const internMap = new Map<string, InternWithBills>();

  for (const row of rows) {
    if (!internMap.has(row.id)) {
      internMap.set(row.id, {
        id: row.id,
        email: row.email,
        username: row.username,
        created_at: row.created_at,
        account_status: row.account_status,
        supervisor_id: row.supervisor_id,
        supervisor_email: row.supervisor_email,
        supervisor_username: row.supervisor_username,
        adopted_bills: []
      });
    }

    if (row.bill_id) {
      internMap.get(row.id)!.adopted_bills.push({
        bill_id: row.bill_id,
        bill_number: row.bill_number,
        bill_title: row.bill_title,
        current_status: row.bill_status,
        adopted_at: row.adopted_at
      });
    }
  }

  return [...internMap.values()];
}

/** All supervisors with their adopted interns, aggregated. */
export async function selectAllSupervisors(tenantId?: string): Promise<SupervisorWithInterns[]> {
  let rows;
  if (tenantId) {
    // Tenant-scoped: supervisors are admin members in the tenant who have intern assignments
    // For backward compatibility, we still use supervisor_users table but filter by tenant membership
    rows = await db
      .selectFrom('user as supervisor')
      .innerJoin('members', 'supervisor.id', 'members.user_id')
      .leftJoin('supervisor_users', 'supervisor.id', 'supervisor_users.supervisor_id')
      .leftJoin('user as intern', 'supervisor_users.user_id', 'intern.id')
      .select([
        'supervisor.id as supervisor_id',
        'supervisor.email as supervisor_email',
        'supervisor.username as supervisor_username',
        'intern.id as intern_id',
        'intern.email as intern_email',
        'intern.username as intern_username',
        'supervisor_users.created_at as adopted_at'
      ])
      .where('members.tenant_id', '=', tenantId)
      .where('supervisor.account_status', '=', 'active')
      .execute();
  } else {
    // Legacy: supervisors by global role
    rows = await db
      .selectFrom('user as supervisor')
      .leftJoin('supervisor_users', 'supervisor.id', 'supervisor_users.supervisor_id')
      .leftJoin('user as intern', 'supervisor_users.user_id', 'intern.id')
      .select([
        'supervisor.id as supervisor_id',
        'supervisor.email as supervisor_email',
        'supervisor.username as supervisor_username',
        'intern.id as intern_id',
        'intern.email as intern_email',
        'intern.username as intern_username',
        'supervisor_users.created_at as adopted_at'
      ])
      .where('supervisor.role', '=', 'supervisor')
      .where('supervisor.account_status', '=', 'active')
      .execute();
  }

  // Aggregate into nested structure
  const supervisorMap = new Map<string, SupervisorWithInterns>();

  for (const row of rows) {
    if (!supervisorMap.has(row.supervisor_id)) {
      supervisorMap.set(row.supervisor_id, {
        supervisor_id: row.supervisor_id,
        supervisor_email: row.supervisor_email,
        supervisor_username: row.supervisor_username,
        interns: []
      });
    }

    if (row.intern_id) {
      supervisorMap.get(row.supervisor_id)!.interns.push({
        id: row.intern_id,
        email: row.intern_email!,
        username: row.intern_username!,
        adopted_at: row.adopted_at!
      });
    }
  }

  return [...supervisorMap.values()];
}

/** All bills with the interns tracking them, aggregated. */
export async function selectAllInternBills(tenantId?: string): Promise<BillWithInterns[]> {
  let rows;
  if (tenantId) {
    // Tenant-scoped: filter user_bills by tenant_id
    rows = await db
      .selectFrom('bills')
      .innerJoin('user_bills', 'bills.id', 'user_bills.bill_id')
      .leftJoin('user', 'user_bills.user_id', 'user.id')
      .select([
        'bills.id as bill_id',
        'bills.bill_number',
        'bills.bill_title',
        'bills.bill_status',
        'user.id as intern_id',
        'user.email as intern_email',
        'user.username as intern_username',
        'user_bills.adopted_at'
      ])
      .where('user_bills.tenant_id', '=', tenantId)
      .orderBy('bills.bill_number', 'asc')
      .execute();
  } else {
    // Legacy: all user_bills
    rows = await db
      .selectFrom('bills')
      .innerJoin('user_bills', 'bills.id', 'user_bills.bill_id')
      .leftJoin('user', 'user_bills.user_id', 'user.id')
      .select([
        'bills.id as bill_id',
        'bills.bill_number',
        'bills.bill_title',
        'bills.bill_status',
        'user.id as intern_id',
        'user.email as intern_email',
        'user.username as intern_username',
        'user_bills.adopted_at'
      ])
      .orderBy('bills.bill_number', 'asc')
      .execute();
  }

  // Aggregate into nested structure
  const billMap = new Map<string, BillWithInterns>();

  for (const row of rows) {
    if (!billMap.has(row.bill_id)) {
      billMap.set(row.bill_id, {
        bill_id: row.bill_id,
        bill_number: row.bill_number,
        bill_title: row.bill_title,
        current_status: row.bill_status,
        tracked_by: []
      });
    }

    if (row.intern_id) {
      billMap.get(row.bill_id)!.tracked_by.push({
        id: row.intern_id,
        email: row.intern_email!,
        username: row.intern_username!,
        adopted_at: row.adopted_at!
      });
    }
  }

  return [...billMap.values()];
}

/** All users for role management — tenant members or legacy global users. */
export async function selectAllActiveUsers(
  excludeUserId: string,
  includeArchived: boolean,
  tenantId?: string
): Promise<PendingUser[]> {
  if (tenantId) {
    // Tenant-scoped: get members of this tenant
    let query = db.selectFrom('user')
      .innerJoin('members', 'user.id', 'members.user_id')
      .select([
        'user.id', 'user.email', 'user.username', 'user.created_at',
        'user.requested_admin', 'user.requested_supervisor', 'user.account_status',
        'members.org_role as role'
      ])
      .where('members.tenant_id', '=', tenantId)
      .where('user.id', '!=', excludeUserId);

    if (includeArchived) {
      query = query.where('user.account_status', 'in', ['active', 'archived']);
    } else {
      query = query.where('user.account_status', '=', 'active');
    }

    return query
      .orderBy('user.account_status', 'asc')
      .orderBy('user.created_at', 'desc')
      .execute();
  }

  // Legacy: all users
  let query = db.selectFrom('user')
    .select(['id', 'email', 'username', 'created_at', 'requested_admin', 'requested_supervisor', 'account_status', 'role'])
    .where('id', '!=', excludeUserId); // Exclude current admin from the list

  if (includeArchived) {
    // Include both active and archived users
    query = query.where('account_status', 'in', ['active', 'archived']);
  } else {
    // Only active users
    query = query.where('account_status', '=', 'active');
  }

  return query
    .orderBy('account_status', 'asc') // Show active first
    .orderBy('created_at', 'desc')
    .execute();
}

// ---------- Mutations ----------

/** Looks up a pending user (to check their requested_admin flag before approval). */
export async function selectPendingUser(userId: string) {
  return db
    .selectFrom('user')
    .select(['id', 'requested_admin'])
    .where('id', '=', userId)
    .where('account_status', '=', 'pending')
    .executeTakeFirst();
}

/** Activates a pending user with the given role. */
export async function activateUser(userId: string, role: string): Promise<void> {
  await db.updateTable('user')
    .set({
      account_status: 'active',
      requested_admin: false, // reset
      role
    })
    .where('id', '=', userId)
    .where('account_status', '=', 'pending')
    .executeTakeFirst();
}

/** Denies a pending user. */
export async function denyPendingUser(userId: string): Promise<void> {
  await db.updateTable('user')
    .set({ account_status: 'denied', requested_admin: false })
    .where('id', '=', userId)
    .where('account_status', '=', 'pending')
    .executeTakeFirst();
}

/** Updates a member's org_role within a tenant. */
export async function updateMemberOrgRole(userId: string, tenantId: string, orgRole: 'admin' | 'worker'): Promise<void> {
  await db.updateTable('members')
    .set({ org_role: orgRole })
    .where('user_id', '=', userId)
    .where('tenant_id', '=', tenantId)
    .execute();
}

/** Looks up an active user's role/status (used before global role change). */
export async function selectActiveUserRole(userId: string) {
  return db.selectFrom('user')
    .select(['id', 'role', 'account_status'])
    .where('id', '=', userId)
    .where('account_status', '=', 'active')
    .executeTakeFirst();
}

/** Updates an active user's global role. */
export async function updateGlobalUserRole(userId: string, role: 'user' | 'supervisor' | 'admin'): Promise<void> {
  await db.updateTable('user')
    .set({ role })
    .where('id', '=', userId)
    .where('account_status', '=', 'active')
    .executeTakeFirst();
}

/** Looks up an active user's status (used before archiving). */
export async function selectActiveUserStatus(userId: string) {
  return db.selectFrom('user')
    .select(['id', 'account_status'])
    .where('id', '=', userId)
    .where('account_status', '=', 'active')
    .executeTakeFirst();
}

/** Archives an active user account. */
export async function archiveUser(userId: string): Promise<void> {
  await db.updateTable('user')
    .set({ account_status: 'archived' })
    .where('id', '=', userId)
    .where('account_status', '=', 'active')
    .executeTakeFirst();
}

/** Verifies a set of bills exist and are food-related. Returns the matching rows. */
export async function selectFoodRelatedBills(billIds: string[]) {
  return db
    .selectFrom('bills')
    .select(['id', 'bill_number', 'food_related'])
    .where('id', 'in', billIds)
    .where('food_related', '=', true)
    .execute();
}

/** Verifies a set of users exist and are active. Returns the matching rows. */
export async function selectActiveUsersByIds(userIds: string[]) {
  return db
    .selectFrom('user')
    .select(['id', 'username', 'account_status', 'role'])
    .where('id', 'in', userIds)
    .where('account_status', '=', 'active')
    .execute();
}

/** Existing user_bills assignments for the given bills+users (to skip duplicates). */
export async function selectExistingAssignments(billIds: string[], userIds: string[], tenantId?: string) {
  let query = db
    .selectFrom('user_bills')
    .select(['user_id', 'bill_id'])
    .where('bill_id', 'in', billIds)
    .where('user_id', 'in', userIds);

  if (tenantId) {
    query = query.where('tenant_id', '=', tenantId);
  }

  return query.execute();
}

/** Batch-inserts new user_bills assignments. */
export async function insertAssignments(
  assignments: Array<{ user_id: string; bill_id: string; tenant_id?: string }>
): Promise<void> {
  if (assignments.length === 0) return;
  await db
    .insertInto('user_bills')
    .values(assignments)
    .execute();
}

/** Looks up an active supervisor by id. */
export async function selectActiveSupervisor(supervisorId: string) {
  return db
    .selectFrom('user')
    .select(['id', 'role'])
    .where('id', '=', supervisorId)
    .where('role', '=', 'supervisor')
    .where('account_status', '=', 'active')
    .executeTakeFirst();
}

/** Looks up active interns (role 'user') by ids. */
export async function selectActiveInternsByIds(internIds: string[]) {
  return db
    .selectFrom('user')
    .select(['id', 'role'])
    .where('id', 'in', internIds)
    .where('role', '=', 'user')
    .where('account_status', '=', 'active')
    .execute();
}

/** Replaces an intern's supervisor relationship with the given supervisor. */
export async function setSupervisorForIntern(supervisorId: string, internId: string): Promise<void> {
  // Delete existing relationship
  await db
    .deleteFrom('supervisor_users')
    .where('user_id', '=', internId)
    .execute();

  // Create new relationship
  await db
    .insertInto('supervisor_users')
    .values({
      supervisor_id: supervisorId,
      user_id: internId,
    })
    .execute();
}

/** Looks up an intern (role 'user') by id. */
export async function selectInternById(internId: string) {
  return db
    .selectFrom('user')
    .select(['id', 'role'])
    .where('id', '=', internId)
    .where('role', '=', 'user')
    .executeTakeFirst();
}

/** Removes any supervisor relationship for an intern. */
export async function deleteSupervisorForIntern(internId: string): Promise<void> {
  await db
    .deleteFrom('supervisor_users')
    .where('user_id', '=', internId)
    .executeTakeFirst();
}

/** Looks up an active intern by id (used before removing a bill). */
export async function selectActiveInternById(internId: string) {
  return db
    .selectFrom('user')
    .select(['id', 'role'])
    .where('id', '=', internId)
    .where('role', '=', 'user')
    .where('account_status', '=', 'active')
    .executeTakeFirst();
}

/** Looks up a bill id (existence check). */
export async function selectBillId(billId: string) {
  return db
    .selectFrom('bills')
    .select(['id'])
    .where('id', '=', billId)
    .executeTakeFirst();
}

/** Checks whether an intern tracks a given bill. */
export async function selectAssignment(internId: string, billId: string, tenantId?: string) {
  let query = db
    .selectFrom('user_bills')
    .select(['user_id', 'bill_id'])
    .where('user_id', '=', internId)
    .where('bill_id', '=', billId);

  if (tenantId) {
    query = query.where('tenant_id', '=', tenantId);
  }

  return query.executeTakeFirst();
}

/** Removes a bill from an intern's tracking list. */
export async function deleteAssignment(internId: string, billId: string, tenantId?: string): Promise<void> {
  let query = db
    .deleteFrom('user_bills')
    .where('user_id', '=', internId)
    .where('bill_id', '=', billId);

  if (tenantId) {
    query = query.where('tenant_id', '=', tenantId);
  }

  await query.execute();
}
