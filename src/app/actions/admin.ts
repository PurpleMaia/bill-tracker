'use server';

import { db } from '@/db/kysely/client';
import { auth } from '@/lib/auth';
import { Errors } from '@/lib/errors';
import { BillWithInterns, InternWithBills, PendingProposal, PendingUser, SupervisorWithInterns } from '@/types/admin';
import { User } from '@/types/user';
import { revalidatePath } from 'next/cache';
import { validateMembership } from '@/db/queries/tenants';

interface ActionResult<T = void> {
  success: boolean;
  error?: string;
  data?: T;
}

// Helper to verify admin access
async function verifyAdminAccess(tenantId?: string): Promise<{ userId: string; tenantId?: string }> {
  const session = await auth();

  if (!session) throw Errors.NO_SESSION_COOKIE;

  if (tenantId) {
    // Tenant-scoped: validate org admin via membership
    const orgRole = await validateMembership(session.user.id, tenantId);
    if (orgRole !== 'admin') {
      throw Errors.UNAUTHORIZED;
    }
    return { userId: session.user.id, tenantId };
  }

  // Legacy fallback: check global role
  if (session.user.role !== 'admin') {
    throw Errors.UNAUTHORIZED;
  }

  const userId = session.user.id;

  return { userId };
}

// ============================================
// FETCH ACTIONS
// ============================================

export async function getPendingRequests(tenantId?: string): Promise<ActionResult<PendingUser[]>> {
  try {
    console.log('🔍 [PENDING REQUESTS] Verifying admin access...');
    const admin = await verifyAdminAccess(tenantId);

    if (tenantId) {
      // Tenant-scoped: no pending requests concept (accounts are active by default)
      console.log('📋 [PENDING REQUESTS] Tenant-scoped: returning empty pending requests');
      return { success: true, data: [] };
    }

    console.log('📋 [PENDING REQUESTS] Loading pending user account requests');

    const pendingRequests: PendingUser[] = await db.selectFrom('user')
      .select(['id', 'email', 'username', 'created_at', 'requested_admin', 'requested_supervisor', 'account_status'])
      .where('account_status', '=', 'pending')
      .where('id', '!=', admin.userId) // Exclude current user (should never happen)
      .execute();

    console.log(`✅ [PENDING REQUESTS] Successfully loaded ${pendingRequests.length} pending requests`);

    return { success: true, data: pendingRequests };
  } catch (error) {
    console.error('❌ [PENDING REQUESTS] Error fetching pending requests:', error);
    return { success: false, error: 'Failed to fetch pending requests' };
  }
}

export async function getAllAccounts(tenantId?: string): Promise<ActionResult<PendingUser[]>> {
  try {
    console.log('🔍 [ALL ACCOUNTS] Verifying admin access...')
    await verifyAdminAccess(tenantId);

    console.log('📋 [ALL ACCOUNTS] Loading all active user accounts')

    let activeUsers: PendingUser[];
    if (tenantId) {
      // Tenant-scoped: get members of this tenant
      activeUsers = await db.selectFrom('user')
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
    } else {
      // Legacy: all active users
      activeUsers = await db.selectFrom('user')
        .selectAll()
        .where('account_status', '=', 'active')
        .orderBy('created_at', 'desc')
        .execute();
    }

    console.log(`✅ [ALL ACCOUNTS] Successfully loaded ${activeUsers.length} active accounts`);

    return { success: true, data: activeUsers };
  } catch (error) {
    console.error('❌ [ALL ACCOUNTS] Error fetching all accounts:', error);
    return { success: false, error: 'Failed to fetch all accounts' };
  }
}

// NOTE will be available to all not just admin
export async function getPendingProposals(tenantId?: string): Promise<ActionResult<PendingProposal[]>> {
  try {
    console.log('🔍 [PENDING REQUESTS] Verifying admin access...');

    await verifyAdminAccess(tenantId);

    console.log('📋 [PENDING PROPOSALS] Admin loading all pending proposals...');
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

    const formattedProposals = proposals.map((proposal) => ({
      ...proposal,
      bill_number: proposal.bill_number,
      bill_title: proposal.bill_title,
      proposer: {
        username: proposal.proposer_username,
        email: proposal.proposer_email,
        role: proposal.proposer_role,
      }
    }));

    console.log(`✅ [PENDING PROPOSALS] Admin found ${proposals.length} pending proposals`);

    return { success: true, data: formattedProposals };
  } catch (error) {
    console.error('Error fetching pending proposals:', error);
    return { success: false, error: 'Failed to fetch pending proposals' };
  }
}

