'use server';

import type { TempBill } from '@/types/legislation';
import { requireSession, requireMembership } from '@/lib/auth-guards';
import { updateBillStatus } from '@/db/queries/bills-write';
import {
  getPendingProposals,
  formatProposal,
  findUserProposalForBill,
  upsertProposal,
  findPendingProposalById,
  markProposalApproved,
  markProposalRejected,
  findProposalById,
  deleteProposalById,
} from '@/db/queries/proposals';

// ==============================================
// PROPOSALS — SERVER ACTION ARM
// ==============================================
// Thin 'use server' wrappers mirroring the GET/POST/PATCH/DELETE handlers in
// /api/proposals, so the data-client can flip transports per the contract.

/** Mirrors GET /api/proposals. */
export async function listProposalsAction(params: { tenantId?: string }): Promise<TempBill[]> {
  const { tenantId } = params;
  const { user } = await requireSession.fromAction();

  let orgRole: string | undefined;
  if (tenantId) {
    const ctx = await requireMembership.fromAction(tenantId);
    orgRole = ctx.orgRole;
  }
  const effectiveRole = orgRole ?? user.role;

  const proposals = await getPendingProposals({
    userId: user.id,
    effectiveRole,
    userRole: user.role,
    tenantId,
  });
  return proposals.map(formatProposal) as TempBill[];
}

export interface CreateProposalParams {
  billId: string;
  currentStatus: string;
  proposedStatus: string;
  note?: string;
  tenantId?: string;
}

/** Mirrors POST /api/proposals. Returns the proposal id. */
export async function createProposalAction(params: CreateProposalParams): Promise<{ proposalId: string }> {
  const { billId, currentStatus, proposedStatus, note, tenantId } = params;
  const { user } = await requireSession.fromAction();
  if (tenantId) {
    await requireMembership.fromAction(tenantId);
  }

  const existing = await findUserProposalForBill(billId, user.id);
  const proposalId = await upsertProposal({
    existingId: existing?.id,
    billId,
    userId: user.id,
    currentStatus,
    proposedStatus,
    note,
    tenantId,
  });
  return { proposalId };
}

export interface DecideProposalParams {
  proposalId: string;
  action: 'approve' | 'reject';
  tenantId?: string;
}

/** Mirrors PATCH /api/proposals (approve/reject). */
export async function decideProposalAction(params: DecideProposalParams): Promise<void> {
  const { proposalId, action, tenantId } = params;
  const { user } = await requireSession.fromAction();

  if (tenantId) {
    const { orgRole } = await requireMembership.fromAction(tenantId);
    if (orgRole !== 'admin') {
      throw new Error('Only org admins can approve/reject proposals');
    }
  } else if (user.role !== 'admin' && user.role !== 'supervisor') {
    throw new Error('Unauthorized');
  }

  const proposal = await findPendingProposalById(proposalId);
  if (!proposal) {
    throw new Error('Proposal not found');
  }

  if (action === 'approve') {
    await updateBillStatus(proposal.bill_id, proposal.proposed_status, tenantId);
    await markProposalApproved(proposalId, user.id);
  } else {
    await markProposalRejected(proposalId);
  }
}

export interface DeleteProposalParams {
  billId?: string;
  proposalId?: string;
  tenantId?: string;
}

/** Mirrors DELETE /api/proposals (by proposalId or billId). */
export async function deleteProposalAction(params: DeleteProposalParams): Promise<void> {
  const { billId, proposalId, tenantId } = params;
  const { user } = await requireSession.fromAction();
  if (tenantId) {
    await requireMembership.fromAction(tenantId);
  }

  let proposalToDelete;
  if (proposalId) {
    proposalToDelete = await findProposalById(proposalId);
  } else if (billId) {
    proposalToDelete = await findUserProposalForBill(billId, user.id);
  } else {
    throw new Error('Must provide either proposalId or billId');
  }

  if (!proposalToDelete) {
    throw new Error('Proposal not found');
  }
  if (proposalToDelete.proposed_by_user_id !== user.id) {
    throw new Error('You can only delete your own proposals');
  }

  await deleteProposalById(proposalToDelete.id);
}
