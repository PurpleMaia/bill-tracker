import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { getSessionCookie } from '@/lib/cookies';
import { validateMembership } from '@/services/data/tenants';
import { updateBillStatus, untrackBill, getBillDetails } from '@/services/data/legislation';
import { updateBillTags } from '@/services/data/tags';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const bill = await getBillDetails(id);
    return NextResponse.json({ bill }, { status: 200 });
  } catch (error: any) {
    console.error('Error in bill GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionToken = getSessionCookie(request);
    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await validateSession(sessionToken);
    const { id: billId } = await params;
    const body = await request.json();
    const { tenantId, action } = body;

    if (tenantId) {
      await validateMembership(user.id, tenantId);
    }

    switch (action) {
      case 'updateStatus': {
        const { newStatus } = body;
        const bill = await updateBillStatus(billId, newStatus, tenantId);
        return NextResponse.json({ bill }, { status: 200 });
      }
      case 'updateTags': {
        const { tagIds } = body;
        const tags = await updateBillTags(billId, tagIds, tenantId);
        return NextResponse.json({ tags }, { status: 200 });
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in bill PATCH:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionToken = getSessionCookie(request);
    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await validateSession(sessionToken);
    const { id: billId } = await params;
    const body = await request.json();
    const { tenantId } = body;

    if (tenantId) {
      await validateMembership(user.id, tenantId);
    }

    await untrackBill(user.id, billId, tenantId);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in bill DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