export async function getAllInterns(tenantId?: string): Promise<ActionResult<InternWithBills[]>> {
  try {
    console.log('🔍 [PENDING REQUESTS] Verifying admin access...');

    await verifyAdminAccess(tenantId);

    // Get all interns (users with role 'user') or workers in tenant
    console.log('📋 [ALL INTERNS] Loading all interns with bills...');

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

    const internsWithDetails = [...internMap.values()];

    console.log(`✅ [ALL INTERNS] Successfully compiled intern details with bills and supervisors`);

    return { success: true, data: internsWithDetails };
  } catch (error) {
    console.error('❌ [ALL INTERNS] Error fetching all interns:', error);
    return { success: false, error: 'Failed to fetch all interns' };
  }
}

export async function getAllSupervisors(tenantId?: string): Promise<ActionResult<SupervisorWithInterns[]>> {
  try {
    console.log('🔍 [PENDING REQUESTS] Verifying admin access...');

    await verifyAdminAccess(tenantId);

    console.log('📋 [ALL SUPERVISORS] Loading all supervisors with interns...');

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

  const supervisors = [...supervisorMap.values()];

    console.log(`✅ [ALL SUPERVISORS] Successfully compiled supervisor-intern relationships`);

  return { success: true, data: supervisors };
  } catch (error) {
    console.error('❌ [ALL SUPERVISORS] Error fetching supervisor relationships:', error);
    return { success: false, error: 'Failed to fetch supervisor relationships' };
  }
}

export async function getAllInternBills(tenantId?: string): Promise<ActionResult<BillWithInterns[]>> {
  try {
    await verifyAdminAccess(tenantId);

    console.log('📋 [ALL INTERN BILLS] Loading all bills tracked by users...');

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

    const billsWithInterns = [...billMap.values()];

    console.log(`✅ [ALL INTERN BILLS] Successfully compiled bills tracked by interns`);

    return { success: true, data: billsWithInterns };
  } catch (error) {
    console.error('❌ [ALL INTERN BILLS] Error fetching all intern bills:', error);
    return { success: false, error: 'Failed to fetch all intern bills' };
  }
}

// ============================================
// MUTATION ACTIONS
// ============================================

export async function approveUser(userId: string, role: string, tenantId?: string): Promise<ActionResult> {
  try {
    await verifyAdminAccess(tenantId);

    if (!userId) {
      return { success: false, error: 'User ID is required' };
    }
    console.log('📋 [APPROVING ACCOUNT REQUEST] Approving user account request...');


    // First, get the user to check if they requested admin access
    const user = await db
      .selectFrom('user')
      .select(['id', 'requested_admin'])
      .where('id', '=', userId)
      .where('account_status', '=', 'pending')
      .executeTakeFirst();

    if (!user) {
      throw new Error('User not found or not pending');
    }

    await db.updateTable('user')
      .set({
        account_status: 'active',
        requested_admin: false, // reset
        role
      })
      .where('id', '=', userId)
      .where('account_status', '=', 'pending')
      .executeTakeFirst();

    console.log(`✅ [APPROVING ACCOUNT REQUEST] Approved user ${userId} with role ${role}`);

    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('❌ [APPROVING ACCOUNT REQUEST] Error approving user:', error);
    return { success: false, error: 'Failed to approve user' };
  }
}

export async function denyUser(userId: string, tenantId?: string): Promise<ActionResult> {
  try {
    await verifyAdminAccess(tenantId);

    if (!userId) {
      return { success: false, error: 'User ID is required' };
    }

    console.log('📋 [DENYING ACCOUNT REQUEST] Denying user account request...');

    await db.updateTable('user')
      .set({ account_status: 'denied', requested_admin: false })
      .where('id', '=', userId)
      .where('account_status', '=', 'pending')
      .executeTakeFirst();

    revalidatePath('/admin');

    console.log(`✅ [DENYING ACCOUNT REQUEST] Denied user ${userId}`);
    return { success: true };
  } catch (error) {
    console.error('❌ [DENYING ACCOUNT REQUEST] Error denying user:', error);
    return { success: false, error: 'Failed to deny user' };
  }
}

