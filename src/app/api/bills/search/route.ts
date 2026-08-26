import { NextRequest, NextResponse } from 'next/server';
import { optionalSession } from '@/lib/auth/auth-guards';
import { searchBills } from '@/db/queries/bills-read';
import { parseSearchParams, SEARCH_PAGE_SIZE } from '@/lib/bills/search-params';

export async function GET(request: NextRequest) {
  try {
    // Public endpoint: resolve the user if present, but never require one. The
    // resolved id (never a client-supplied one) drives the per-row is_tracked
    // flag and the tracked/untracked filter.
    const { user } = await optionalSession.fromRequest(request);

    const { searchParams } = new URL(request.url);
    const filters = parseSearchParams(searchParams);
    const cursor = searchParams.get('cursor');
    const tenantId = searchParams.get('tenantId');

    const result = await searchBills({
      ...filters,
      cursor,
      limit: SEARCH_PAGE_SIZE,
      userId: user?.id ?? null,
      tenantId,
    });

    return NextResponse.json(result, {
      status: 200,
      // Private + short-lived: a hard remount reuses the browser cache without
      // any shared cache ever holding a response.
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in bills search GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
