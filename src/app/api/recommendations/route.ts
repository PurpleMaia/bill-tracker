import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/auth-guards';
import { getRecommendedBills } from '@/db/queries/recommendations';

// Fetch arm for data.recommendations.get — the logged-in user's recommended bills.
// ?tenantId only scopes which of the user's own tracked bills are left out (as in
// bills search), so it needs no membership check.
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireSession.fromRequest(request);
    const tenantId = new URL(request.url).searchParams.get('tenantId');
    const result = await getRecommendedBills(user.id, { tenantId });
    return NextResponse.json(result);
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Get recommendations error:', error);
    return NextResponse.json({ error: 'Failed to load recommendations' }, { status: 500 });
  }
}