// Get all active users for role management
export async function getAllActiveUsers(includeArchived: boolean = false, tenantId?: string): Promise<ActionResult<PendingUser[]>> {
  try {
    console.log('🔍 [ALL USERS] Verifying admin access...');
    const admin = await verifyAdminAccess(tenantId);

    console.log(`📋 [ALL USERS] Loading ${includeArchived ? 'all' : 'active'} users`);

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
        .where('user.id', '!=', admin.userId);

      if (includeArchived) {
        query = query.where('user.account_status', 'in', ['active', 'archived']);
      } else {
        query = query.where('user.account_status', '=', 'active');
      }

      const users: PendingUser[] = await query
        .orderBy('user.account_status', 'asc')
        .orderBy('user.created_at', 'desc')
        .execute();

      console.log(`✅ [ALL USERS] Successfully loaded ${users.length} users`);
      return { success: true, data: users };
    }

    // Legacy: all users
    let query = db.selectFrom('user')
      .select(['id', 'email', 'username', 'created_at', 'requested_admin', 'requested_supervisor', 'account_status', 'role'])
      .where('id', '!=', admin.userId); // Exclude current admin from the list

    if (includeArchived) {
      // Include both active and archived users
      query = query.where('account_status', 'in', ['active', 'archived']);
    } else {
      // Only active users
      query = query.where('account_status', '=', 'active');
    }

    const users: PendingUser[] = await query
      .orderBy('account_status', 'asc') // Show active first
      .orderBy('created_at', 'desc')
      .execute();

    console.log(`✅ [ALL USERS] Successfully loaded ${users.length} users`);

    return { success: true, data: users };
  } catch (error) {
    console.error('❌ [ALL USERS] Error fetching users:', error);
    return { success: false, error: 'Failed to fetch users' };
  }
}

// Update user role (admin only)
export async function updateUserRole(userId: string, newRole: string, tenantId?: string): Promise<ActionResult> {
  try {
    console.log(`🔍 [UPDATE ROLE] Verifying admin access...`);
    const admin = await verifyAdminAccess(tenantId);

    // Prevent admin from changing their own role
    if (userId === admin.userId) {
      return { success: false, error: 'Cannot change your own role' };
    }

    if (tenantId) {
      // Tenant-scoped: validate org roles
      const validOrgRoles = ['admin', 'worker'];
      if (!validOrgRoles.includes(newRole)) {
        return { success: false, error: 'Invalid role specified' };
      }

      console.log(`📋 [UPDATE ROLE] Updating member ${userId} to org_role: ${newRole} in tenant ${tenantId}`);

      // Update the member's org_role
      await db.updateTable('members')
        .set({ org_role: newRole as 'admin' | 'worker' })
        .where('user_id', '=', userId)
        .where('tenant_id', '=', tenantId)
        .execute();

      revalidatePath('/admin');

      console.log(`✅ [UPDATE ROLE] Successfully updated member ${userId} to org_role ${newRole}`);
      return { success: true };
    }

    // Legacy: validate global roles
    const validRoles = ['user', 'supervisor', 'admin'];
    if (!validRoles.includes(newRole)) {
      return { success: false, error: 'Invalid role specified' };
    }

    console.log(`📋 [UPDATE ROLE] Updating user ${userId} to role: ${newRole}`);

    // Verify user exists and is active
    const user = await db.selectFrom('user')
      .select(['id', 'role', 'account_status'])
      .where('id', '=', userId)
      .where('account_status', '=', 'active')
      .executeTakeFirst();

    if (!user) {
      return { success: false, error: 'User not found or not active' };
    }

    // Update the user's role
    await db.updateTable('user')
      .set({ role: newRole as 'user' | 'supervisor' | 'admin' })
      .where('id', '=', userId)
      .where('account_status', '=', 'active')
      .executeTakeFirst();

    revalidatePath('/admin');

    console.log(`✅ [UPDATE ROLE] Successfully updated user ${userId} from ${user.role} to ${newRole}`);
    return { success: true };
  } catch (error) {
    console.error('❌ [UPDATE ROLE] Error updating user role:', error);
    return { success: false, error: 'Failed to update user role' };
  }
}

