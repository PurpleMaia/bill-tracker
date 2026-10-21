import { NextRequest, NextResponse } from 'next/server';
import { optionalSession } from '@/lib/auth/auth-guards';
import { getCommitteeChairs } from '@/db/queries/committee-chairs';
import { parseCommitteeCodes } from '@/lib/testimony/committees';

export async function GET(
  request: NextRequest,
  _ctx: { params: Promise<{ id: string }> },
) {
  try {
    await optionalSession.fromRequest(request);
    const committees = request.nextUrl.searchParams.get('committees');
    const chairs = await getCommitteeChairs(parseCommitteeCodes(committees));
    return NextResponse.json(chairs, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in chairs GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
