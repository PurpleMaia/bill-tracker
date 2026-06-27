import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { getSessionCookie } from '@/lib/cookies';
import { validateMembership } from '@/db/queries/tenants';
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
import { proposalSchema, uuidSchema } from '@/lib/validators';

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

    // Use orgRole for permission checks when tenant scoped, fallback to user.role
    const effectiveRole = orgRole ?? user.role;

    const proposals = await getPendingProposals({
      userId: user.id,
      effectiveRole,
      userRole: user.role,
      tenantId,
    });

    // Format proposals to match TempBill interface
    const formatted = proposals.map(formatProposal);

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
      return NextResponse.json({ success: false, error: validation.error.issues.map(i => i.message).join(', ') }, { status: 400 });
    }

    if (tenantId) {
      await validateMembership(user.id, tenantId);
    }

    // Check if proposal already exists
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

    return NextResponse.json({ success: true, proposalId });
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
      return NextResponse.json({ success: false, error: validation.error.issues.map(i => i.message).join(', ') }, { status: 400 });
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

    const proposal = await findPendingProposalById(proposalId);

    if (!proposal) {
      return NextResponse.json({ success: false, error: 'Proposal not found' }, { status: 404 });
    }

    if (action === 'approve') {
      await updateBillStatus(proposal.bill_id, proposal.proposed_status, tenantId);
      await markProposalApproved(proposalId, user.id);
    } else if (action === 'reject') {
      await markProposalRejected(proposalId);
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
      proposalToDelete = await findProposalById(proposalId);
    } else if (billId) {
      proposalToDelete = await findUserProposalForBill(billId, user.id);
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

    await deleteProposalById(proposalToDelete.id);

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