// Archive user account (admin only)
export async function archiveAccount(userId: string, tenantId?: string): Promise<ActionResult> {
  try {
    console.log(`🔍 [ARCHIVE ACCOUNT] Verifying admin access...`);
    const admin = await verifyAdminAccess(tenantId);

    // Prevent admin from archiving their own account
    if (userId === admin.userId) {
      return { success: false, error: 'Cannot archive your own account' };
    }

    console.log(`📋 [ARCHIVE ACCOUNT] Archiving user ${userId}...`);

    // Verify user exists and is active
    const user = await db.selectFrom('user')
      .select(['id', 'account_status'])
      .where('id', '=', userId)
      .where('account_status', '=', 'active')
      .executeTakeFirst();

    if (!user) {
      return { success: false, error: 'User not found or not active' };
    }

    // Update the user's account status to archived
    await db.updateTable('user')
      .set({ account_status: 'archived' })
      .where('id', '=', userId)
      .where('account_status', '=', 'active')
      .executeTakeFirst();

    revalidatePath('/admin');

    console.log(`✅ [ARCHIVE ACCOUNT] Successfully archived user ${userId}`);
    return { success: true };
  } catch (error) {
    console.error('❌ [ARCHIVE ACCOUNT] Error archiving user:', error);
    return { success: false, error: 'Failed to archive user account' };
  }
}

// Assign multiple bills to multiple users (admin only)
export async function assignMultipleBillsToUsers(
  billIds: string[],
  userIds: string[],
  tenantId?: string
): Promise<ActionResult<{ assignmentsCreated: number }>> {
  try {
    console.log(`🔍 [ASSIGN MULTIPLE BILLS] Verifying admin access...`);
    await verifyAdminAccess(tenantId);

    // Validate inputs
    if (!billIds || billIds.length === 0) {
      return { success: false, error: 'At least one bill ID is required' };
    }

    if (!userIds || userIds.length === 0) {
      return { success: false, error: 'At least one user ID is required' };
    }

    console.log(`📋 [ASSIGN MULTIPLE BILLS] Assigning ${billIds.length} bill(s) to ${userIds.length} user(s)...`);

    // Verify all bills exist and are food-related
    const bills = await db
      .selectFrom('bills')
      .select(['id', 'bill_number', 'food_related'])
      .where('id', 'in', billIds)
      .where('food_related', '=', true)
      .execute();

    if (bills.length !== billIds.length) {
      return { success: false, error: 'Some bills not found or are not food-related' };
    }

    // Verify all users exist and are active
    const users = await db
      .selectFrom('user')
      .select(['id', 'username', 'account_status', 'role'])
      .where('id', 'in', userIds)
      .where('account_status', '=', 'active')
      .execute();

    if (users.length !== userIds.length) {
      return { success: false, error: 'Some users not found or are not active' };
    }

    // Get existing assignments to avoid duplicates
    let existingQuery = db
      .selectFrom('user_bills')
      .select(['user_id', 'bill_id'])
      .where('bill_id', 'in', billIds)
      .where('user_id', 'in', userIds);

    if (tenantId) {
      existingQuery = existingQuery.where('tenant_id', '=', tenantId);
    }

    const existingAssignments = await existingQuery.execute();

    const existingSet = new Set(
      existingAssignments.map(a => `${a.user_id}-${a.bill_id}`)
    );

    // Create new assignments
    const newAssignments = [];
    for (const userId of userIds) {
      for (const billId of billIds) {
        const key = `${userId}-${billId}`;
        if (!existingSet.has(key)) {
          newAssignments.push({
            user_id: userId,
            bill_id: billId,
            ...(tenantId ? { tenant_id: tenantId } : {}),
          });
        }
      }
    }

    // Batch insert new assignments
    let assignmentsCreated = 0;
    if (newAssignments.length > 0) {
      await db
        .insertInto('user_bills')
        .values(newAssignments)
        .execute();
      assignmentsCreated = newAssignments.length;
    }

    revalidatePath('/admin');

    console.log(`✅ [ASSIGN MULTIPLE BILLS] Created ${assignmentsCreated} new assignments (${existingAssignments.length} already existed)`);
    return { success: true, data: { assignmentsCreated } };
  } catch (error) {
    console.error('❌ [ASSIGN MULTIPLE BILLS] Error assigning bills:', error);
    return { success: false, error: 'Failed to assign bills to users' };
  }
}

