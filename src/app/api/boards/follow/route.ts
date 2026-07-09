import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth-guards';
import { followOrg, unfollowOrg, getPublicTenant } from '@/db/queries/tenants';

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireSession.fromRequest(request);
    const { tenantId } = await request.json();
    const org = await getPublicTenant(tenantId);
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }
    await followOrg(user.id, tenantId);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in boards follow POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user } = await requireSession.fromRequest(request);
    const { tenantId } = await request.json();
    await unfollowOrg(user.id, tenantId);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in boards follow DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
