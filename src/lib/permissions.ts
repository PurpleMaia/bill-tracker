// ==============================================
// PERMISSION HELPER FUNCTIONS
// ==============================================
// Pure, dependency-free role checks shared across UI, server actions, and API
// routes. Keeping them in one place keeps authorization rules consistent and
// unit-testable (see __tests__/permissions.test.ts).

/**
 * Checks if a user has permission to assign bills to others.
 * Admins (legacy role or org role) and supervisors can assign bills.
 *
 * @param user User object with role property
 * @param orgRole Optional org-level role from tenant membership
 * @returns True if user can assign bills, false otherwise
 */
export function canAssignBills(user: { role: string } | null | undefined, orgRole?: string): boolean {
  if (!user) return false;
  if (orgRole === 'admin') return true;
  return user.role === 'admin' || user.role === 'supervisor';
}

/**
 * Checks if a user can track their own bills.
 * Interns cannot track their own bills, only receive assignments.
 * All other roles can track their own bills.
 *
 * @param user User object with role property
 * @returns True if user can track their own bills, false otherwise
 */
export function canTrackOwnBills(user: { role: string } | null | undefined): boolean {
  if (!user) return false;
  return user.role !== 'intern';
}

/**
 * Gets the list of roles that a user can assign bills to.
 * Admins can assign to interns and supervisors.
 * Supervisors can only assign to interns (filtered by adoption in backend).
 *
 * @param userRole The role of the user making the assignment
 * @returns Array of role strings that can receive assignments
 */
export function getAssignableRoles(userRole: string): string[] {
  if (userRole === 'admin') {
    return ['intern', 'supervisor'];
  } else if (userRole === 'supervisor') {
    return ['intern'];
  }
  return [];
}

/**
 * Checks if a user can directly commit (not just propose) a bill status change.
 * Only org admins may commit; everyone else proposes for review.
 *
 * @param orgRole Org-level role from tenant membership
 * @returns True if the user can commit status changes directly
 */
export function canCommitStatus(orgRole?: string): boolean {
  return orgRole === 'admin';
}
