import { NextRequest, NextResponse } from 'next/server';
import { optionalSession, requireSession, requireMembership } from '@/lib/auth/auth-guards';
import { listPublicTenants, listFollowedTenants, getMyOrgStats } from '@/db/queries/tenants';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope'); // 'public' | 'followed' | 'mine'

    // scope=mine: the viewer's own org stats (not gated on public_board), for
    // the "Your Organization" card. Requires membership of the given tenant.
    if (scope === 'mine') {
      const tenantId = searchParams.get('tenantId');
      if (!tenantId) {
        return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
      }
      const { user } = await requireMembership.fromRequest(request, tenantId);
      const org = await getMyOrgStats(tenantId, user.id);
      return NextResponse.json({ org }, { status: 200 });
    }

    // scope=followed is inherently per-user, so it stays gated. The public org
    // list is open: signed-out visitors browse it, they just can't follow.
    if (scope === 'followed') {
      const { user } = await requireSession.fromRequest(request);
      const orgs = await listFollowedTenants(user.id);
      return NextResponse.json({ orgs }, { status: 200 });
    }

    const { user } = await optionalSession.fromRequest(request);
    const orgs = await listPublicTenants(user?.id ?? null);
    return NextResponse.json({ orgs }, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in boards GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
