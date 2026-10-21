import type { Bill, CompareVersionsParams, SearchBillsParams, BillSearchResponse } from '@/types/legislation';
import type { VersionComparison } from '@/lib/versions/version-diff';
import { defineClient } from './define-client';
import {
  getBillsAction,
  updateBillStatusAction,
  compareVersionsAction,
  searchBillsAction,
  trackBillByIdAction,
  type GetBillsParams,
  type UpdateBillStatusParams,
} from '@/app/actions/bills';
import { filtersToQueryString } from '@/lib/bills/search-params';

// ---- fetch arm (hits /api/bills, unwraps the HTTP envelope) ----

async function getBillsFetch(params: GetBillsParams): Promise<Bill[]> {
  const qs = new URLSearchParams();
  if (params.tenantId) qs.set('tenantId', params.tenantId);
  qs.set('viewMode', params.viewMode);
  qs.set('showArchived', String(params.showArchived));

  const res = await fetch(`/api/bills?${qs.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch bills');
  }
  const data = await res.json();
  return (data.bills ?? []) as Bill[];
}

async function updateBillStatusFetch(params: UpdateBillStatusParams): Promise<void> {
  const res = await fetch(`/api/bills/${params.billId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'updateStatus',
      newStatus: params.newStatus,
      tenantId: params.tenantId,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update bill status');
  }
}

async function compareVersionsFetch(params: CompareVersionsParams): Promise<VersionComparison> {
  const qs = new URLSearchParams({
    resource: 'version-diff',
    olderId: params.olderId,
    newerId: params.newerId,
  });

  const res = await fetch(`/api/bills/${params.billId}?${qs.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to compare versions');
  }
  const data = await res.json();
  return data.comparison as VersionComparison;
}

async function searchBillsFetch(params: SearchBillsParams): Promise<BillSearchResponse> {
  const qs = filtersToQueryString(params, params.cursor);
  // tenantId scopes the per-user is_tracked flag / tracked filter to the active
  // org — appended here rather than via filtersToQueryString because it is
  // context, not a filter. userId is never sent: the route resolves it from the
  // session so the client can't spoof another user's tracked state.
  const url = params.tenantId
    ? `/api/bills/search?${qs}&tenantId=${encodeURIComponent(params.tenantId)}`
    : `/api/bills/search?${qs}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to search bills');
  }
  return (await res.json()) as BillSearchResponse;
}

async function trackBillByIdFetch(params: {
  billId: string;
  tenantId?: string;
}): Promise<{ tracked: boolean }> {
  const res = await fetch('/api/bills/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to track bill');
  }
  return (await res.json()) as { tracked: boolean };
}

export const billsClient = defineClient('bills', {
  getBills: { action: getBillsAction, fetch: getBillsFetch },
  updateStatus: { action: updateBillStatusAction, fetch: updateBillStatusFetch },
  compareVersions: { action: compareVersionsAction, fetch: compareVersionsFetch },
  searchBills: { action: searchBillsAction, fetch: searchBillsFetch },
  trackBillById: { action: trackBillByIdAction, fetch: trackBillByIdFetch },
});
