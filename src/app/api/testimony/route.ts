import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/auth-guards';
import { getTestimonyStatuses } from '@/db/queries/testimony';

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireSession.fromRequest(request);
    const statuses = await getTestimonyStatuses(user.id);
    return NextResponse.json(statuses, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in testimony statuses GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
