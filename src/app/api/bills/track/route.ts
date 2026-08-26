import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireMembership } from '@/lib/auth/auth-guards';
import { trackBillById } from '@/db/queries/bills-write';

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireSession.fromRequest(request);
    const { billId, tenantId } = await request.json();

    if (!billId || typeof billId !== 'string') {
      return NextResponse.json({ error: 'billId is required' }, { status: 400 });
    }
    if (tenantId) {
      await requireMembership.fromRequest(request, tenantId);
    }

    const result = await trackBillById(user.id, billId, tenantId);
    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in bills track POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
