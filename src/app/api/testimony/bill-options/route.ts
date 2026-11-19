import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/auth-guards';
import { listTestimonyBillOptions } from '@/db/queries/testimony';

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireSession.fromRequest(request);
    const options = await listTestimonyBillOptions(user.id);
    return NextResponse.json(options, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in testimony bill-options GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
