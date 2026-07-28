import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { getSessionCookie } from '@/lib/cookies';
import { validateMembership } from '@/db/queries/tenants';
import { updateBillStatus, untrackBill } from '@/db/queries/bills-write';
import { getBillDetails, getVersionHtmlLinks } from '@/db/queries/bills-read';
import { updateBillTags } from '@/db/queries/tags';
import { compareVersionHtml } from '@/services/bill-diff';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);

    // Version-diff branch: /api/bills/[id]?resource=version-diff&olderId=..&newerId=..
    if (url.searchParams.get('resource') === 'version-diff') {
      const olderId = url.searchParams.get('olderId');
      const newerId = url.searchParams.get('newerId');
      if (!olderId || !newerId) {
        return NextResponse.json(
          { error: 'olderId and newerId are required' },
          { status: 400 },
        );
      }
      const { older, newer } = await getVersionHtmlLinks(id, olderId, newerId);
      const comparison = await compareVersionHtml({
        olderLabel: older?.label ?? 'older',
        newerLabel: newer?.label ?? 'newer',
        olderUrl: older?.htmlLink ?? null,
        newerUrl: newer?.htmlLink ?? null,
      });
      return NextResponse.json({ comparison }, { status: 200 });
    }

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
        if (!tenantId) {
          return NextResponse.json({ error: 'tenantId is required for tag updates' }, { status: 400 });
        }
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
