'use server';

import type { Bill, CompareVersionsParams } from '@/types/legislation';
import type { VersionComparison } from '@/lib/version-diff';
import { optionalSession, requireMembership, requireSession } from '@/lib/auth-guards';
import {
  getAllTrackedBills,
  getAllFoodRelatedBills,
  getUserTrackedBills,
  getVersionHtmlLinks,
} from '@/db/queries/bills-read';
import { updateBillStatus } from '@/db/queries/bills-write';
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
  const { user } = await requireSession.fromAction();
  if (tenantId) {
    await requireMembership.fromAction(tenantId);
  }
  // user is required for the mutation path (matches the route's auth requirement)
  void user;
  await updateBillStatus(billId, newStatus, tenantId);
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
