import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth-guards';
import { listPublicTenants, listFollowedTenants } from '@/db/queries/tenants';

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireSession.fromRequest(request);
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope'); // 'public' | 'followed'
    const orgs =
      scope === 'followed'
        ? await listFollowedTenants(user.id)
        : await listPublicTenants(user.id);
    return NextResponse.json({ orgs }, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in boards GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
