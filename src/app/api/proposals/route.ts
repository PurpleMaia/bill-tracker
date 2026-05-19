import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { getSessionCookie } from '@/lib/cookies';
import { validateMembership } from '@/services/data/tenants';
import { db } from '@/db/kysely/client';
import { sql } from 'kysely';
import { updateBillStatus } from '@/services/data/legislation';
import { proposalSchema, uuidSchema } from '@/lib/validators';
import crypto from 'crypto';

// GET - Load proposals (scoped by tenant)
export async function GET(request: NextRequest) {
  try {
    const session_token = getSessionCookie(request);
    const user = await validateSession(session_token);

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || undefined;

    let orgRole: string | undefined;
    if (tenantId) {
      orgRole = await validateMembership(user.id, tenantId);
    }

    let proposals;

    // Use orgRole for permission checks when tenant scoped, fallback to user.role
    const effectiveRole = orgRole ?? user.role;

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
        .select([
          'proposer.username as proposer_username',
          'proposer.email as proposer_email',
          'proposer.role as proposer_role',
          'bills.bill_number',
          'bills.bill_title',
        ])
        .where('pending_proposals.approval_status', '=', 'pending');

      if (tenantId) {
        query = query.where('pending_proposals.tenant_id', '=', tenantId);
      }

      proposals = await query.execute();
    } else if (user.role === 'supervisor') {
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
        .select([
          'proposer.username as proposer_username',
          'proposer.email as proposer_email',
          'proposer.role as proposer_role',
          'bills.bill_number',
          'bills.bill_title',
        ])
        .where('supervisor_users.supervisor_id', '=', user.id)
        .where('pending_proposals.approval_status', '=', 'pending');

      if (tenantId) {
        query = query.where('pending_proposals.tenant_id', '=', tenantId);
      }

      proposals = await query.execute();
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
        .select([
          'proposer.username as proposer_username',
          'proposer.email as proposer_email',
          'proposer.role as proposer_role',
          'bills.bill_number',
          'bills.bill_title',
        ])
        .where('pending_proposals.proposed_by_user_id', '=', user.id)
        .where('pending_proposals.approval_status', '=', 'pending');

      if (tenantId) {
        query = query.where('pending_proposals.tenant_id', '=', tenantId);
      }

      proposals = await query.execute();
    }

    // Format proposals to match TempBill interface
    const formatted = proposals.map((p: any) => ({
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
    }));

    return NextResponse.json({ success: true, proposals: formatted });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error loading proposals:', error);
    return NextResponse.json({ success: false, error: 'Failed to load proposals' }, { status: 500 });
  }
}

// POST - Create proposal
export async function POST(request: NextRequest) {
  try {
    const session_token = getSessionCookie(request);
    const user = await validateSession(session_token);

    const body = await request.json();
    const { billId, currentStatus, proposedStatus, note, tenantId } = body;

    const validation = proposalSchema.safeParse({ billId, currentStatus, proposedStatus, note });
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    if (tenantId) {
      await validateMembership(user.id, tenantId);
    }

    // Check if proposal already exists
    const existing = await db
      .selectFrom('pending_proposals')
      .selectAll()
      .where('bill_id', '=', billId)
      .where('proposed_by_user_id', '=', user.id)
      .executeTakeFirst();

    if (existing) {
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
        .where('id', '=', existing.id)
        .execute();

      return NextResponse.json({ success: true, proposalId: existing.id });
    }

    const proposalId = crypto.randomUUID();
    const result = await db
      .insertInto('pending_proposals')
      .values({
        id: proposalId,
        bill_id: billId,
        proposed_by_user_id: user.id,
        proposed_status: proposedStatus,
        current_status: currentStatus,
        proposed_at: new Date(),
        approval_status: 'pending',
        note: note || null,
        tenant_id: tenantId ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return NextResponse.json({ success: true, proposalId: result.id });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error saving proposal:', error);
    return NextResponse.json({ success: false, error: 'Failed to save proposal' }, { status: 500 });
  }
}

// PATCH - Approve or reject proposal
export async function PATCH(request: NextRequest) {
  try {
    const session_token = getSessionCookie(request);
    const user = await validateSession(session_token);

    const body = await request.json();
    const { proposalId, action, tenantId } = body;

    const validation = uuidSchema.safeParse(proposalId);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    if (tenantId) {
      const orgRole = await validateMembership(user.id, tenantId);
      if (orgRole !== 'admin') {
        return NextResponse.json({ success: false, error: 'Only org admins can approve/reject proposals' }, { status: 403 });
      }
    } else {
      if (user.role !== 'admin' && user.role !== 'supervisor') {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
      }
    }

    const proposal = await db
      .selectFrom('pending_proposals')
      .selectAll()
      .where('id', '=', proposalId)
      .where('approval_status', '=', 'pending')
      .executeTakeFirst();

    if (!proposal) {
      return NextResponse.json({ success: false, error: 'Proposal not found' }, { status: 404 });
    }

    if (action === 'approve') {
      await updateBillStatus(proposal.bill_id, proposal.proposed_status, tenantId);
      await db
        .updateTable('pending_proposals')
        .set({
          approval_status: 'approved',
          approved_by_user_id: user.id,
          approved_at: new Date(),
        })
        .where('id', '=', proposalId)
        .execute();
    } else if (action === 'reject') {
      await db
        .updateTable('pending_proposals')
        .set({ approval_status: 'rejected' })
        .where('id', '=', proposalId)
        .execute();
    } else {
      return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error updating proposal:', error);
    return NextResponse.json({ success: false, error: 'Failed to update proposal' }, { status: 500 });
  }
}

// DELETE - Delete proposal
export async function DELETE(request: NextRequest) {
  try {
    const session_token = getSessionCookie(request);
    const user = await validateSession(session_token);

    const body = await request.json();
    const { billId, proposalId, tenantId } = body;

    if (tenantId) {
      await validateMembership(user.id, tenantId);
    }

    let proposalToDelete;

    if (proposalId) {
      proposalToDelete = await db
        .selectFrom('pending_proposals')
        .selectAll()
        .where('id', '=', proposalId)
        .executeTakeFirst();
    } else if (billId) {
      proposalToDelete = await db
        .selectFrom('pending_proposals')
        .selectAll()
        .where('bill_id', '=', billId)
        .where('proposed_by_user_id', '=', user.id)
        .executeTakeFirst();
    } else {
      return NextResponse.json(
        { success: false, error: 'Must provide either proposalId or billId' },
        { status: 400 }
      );
    }

    if (!proposalToDelete) {
      return NextResponse.json({ success: false, error: 'Proposal not found' }, { status: 404 });
    }

    if (proposalToDelete.proposed_by_user_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'You can only delete your own proposals' },
        { status: 403 }
      );
    }

    await db
      .deleteFrom('pending_proposals')
      .where('id', '=', proposalToDelete.id)
      .execute();

    return NextResponse.json({
      success: true,
      proposalId: proposalToDelete.id,
      currentStatus: proposalToDelete.current_status,
    });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error deleting proposal:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete proposal' }, { status: 500 });
  }
}