export async function assignSupervisorToIntern(
  supervisorId: string,
  internIds: string[],
  tenantId?: string
): Promise<ActionResult> {
  try {
    await verifyAdminAccess(tenantId);

    if (!supervisorId) {
      return { success: false, error: 'Supervisor ID is required' };
    }

    if (!internIds || internIds.length === 0) {
      return { success: false, error: 'At least one intern ID is required' };
    }

    console.log(`📋 [ASSIGN SUPERVISOR] Assigning ${internIds.length} intern(s) to supervisor ${supervisorId}...`);

    // Verify supervisor exists and has role 'supervisor'
    const supervisor = await db
      .selectFrom('user')
      .select(['id', 'role'])
      .where('id', '=', supervisorId)
      .where('role', '=', 'supervisor')
      .where('account_status', '=', 'active')
      .executeTakeFirst();

    if (!supervisor) {
      return { success: false, error: 'Invalid supervisor or supervisor not active' };
    }

    // Verify all interns exist and have role 'user'
    const interns = await db
      .selectFrom('user')
      .select(['id', 'role'])
      .where('id', 'in', internIds)
      .where('role', '=', 'user')
      .where('account_status', '=', 'active')
      .execute();

    if (interns.length !== internIds.length) {
      return { success: false, error: 'One or more invalid intern IDs or interns not active' };
    }

    // For each intern, remove existing supervisor relationship (if any) and create new one
    for (const internId of internIds) {
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

    console.log(`✅ [ASSIGN SUPERVISOR] Successfully assigned ${internIds.length} intern(s) to supervisor ${supervisorId}`);

    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('❌ [ASSIGN SUPERVISOR] Error assigning supervisor to intern:', error);
    return { success: false, error: 'Failed to assign supervisor to intern' };
  }
}

export async function unassignInternFromSupervisor(internId: string, tenantId?: string): Promise<ActionResult> {
  try {
    await verifyAdminAccess(tenantId);

    if (!internId) {
      return { success: false, error: 'Intern ID is required' };
    }

    console.log(`📋 [UNASSIGN SUPERVISOR] Removing supervisor assignment for intern ${internId}...`);

    // Verify intern exists
    const intern = await db
      .selectFrom('user')
      .select(['id', 'role'])
      .where('id', '=', internId)
      .where('role', '=', 'user')
      .executeTakeFirst();

    if (!intern) {
      return { success: false, error: 'Invalid intern ID' };
    }

    // Delete supervisor relationship
    const result = await db
      .deleteFrom('supervisor_users')
      .where('user_id', '=', internId)
      .executeTakeFirst();

    console.log(`✅ [UNASSIGN SUPERVISOR] Successfully removed supervisor assignment for intern ${internId}`);

    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('❌ [UNASSIGN SUPERVISOR] Error unassigning supervisor from intern:', error);
    return { success: false, error: 'Failed to unassign supervisor from intern' };
  }
}

export async function removeBillFromIntern(
  internId: string,
  billId: string,
  tenantId?: string
): Promise<ActionResult> {
  try {
    await verifyAdminAccess(tenantId);

    if (!internId) {
      return { success: false, error: 'Intern ID is required' };
    }

    if (!billId) {
      return { success: false, error: 'Bill ID is required' };
    }

    console.log(`📋 [REMOVE BILL] Removing bill ${billId} from intern ${internId}...`);

    // Verify intern exists
    const intern = await db
      .selectFrom('user')
      .select(['id', 'role'])
      .where('id', '=', internId)
      .where('role', '=', 'user')
      .where('account_status', '=', 'active')
      .executeTakeFirst();

    if (!intern) {
      return { success: false, error: 'Invalid intern ID or intern not active' };
    }

    // Verify bill exists
    const bill = await db
      .selectFrom('bills')
      .select(['id'])
      .where('id', '=', billId)
      .executeTakeFirst();

    if (!bill) {
      return { success: false, error: 'Invalid bill ID' };
    }

    // Verify the relationship exists
    let relationshipQuery = db
      .selectFrom('user_bills')
      .select(['user_id', 'bill_id'])
      .where('user_id', '=', internId)
      .where('bill_id', '=', billId);

    if (tenantId) {
      relationshipQuery = relationshipQuery.where('tenant_id', '=', tenantId);
    }

    const relationship = await relationshipQuery.executeTakeFirst();

    if (!relationship) {
      return { success: false, error: 'Bill is not tracked by this intern' };
    }

    // Remove the bill from the intern's tracking list
    let deleteQuery = db
      .deleteFrom('user_bills')
      .where('user_id', '=', internId)
      .where('bill_id', '=', billId);

    if (tenantId) {
      deleteQuery = deleteQuery.where('tenant_id', '=', tenantId);
    }

    await deleteQuery.execute();

    console.log(`✅ [REMOVE BILL] Successfully removed bill ${billId} from intern ${internId}`);

    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('❌ [REMOVE BILL] Error removing bill from intern:', error);
    return { success: false, error: 'Failed to remove bill from intern' };
  }
}