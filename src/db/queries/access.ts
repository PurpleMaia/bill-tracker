import { db } from '@/db/kysely/client';

// ==============================================
// ACCESS REQUESTS — DATA ACCESS
// ==============================================
// Self-service "request elevated access" flags on the user record. The admin
// dashboard reads requested_admin / requested_supervisor when reviewing pending
// accounts. (Re-homed from the deleted lib/admin-utils.ts; logic preserved.)

/**
 * Flags a user (by email) as having requested admin access, moving them to a
 * pending account status for admin review. Already-admins are excluded.
 * @returns true if a row was updated.
 */
export async function requestAdminAccess(email: string): Promise<boolean> {
  try {
    const result = await db.updateTable('user')
      .set({ requested_admin: true, account_status: 'pending' })
      .where('email', '=', email)
      .where('role', '!=', 'admin') // Prevent already admins from requesting
      .executeTakeFirst();

    return result.numUpdatedRows > 0;
  } catch (error) {
    console.error('Error requesting admin access:', error);
    return false;
  }
}

/**
 * Flags a user (by email) as having requested supervisor access, moving them to
 * a pending account status for admin review. Existing supervisors/admins excluded.
 * @returns true if a row was updated.
 */
export async function requestSupervisorAccess(email: string): Promise<boolean> {
  try {
    const result = await db.updateTable('user')
      .set({ requested_supervisor: true, account_status: 'pending' })
      .where('email', '=', email)
      .where('role', '!=', 'admin')
      .where('role', '!=', 'supervisor')
      .executeTakeFirst();

    return result.numUpdatedRows > 0;
  } catch (error) {
    console.error('Error requesting supervisor access:', error);
    return false;
  }
}

/**
 * Returns whether a user (by email) currently has a pending admin request.
 * null if the user is not found.
 */
export async function checkAdminRequestStatus(email: string): Promise<boolean | null> {
  try {
    const user = await db.selectFrom('user')
      .select(['requested_admin'])
      .where('email', '=', email)
      .executeTakeFirst();

    if (!user) {
      return null; // User not found
    }

    return user.requested_admin;
  } catch (error) {
    console.error('Error checking admin request status:', error);
    return null;
  }
}
