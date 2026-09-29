import { NextRequest, NextResponse } from 'next/server';
import { optionalSession } from '@/lib/auth/auth-guards';
import { getCommitteeNames } from '@/db/queries/committees';

export async function GET(request: NextRequest) {
  try {
    await optionalSession.fromRequest(request);
    const names = await getCommitteeNames();
    return NextResponse.json(names, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in committees GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
