'use server';

import type { Bill, BillDetails, CompareVersionsParams, SearchBillsParams, BillSearchResponse } from '@/types/legislation';
import type { VersionComparison } from '@/lib/versions/version-diff';
import { optionalSession, requireAdmin, requireMembership, requireSession } from '@/lib/auth/auth-guards';
import {
  getAllTrackedBills,
  getAllFoodRelatedBills,
  getUserTrackedBills,
  getVersionHtmlLinks,
  getBillDetails,
  findExistingBillByURL,
  searchBills,
} from '@/db/queries/bills-read';
import {
  updateBillStatus,
  trackBill,
  trackBillById,
  untrackBill,
  removeBillFromOrg,
  updateFoodStatusOrCreateBill,
} from '@/db/queries/bills-write';
import { compareVersionHtml } from '@/services/bill-diff';

// ==============================================
// BILLS — SERVER ACTION ARM
// ==============================================
// Thin 'use server' wrappers over the db/queries functions, exposing the same
// operations as the API-route ('fetch') arm so the data-client can flip between
// them. Each returns the already-unwrapped value (throws on error), matching
// the fetch arm's contract.

export interface GetBillsParams {
  viewMode: string;
  showArchived: boolean;
  tenantId?: string;
}

/**
 * Mirrors GET /api/bills: optional auth, then the 4-branch view selection.
 * - my-bills (logged in): the user's tracked bills
 * - tenant-scoped (logged in + tenantId): all bills tracked in the tenant
 * - logged in, no tenant: all food-related bills
 * - public (no user): all tracked food-related bills
 */
export async function getBillsAction(params: GetBillsParams): Promise<Bill[]> {
  const { viewMode, showArchived, tenantId } = params;

  const { user } = await optionalSession.fromAction();

  if (tenantId && user) {
    await requireMembership.fromAction(tenantId);
  }

  if (user && viewMode === 'my-bills') {
    return getUserTrackedBills(user.id, showArchived, true, tenantId);
  } else if (user && tenantId) {
    return getAllTrackedBills(showArchived, tenantId, true);
  } else if (user) {
    return getAllFoodRelatedBills(showArchived, true, tenantId);
  }
  return getAllTrackedBills(showArchived);
}

export interface UpdateBillStatusParams {
  billId: string;
  newStatus: string;
  tenantId?: string;
}

/** Mirrors PATCH /api/bills/[id] { action: 'updateStatus' }. */
export async function updateBillStatusAction(params: UpdateBillStatusParams): Promise<void> {
  const { billId, newStatus, tenantId } = params;
  // Status changes are org-scoped only. Without a tenant, updateBillStatus would
  // write the public bills.bill_status directly, which users with no org must
  // not be able to do (public status comes from the AI + org consensus).
  if (!tenantId) {
    throw new Error('tenantId is required to update a bill status');
  }
  await requireMembership.fromAction(tenantId);
  await updateBillStatus(billId, newStatus, tenantId);
}

/** Mirrors GET /api/bills/[id]. Public record, so no session required (as the route). */
export async function getBillDetailsAction(params: { billId: string }): Promise<BillDetails> {
  return getBillDetails(params.billId);
}

/**
 * Mirrors GET /api/bills/[id]?resource=version-diff. Public data (bill text is
 * public record), so optional auth only — matching the bills-list branch.
 */
export async function compareVersionsAction(
  params: CompareVersionsParams,
): Promise<VersionComparison> {
  const { billId, olderId, newerId } = params;
  await optionalSession.fromAction();

  const { older, newer } = await getVersionHtmlLinks(billId, olderId, newerId);

  return compareVersionHtml({
    olderLabel: older?.label ?? 'older',
    newerLabel: newer?.label ?? 'newer',
    olderUrl: older?.htmlLink ?? null,
    newerUrl: newer?.htmlLink ?? null,
  });
}

/**
 * Mirrors GET /api/bills/search. Public: no session required, because browsing
 * and searching the corpus is open — only tracking is gated.
 */
export async function searchBillsAction(params: SearchBillsParams): Promise<BillSearchResponse> {
  // Resolve the user from the session, never from params — mirrors the route so
  // the client can't spoof another user's tracked state through the action arm.
  const { user } = await optionalSession.fromAction();
  return searchBills({ ...params, userId: user?.id ?? null });
}

/** Mirrors POST /api/bills/track. Requires a session; validates org membership. */
export async function trackBillByIdAction(params: {
  billId: string;
  tenantId?: string;
}): Promise<{ tracked: boolean }> {
  const { user } = await requireSession.fromAction();
  if (params.tenantId) {
    await requireMembership.fromAction(params.tenantId);
  }
  return trackBillById(user.id, params.billId, params.tenantId);
}

/** Mirrors POST /api/bills. Requires a session; validates org membership. */
export async function trackBillByUrlAction(params: {
  billUrl: string;
  tenantId?: string;
}): Promise<Bill> {
  const { user } = await requireSession.fromAction();
  if (params.tenantId) {
    await requireMembership.fromAction(params.tenantId);
  }
  return trackBill(user.id, params.billUrl, params.tenantId);
}

/**
 * Mirrors DELETE /api/bills/[id]. Untracks the bill for the CALLER only — the
 * user id comes from the session, never from params.
 */
export async function untrackBillAction(params: {
  billId: string;
  tenantId?: string;
}): Promise<void> {
  const { user } = await requireSession.fromAction();
  if (params.tenantId) {
    await requireMembership.fromAction(params.tenantId);
  }
  const ok = await untrackBill(user.id, params.billId, params.tenantId);
  if (!ok) throw new Error('Failed to untrack bill');
}

/**
 * Mirrors DELETE /api/bills/[id] { scope: 'org' }. Removes the bill from the
 * org's board for every member, so it requires an org admin of that tenant.
 */
export async function removeBillFromOrgAction(params: {
  billId: string;
  tenantId: string;
}): Promise<number> {
  const { user } = await requireAdmin.fromAction(params.tenantId);
  return removeBillFromOrg(params.billId, params.tenantId, user.id);
}

/**
 * Sets a bill's global food_related flag (creating the bill if needed). Used
 * only by the legacy "Manage Bills" dialog; it changes what every user sees,
 * so it requires an admin (org admin when tenant-scoped, else global admin).
 */
export async function setFoodStatusAction(params: {
  bill: Bill | BillDetails | null;
  foodState: boolean | null;
  tenantId?: string;
}): Promise<Bill> {
  await requireAdmin.fromAction(params.tenantId);
  return updateFoodStatusOrCreateBill(params.bill, params.foodState, params.tenantId);
}

/** Legacy "Manage Bills" dialog: look up a stored bill by its capitol URL. Admin only. */
export async function findExistingBillByUrlAction(params: {
  billUrl: string;
  tenantId?: string;
}): Promise<BillDetails | null> {
  await requireAdmin.fromAction(params.tenantId);
  return findExistingBillByURL(params.billUrl);
}
