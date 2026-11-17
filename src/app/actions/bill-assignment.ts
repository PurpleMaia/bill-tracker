'use server';

import type { Bill } from '@/types/legislation';
import { requireMembership, requireSession } from '@/lib/auth/auth-guards';
import { validateMembership } from '@/db/queries/tenants';
import { assignBill, unassignBillFromUser, getAssignableUsers, type AssignableUser } from '@/db/queries/bill-assignment';

// ==============================================
// BILL ASSIGNMENT — SERVER ACTIONS
// ==============================================
// The assigner is ALWAYS the session user — never a client-supplied id, since
// the queries authorize by the assigner's role. When tenant-scoped, both the
// caller and the target must be members of that org.

async function resolveAssigner(tenantId?: string) {
  if (tenantId) return (await requireMembership.fromAction(tenantId)).user;
  return (await requireSession.fromAction()).user;
}

export async function getAssignableUsersAction(params: {
  tenantId?: string;
}): Promise<AssignableUser[]> {
  const user = await resolveAssigner(params.tenantId);
  return getAssignableUsers(user.id, params.tenantId);
}

export async function assignBillAction(params: {
  targetUserId: string;
  bill: Bill;
  tenantId?: string;
}) {
  const user = await resolveAssigner(params.tenantId);
  if (params.tenantId) await validateMembership(params.targetUserId, params.tenantId);
  return assignBill(user.id, params.targetUserId, params.bill, params.tenantId);
}

export async function unassignBillAction(params: {
  targetUserId: string;
  billId: string;
  tenantId?: string;
}): Promise<boolean> {
  const user = await resolveAssigner(params.tenantId);
  if (params.tenantId) await validateMembership(params.targetUserId, params.tenantId);
  return unassignBillFromUser(user.id, params.targetUserId, params.billId, params.tenantId);
}
