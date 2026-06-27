import type { Bill } from '@/types/legislation';
import { defineClient } from './define-client';
import {
  getBillsAction,
  updateBillStatusAction,
  type GetBillsParams,
  type UpdateBillStatusParams,
} from '@/app/actions/bills';

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

export const billsClient = defineClient('bills', {
  getBills: { action: getBillsAction, fetch: getBillsFetch },
  updateStatus: { action: updateBillStatusAction, fetch: updateBillStatusFetch },
});
