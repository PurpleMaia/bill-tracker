import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/auth-guards';
import { getStatusUpdatesForBills, normalizeCalendarBillIds } from '@/db/queries/calendar';

// POST (not GET): the body carries up to a thousand bill ids, too many for a URL.
export async function POST(request: NextRequest) {
  try {
    await requireSession.fromRequest(request);
    const body = await request.json().catch(() => null);
    let billIds: string[];
    try {
      billIds = normalizeCalendarBillIds(body?.billIds);
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const updates = await getStatusUpdatesForBills(billIds);
    return NextResponse.json({ updates }, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in calendar POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
