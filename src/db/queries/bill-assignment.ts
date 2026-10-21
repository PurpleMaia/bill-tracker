'use server';

import type { Bill } from '@/types/legislation';
import { db } from '@/db/kysely/client';
import { BillStatus, User } from '@/db/types';
import { Selectable } from 'kysely';

// ==============================================
// BILL ASSIGN FUNCTIONS
// ==============================================

/**
 * Helper to validate if the assigner can assign bills to the target user.
 * Only admins and supervisors can assign bills.
 * Supervisors can only assign to their adopted interns.
 * Admins can assign to interns and supervisors.
 *
 * @param assignerId The ID of the user assigning the bill (must be admin or supervisor)
 * @param targetUserId The ID of the user to assign the bill to
 * @param billUrl The URL of the bill to assign
 * @returns The assigned Bill object
 */
async function validateAssignmentScope(assignerId: string, targetUserId: string, tenantId?: string) {
  const assigner = await db
    .selectFrom('user')
    .select(['id', 'role'])
    .where('id', '=', assignerId)
    .executeTakeFirst();

  if (!assigner) {
    throw new Error('Assigner not found');
  }

  // Check org-level role if tenantId is provided
  let orgRole: string | null = null;
  if (tenantId) {
    const membership = await db
      .selectFrom('members')
      .select('org_role')
      .where('user_id', '=', assignerId)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();
    orgRole = membership?.org_role ?? null;
  }

  const isAdmin = orgRole === 'admin' || assigner.role === 'admin';
  const isSupervisor = assigner.role === 'supervisor';

  if (!isAdmin && !isSupervisor) {
    throw new Error('Only admins and supervisors can assign bills');
  }

  const targetUser = await db
    .selectFrom('user')
    .select(['id', 'role'])
    .where('id', '=', targetUserId)
    .executeTakeFirst();

  if (!targetUser) {
    throw new Error('Target user not found');
  }

  if (isSupervisor && !isAdmin) {
    const adoptionRelation = await db
      .selectFrom('supervisor_users')
      .selectAll()
      .where('supervisor_id', '=', assignerId)
      .where('user_id', '=', targetUserId)
      .executeTakeFirst();

    if (!adoptionRelation) {
      throw new Error('Supervisors can only assign bills to their adopted interns');
    }
  }

  return { assigner, targetUser };
}

export async function assignBill(assignerId: string, targetUserId: string, bill: Bill, tenantId?: string) {
  try {
    await validateAssignmentScope(assignerId, targetUserId, tenantId);

    // Check if already tracked by target user
    const alreadyTracked = await db
      .selectFrom('user_bills')
      .selectAll()
      .where('user_id', '=', targetUserId)
      .where('bill_id', '=', bill.id)
      .execute();

    if (alreadyTracked && alreadyTracked.length > 0) {
      console.log('Bill already tracked by user', targetUserId.slice(0, 6), 'bill', bill.id.slice(0, 6));
      throw new Error('Bill already tracked by this user');
    }

    // Add the relation
    const relation = await db.insertInto('user_bills').values({
      user_id: targetUserId,
      bill_id: bill.id,
      adopted_at: new Date(),
      tenant_id: tenantId ?? null,
    })
    .returningAll()
    .executeTakeFirst();

    if (!relation) {
      throw new Error('Failed to assign bill to user');
    }

    // Create org_bills row if this is the first adoption in this org
    if (tenantId) {
      const existingOrgBill = await db
        .selectFrom('org_bills')
        .select('bill_id')
        .where('tenant_id', '=', tenantId)
        .where('bill_id', '=', bill.id)
        .executeTakeFirst();

      if (!existingOrgBill) {
        const billData = await db.selectFrom('bills')
          .select('ai_status')
          .where('id', '=', bill.id)
          .executeTakeFirst();

        await db.insertInto('org_bills').values({
          tenant_id: tenantId,
          bill_id: bill.id,
          bill_status: (billData?.ai_status as BillStatus) ?? 'unassigned',
        }).execute();
      }
    }

    // Get user info for tracker object
    const trackerUser = await db
      .selectFrom('user')
      .innerJoin('user_bills', 'user.id', 'user_bills.user_id')
      .select(['user.id', 'email', 'username', 'user_bills.adopted_at'])
      .where('user.id', '=', targetUserId)
      .executeTakeFirst();

    if (!trackerUser) {
      throw new Error('Failed to find user for tracker object');
    }

    return {
      id: trackerUser.id,
      email: trackerUser.email,
      username: trackerUser.username,
      adopted_at: trackerUser.adopted_at,
    };
  } catch (error) {
    console.error('Failed to assign bill:', error);
    throw error;
  }
}

