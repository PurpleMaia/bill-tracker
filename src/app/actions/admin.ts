'use server';

import { BillWithInterns, InternWithBills, PendingProposal, PendingUser, SupervisorWithInterns } from '@/types/admin';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/auth-guards';
import * as adminQueries from '@/db/queries/admin';

interface ActionResult<T = void> {
  success: boolean;
  error?: string;
  data?: T;
}

// Admin auth now lives in the shared requireAdmin guard (@/lib/auth-guards),
// which enforces org-admin when tenant-scoped and legacy global-admin otherwise.
// Returns the admin's user id for the few actions that exclude self.
async function verifyAdminAccess(tenantId?: string): Promise<{ userId: string; tenantId?: string }> {
  const { user } = await requireAdmin.fromAction(tenantId);
  return { userId: user.id, tenantId };
}

// ============================================
// FETCH ACTIONS
// ============================================

export async function getPendingRequests(tenantId?: string): Promise<ActionResult<PendingUser[]>> {
  try {
    const admin = await verifyAdminAccess(tenantId);

    if (tenantId) {
      // Tenant-scoped: no pending requests concept (accounts are active by default)
      return { success: true, data: [] };
    }

    const pendingRequests = await adminQueries.selectPendingRequests(admin.userId);
    return { success: true, data: pendingRequests };
  } catch (error) {
    console.error('❌ [PENDING REQUESTS] Error fetching pending requests:', error);
    return { success: false, error: 'Failed to fetch pending requests' };
  }
}

export async function getAllAccounts(tenantId?: string): Promise<ActionResult<PendingUser[]>> {
  try {
    await verifyAdminAccess(tenantId);

    const activeUsers = await adminQueries.selectAllAccounts(tenantId);
    return { success: true, data: activeUsers };
  } catch (error) {
    console.error('❌ [ALL ACCOUNTS] Error fetching all accounts:', error);
    return { success: false, error: 'Failed to fetch all accounts' };
  }
}

// NOTE will be available to all not just admin
export async function getPendingProposals(tenantId?: string): Promise<ActionResult<PendingProposal[]>> {
  try {
    await verifyAdminAccess(tenantId);

    const formattedProposals = await adminQueries.selectPendingProposals(tenantId);
    return { success: true, data: formattedProposals };
  } catch (error) {
    console.error('Error fetching pending proposals:', error);
    return { success: false, error: 'Failed to fetch pending proposals' };
  }
}

export async function getAllInterns(tenantId?: string): Promise<ActionResult<InternWithBills[]>> {
  try {
    await verifyAdminAccess(tenantId);

    const internsWithDetails = await adminQueries.selectAllInterns(tenantId);
    return { success: true, data: internsWithDetails };
  } catch (error) {
    console.error('❌ [ALL INTERNS] Error fetching all interns:', error);
    return { success: false, error: 'Failed to fetch all interns' };
  }
}

export async function getAllSupervisors(tenantId?: string): Promise<ActionResult<SupervisorWithInterns[]>> {
  try {
    await verifyAdminAccess(tenantId);

    const supervisors = await adminQueries.selectAllSupervisors(tenantId);
    return { success: true, data: supervisors };
  } catch (error) {
    console.error('❌ [ALL SUPERVISORS] Error fetching supervisor relationships:', error);
    return { success: false, error: 'Failed to fetch supervisor relationships' };
  }
}

export async function getAllInternBills(tenantId?: string): Promise<ActionResult<BillWithInterns[]>> {
  try {
    await verifyAdminAccess(tenantId);

    const billsWithInterns = await adminQueries.selectAllInternBills(tenantId);
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

    // First, get the user to check if they requested admin access
    const user = await adminQueries.selectPendingUser(userId);
    if (!user) {
      throw new Error('User not found or not pending');
    }

    await adminQueries.activateUser(userId, role);

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

    await adminQueries.denyPendingUser(userId);

    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('❌ [DENYING ACCOUNT REQUEST] Error denying user:', error);
    return { success: false, error: 'Failed to deny user' };
  }
}

// Get all active users for role management
export async function getAllActiveUsers(includeArchived: boolean = false, tenantId?: string): Promise<ActionResult<PendingUser[]>> {
  try {
    const admin = await verifyAdminAccess(tenantId);

    const users = await adminQueries.selectAllActiveUsers(admin.userId, includeArchived, tenantId);
    return { success: true, data: users };
  } catch (error) {
    console.error('❌ [ALL USERS] Error fetching users:', error);
    return { success: false, error: 'Failed to fetch users' };
  }
}

