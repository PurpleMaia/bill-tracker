import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth-guards';
import { getUserTrackedBillIds } from '@/db/queries/bills-read';

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireSession.fromRequest(request);
    const ids = await getUserTrackedBillIds(user.id);
    return NextResponse.json({ ids }, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in boards tracked-ids GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
