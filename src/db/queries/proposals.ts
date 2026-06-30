import { db } from '@/db/kysely/client';
import { sql } from 'kysely';
import crypto from 'crypto';

// ==============================================
// PENDING PROPOSALS — DATA ACCESS
// ==============================================
// Pure Kysely query functions for the human-proposal workflow. Auth, request
// parsing, and HTTP responses live in the route/action transports that call
// these; the query text here is the single source of truth.

const PROPOSER_AND_BILL_SELECT = [
  'proposer.username as proposer_username',
  'proposer.email as proposer_email',
  'proposer.role as proposer_role',
  'bills.bill_number',
  'bills.bill_title',
] as const;

/**
 * Loads pending proposals visible to a user, scoped by their effective role.
 * - admin: all pending proposals (optionally tenant-scoped)
 * - supervisor: pending proposals from their adopted interns
 * - worker/other: their own pending proposals
 */
export async function getPendingProposals(params: {
  userId: string;
  effectiveRole: string;
  userRole: string;
  tenantId?: string;
}) {
  const { userId, effectiveRole, userRole, tenantId } = params;

  if (effectiveRole === 'admin') {
    // Admins see all pending proposals for the tenant
    let query = db
      .selectFrom('pending_proposals')
      .leftJoin('user as proposer', (join: any) =>
        join.on(sql`pending_proposals.proposed_by_user_id::uuid = proposer.id`)
      )
      .leftJoin('bills', (join: any) =>
        join.on(sql`pending_proposals.bill_id::uuid = bills.id`)
      )
      .selectAll('pending_proposals')
      .select([...PROPOSER_AND_BILL_SELECT])
      .where('pending_proposals.approval_status', '=', 'pending');

    if (tenantId) {
      query = query.where('pending_proposals.tenant_id', '=', tenantId);
    }

    return query.execute();
  } else if (userRole === 'supervisor') {
    // Supervisors see proposals from their adopted interns
    let query = db
      .selectFrom('pending_proposals')
      .innerJoin('supervisor_users', 'pending_proposals.proposed_by_user_id', 'supervisor_users.user_id')
      .leftJoin('user as proposer', (join: any) =>
        join.on(sql`pending_proposals.proposed_by_user_id::uuid = proposer.id`)
      )
      .leftJoin('bills', (join: any) =>
        join.on(sql`pending_proposals.bill_id::uuid = bills.id`)
      )
      .selectAll('pending_proposals')
      .select([...PROPOSER_AND_BILL_SELECT])
      .where('supervisor_users.supervisor_id', '=', userId)
      .where('pending_proposals.approval_status', '=', 'pending');

    if (tenantId) {
      query = query.where('pending_proposals.tenant_id', '=', tenantId);
    }

    return query.execute();
  } else {
    // Workers see their own pending proposals
    let query = db
      .selectFrom('pending_proposals')
      .leftJoin('user as proposer', (join: any) =>
        join.on(sql`pending_proposals.proposed_by_user_id::uuid = proposer.id`)
      )
      .leftJoin('bills', (join: any) =>
        join.on(sql`pending_proposals.bill_id::uuid = bills.id`)
      )
      .selectAll('pending_proposals')
      .select([...PROPOSER_AND_BILL_SELECT])
      .where('pending_proposals.proposed_by_user_id', '=', userId)
      .where('pending_proposals.approval_status', '=', 'pending');

    if (tenantId) {
      query = query.where('pending_proposals.tenant_id', '=', tenantId);
    }

    return query.execute();
  }
}

/** Maps a raw proposal row to the client TempBill-compatible shape. */
export function formatProposal(p: any) {
  return {
    id: p.bill_id,
    bill_id: p.bill_id,
    bill_number: p.bill_number ?? undefined,
    bill_title: p.bill_title ?? undefined,
    current_status: p.current_status,
    proposed_status: p.proposed_status,
    target_idx: 0,
    source: 'human' as const,
    approval_status: 'pending' as const,
    proposing_user_id: p.proposed_by_user_id,
    proposing_username: p.proposer_username || undefined,
    proposing_email: p.proposer_email || undefined,
    proposed_by: {
      user_id: p.proposed_by_user_id,
      role: p.proposer_role ?? 'worker',
      at: new Date(p.proposed_at).toISOString(),
      note: p.note || undefined,
      username: p.proposer_username || undefined,
      email: p.proposer_email || undefined,
    },
    proposalId: p.id,
  };
}

/** Finds a user's existing proposal for a bill (used to upsert on create). */
export async function findUserProposalForBill(billId: string, userId: string) {
  return db
    .selectFrom('pending_proposals')
    .selectAll()
    .where('bill_id', '=', billId)
    .where('proposed_by_user_id', '=', userId)
    .executeTakeFirst();
}

/** Creates or updates a user's proposal for a bill. Returns the proposal id. */
export async function upsertProposal(params: {
  existingId?: string;
  billId: string;
  userId: string;
  currentStatus: string;
  proposedStatus: string;
  note?: string | null;
  tenantId?: string;
}): Promise<string> {
  const { existingId, billId, userId, currentStatus, proposedStatus, note, tenantId } = params;

  if (existingId) {
    await db
      .updateTable('pending_proposals')
      .set({
        proposed_status: proposedStatus,
        current_status: currentStatus,
        approval_status: 'pending',
        proposed_at: new Date(),
        note: note || null,
        tenant_id: tenantId ?? null,
      })
      .where('id', '=', existingId)
      .execute();

    return existingId;
  }

  const proposalId = crypto.randomUUID();
  const result = await db
    .insertInto('pending_proposals')
    .values({
      id: proposalId,
      bill_id: billId,
      proposed_by_user_id: userId,
      proposed_status: proposedStatus,
      current_status: currentStatus,
      proposed_at: new Date(),
      approval_status: 'pending',
      note: note || null,
      tenant_id: tenantId ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return result.id;
}

/** Finds a pending proposal by id (used before approve/reject). */
export async function findPendingProposalById(proposalId: string) {
  return db
    .selectFrom('pending_proposals')
    .selectAll()
    .where('id', '=', proposalId)
    .where('approval_status', '=', 'pending')
    .executeTakeFirst();
}

/** Marks a proposal approved by the given user. */
export async function markProposalApproved(proposalId: string, approvedByUserId: string) {
  await db
    .updateTable('pending_proposals')
    .set({
      approval_status: 'approved',
      approved_by_user_id: approvedByUserId,
      approved_at: new Date(),
    })
    .where('id', '=', proposalId)
    .execute();
}

/** Marks a proposal rejected. */
export async function markProposalRejected(proposalId: string) {
  await db
    .updateTable('pending_proposals')
    .set({ approval_status: 'rejected' })
    .where('id', '=', proposalId)
    .execute();
}

/** Finds a proposal by its id (any status). */
export async function findProposalById(proposalId: string) {
  return db
    .selectFrom('pending_proposals')
    .selectAll()
    .where('id', '=', proposalId)
    .executeTakeFirst();
}

/** Deletes a proposal by id. */
export async function deleteProposalById(proposalId: string) {
  await db
    .deleteFrom('pending_proposals')
    .where('id', '=', proposalId)
    .execute();
}
