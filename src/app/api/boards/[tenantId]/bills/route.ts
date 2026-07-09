import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth-guards';
import { getPublicTenant } from '@/db/queries/tenants';
import { getOrgTestimonyBillIds } from '@/db/queries/testimony';
import { getAllTrackedBills } from '@/db/queries/bills-read';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  try {
    await requireSession.fromRequest(request);
    const { tenantId } = await params;
    const { searchParams } = new URL(request.url);
    const showArchived = searchParams.get('showArchived') === 'true';
    const wantTestimony = searchParams.get('testimony') === 'true';

    const org = await getPublicTenant(tenantId);
    if (!org) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    const bills = await getAllTrackedBills(showArchived, tenantId, false);

    if (wantTestimony) {
      const testimonyBillIds = await getOrgTestimonyBillIds(
        tenantId,
        bills.map((b) => b.id),
      );
      return NextResponse.json({ bills, testimonyBillIds }, { status: 200 });
    }

    return NextResponse.json({ bills }, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in board bills GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