export async function unassignBillFromUser(assignerId: string, targetUserId: string, billId: string, tenantId?: string) {
  try {
    await validateAssignmentScope(assignerId, targetUserId, tenantId);

    const deleted = await db
      .deleteFrom('user_bills')
      .where('user_id', '=', targetUserId)
      .where('bill_id', '=', billId)
      .executeTakeFirst();

    return !!deleted;
  } catch (error) {
    console.error('Failed to unassign bill:', error);
    throw error;
  }
}

/**
 * Gets the list of users that the current user can assign bills to.
 * Admins can assign to all interns and supervisors.
 * Supervisors can only assign to their adopted interns.
 *
 * @param userId The ID of the user requesting assignable users
 * @returns Array of users that can be assigned bills
 */
export async function getAssignableUsers(userId: string, tenantId?: string): Promise<Selectable<User>[]> {
  try {
    // Get user info
    const user = await db
      .selectFrom('user')
      .select(['id', 'role'])
      .where('id', '=', userId)
      .executeTakeFirst();

    if (!user) {
      throw new Error('User not found');
    }

    // Check org-level role if tenantId is provided
    let orgRole: string | null = null;
    if (tenantId) {
      const membership = await db
        .selectFrom('members')
        .select('org_role')
        .where('user_id', '=', userId)
        .where('tenant_id', '=', tenantId)
        .executeTakeFirst();
      orgRole = membership?.org_role ?? null;
    }

    const isAdmin = orgRole === 'admin' || user.role === 'admin';
    const isSupervisor = user.role === 'supervisor';

    if (isAdmin) {
      if (tenantId) {
        // Tenant-scoped: join members to get org role
        const rows = await db
          .selectFrom('user')
          .innerJoin('members', (join) =>
            join.onRef('members.user_id', '=', 'user.id').on('members.tenant_id', '=', tenantId)
          )
          .selectAll('user')
          .select('members.org_role')
          .where('user.account_status', '=', 'active')
          .orderBy('user.username', 'asc')
          .execute();

        // Override legacy role field with org role so the UI displays correctly
        return rows.map((r) => ({ ...r, role: r.org_role }));
      }

      // No tenant — return all active users with legacy roles
      return await db
        .selectFrom('user')
        .selectAll()
        .where('account_status', '=', 'active')
        .orderBy('username', 'asc')
        .execute();
    } else if (isSupervisor) {
      // Supervisors can only assign to their adopted interns
      const supervisorRelations = await db
        .selectFrom('supervisor_users')
        .select(['user_id'])
        .where('supervisor_id', '=', userId)
        .execute();

      const internIds = supervisorRelations.map((rel) => rel.user_id);

      if (internIds.length === 0) {
        return [];
      }

      const users = await db
        .selectFrom('user')
        .selectAll()
        .where('id', 'in', internIds)
        .where('account_status', '=', 'active')
        .orderBy('username', 'asc')
        .execute();

      return users;
    } else {
      throw new Error('Only admins and supervisors can assign bills');
    }
  } catch (error) {
    console.error('Failed to get assignable users:', error);
    throw error;
  }
}
