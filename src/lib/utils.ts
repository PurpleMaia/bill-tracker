import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

import type { Bills } from '../db/types';
import type { Bill } from '../types/legislation';
import { KANBAN_COLUMNS } from "./kanban-columns";

// Helper to safely convert Kysely Timestamp/Generated<Timestamp|null> to Date|null
export function toDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function formatBillStatusName(status: string | null): string {
  if (!status) return 'No Assigned Status';
  const lowerStatus = status.toLowerCase();

  // Check for keywords and return formatted strings
  if (lowerStatus.includes('introduced')) return 'Introduced';
  if (lowerStatus.includes('waiting')) return 'Waiting';
  if (lowerStatus.includes('scheduled')) return 'Scheduled';
  if (lowerStatus.includes('deferred')) return 'Deferred';
  if (lowerStatus.includes('passed')) return 'Passed';
  if (lowerStatus.includes('unassigned')) return 'N/A';
  if (lowerStatus.includes('assigned')) return 'Assigned';
  if (lowerStatus.includes('transmitted')) return 'Transmitted';
  if (lowerStatus.includes('veto')) return 'Vetoed';
  if (lowerStatus.includes('signs') || lowerStatus.includes('law')) return 'Became Law';

  // Fallback to column title if available, or the status itself
  return KANBAN_COLUMNS.find(col => col.id === status)?.title || status;
}

// ==============================================
// PERMISSION HELPER FUNCTIONS
// ==============================================

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