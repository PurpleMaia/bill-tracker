import type { TempBill } from '@/types/legislation';
import { defineClient } from './define-client';
import {
  listProposalsAction,
  createProposalAction,
  decideProposalAction,
  deleteProposalAction,
  type CreateProposalParams,
  type DecideProposalParams,
  type DeleteProposalParams,
} from '@/app/actions/proposals';

// ---- fetch arm (hits /api/proposals, unwraps the { success, ... } envelope) ----

async function listProposalsFetch(params: { tenantId?: string }): Promise<TempBill[]> {
  const qs = new URLSearchParams();
  if (params.tenantId) qs.set('tenantId', params.tenantId);

  const res = await fetch(`/api/proposals?${qs.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load proposals');
  }
  const data = await res.json();
  return (data.proposals ?? []) as TempBill[];
}

async function createProposalFetch(params: CreateProposalParams): Promise<{ proposalId: string }> {
  const res = await fetch('/api/proposals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.details || data.error || 'Failed to save proposal');
  }
  return { proposalId: data.proposalId };
}

async function decideProposalFetch(params: DecideProposalParams): Promise<void> {
  const res = await fetch('/api/proposals', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to ${params.action} proposal`);
  }
}

async function deleteProposalFetch(params: DeleteProposalParams): Promise<void> {
  const res = await fetch('/api/proposals', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete proposal');
  }
}

export const proposalsClient = defineClient('proposals', {
  list: { action: listProposalsAction, fetch: listProposalsFetch },
  create: { action: createProposalAction, fetch: createProposalFetch },
  decide: { action: decideProposalAction, fetch: decideProposalFetch },
  remove: { action: deleteProposalAction, fetch: deleteProposalFetch },
});
