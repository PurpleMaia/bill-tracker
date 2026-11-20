import { NextRequest, NextResponse } from 'next/server';
import { requireSysadmin } from '@/lib/auth/auth-guards';
import { getAnalyticsDashboard } from '@/db/queries/analytics';
import { isAnalyticsRange } from '@/lib/analytics/buckets';
import { parseOrgFilter } from '@/lib/analytics/features';

/** GET /api/analytics?range=30d|90d|1y|all&org=all|none|<tenantId> — sysadmin dashboard aggregates. */
export async function GET(request: NextRequest) {
  try {
    await requireSysadmin.fromRequest(request);
    const params = request.nextUrl.searchParams;
    const range = params.get('range') ?? '30d';
    const org = parseOrgFilter(params.get('org'));
    if (!isAnalyticsRange(range) || !org) {
      return NextResponse.json({ error: 'Invalid range or org' }, { status: 400 });
    }
    const dashboard = await getAnalyticsDashboard({ range, org });
    return NextResponse.json(dashboard, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in analytics GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