// Update user role (admin only)
export async function updateUserRole(userId: string, newRole: string, tenantId?: string): Promise<ActionResult> {
  try {
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

      await adminQueries.updateMemberOrgRole(userId, tenantId, newRole as 'admin' | 'worker');

      revalidatePath('/admin');
      return { success: true };
    }

    // Legacy: validate global roles
    const validRoles = ['user', 'supervisor', 'admin'];
    if (!validRoles.includes(newRole)) {
      return { success: false, error: 'Invalid role specified' };
    }

    // Verify user exists and is active
    const user = await adminQueries.selectActiveUserRole(userId);
    if (!user) {
      return { success: false, error: 'User not found or not active' };
    }

    await adminQueries.updateGlobalUserRole(userId, newRole as 'user' | 'supervisor' | 'admin');

    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('❌ [UPDATE ROLE] Error updating user role:', error);
    return { success: false, error: 'Failed to update user role' };
  }
}

// Archive user account (admin only)
export async function archiveAccount(userId: string, tenantId?: string): Promise<ActionResult> {
  try {
    const admin = await verifyAdminAccess(tenantId);

    // Prevent admin from archiving their own account
    if (userId === admin.userId) {
      return { success: false, error: 'Cannot archive your own account' };
    }

    // Verify user exists and is active
    const user = await adminQueries.selectActiveUserStatus(userId);
    if (!user) {
      return { success: false, error: 'User not found or not active' };
    }

    await adminQueries.archiveUser(userId);

    revalidatePath('/admin');
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
    await verifyAdminAccess(tenantId);

    // Validate inputs
    if (!billIds || billIds.length === 0) {
      return { success: false, error: 'At least one bill ID is required' };
    }

    if (!userIds || userIds.length === 0) {
      return { success: false, error: 'At least one user ID is required' };
    }

    // Verify all bills exist and are food-related
    const bills = await adminQueries.selectFoodRelatedBills(billIds);
    if (bills.length !== billIds.length) {
      return { success: false, error: 'Some bills not found or are not food-related' };
    }

    // Verify all users exist and are active
    const users = await adminQueries.selectActiveUsersByIds(userIds);
    if (users.length !== userIds.length) {
      return { success: false, error: 'Some users not found or are not active' };
    }

    // Get existing assignments to avoid duplicates
    const existingAssignments = await adminQueries.selectExistingAssignments(billIds, userIds, tenantId);
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
    await adminQueries.insertAssignments(newAssignments);
    const assignmentsCreated = newAssignments.length;

    revalidatePath('/admin');
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

    // Verify supervisor exists and has role 'supervisor'
    const supervisor = await adminQueries.selectActiveSupervisor(supervisorId);
    if (!supervisor) {
      return { success: false, error: 'Invalid supervisor or supervisor not active' };
    }

    // Verify all interns exist and have role 'user'
    const interns = await adminQueries.selectActiveInternsByIds(internIds);
    if (interns.length !== internIds.length) {
      return { success: false, error: 'One or more invalid intern IDs or interns not active' };
    }

    // For each intern, remove existing supervisor relationship (if any) and create new one
    for (const internId of internIds) {
      await adminQueries.setSupervisorForIntern(supervisorId, internId);
    }

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

    // Verify intern exists
    const intern = await adminQueries.selectInternById(internId);
    if (!intern) {
      return { success: false, error: 'Invalid intern ID' };
    }

    // Delete supervisor relationship
    await adminQueries.deleteSupervisorForIntern(internId);

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

    // Verify intern exists
    const intern = await adminQueries.selectActiveInternById(internId);
    if (!intern) {
      return { success: false, error: 'Invalid intern ID or intern not active' };
    }

    // Verify bill exists
    const bill = await adminQueries.selectBillId(billId);
    if (!bill) {
      return { success: false, error: 'Invalid bill ID' };
    }

    // Verify the relationship exists
    const relationship = await adminQueries.selectAssignment(internId, billId, tenantId);
    if (!relationship) {
      return { success: false, error: 'Bill is not tracked by this intern' };
    }

    // Remove the bill from the intern's tracking list
    await adminQueries.deleteAssignment(internId, billId, tenantId);

    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('❌ [REMOVE BILL] Error removing bill from intern:', error);
    return { success: false, error: 'Failed to remove bill from intern' };
  }
}
