import { NextRequest, NextResponse } from 'next/server';
import { optionalSession } from '@/lib/auth/auth-guards';
import { searchBills } from '@/db/queries/bills-read';
import { parseSearchParams, SEARCH_PAGE_SIZE } from '@/lib/bills/search-params';

export async function GET(request: NextRequest) {
  try {
    // Public endpoint: resolve the user if present, but never require one.
    await optionalSession.fromRequest(request);

    const { searchParams } = new URL(request.url);
    const filters = parseSearchParams(searchParams);
    const cursor = searchParams.get('cursor');

    const result = await searchBills({
      ...filters,
      cursor,
      limit: SEARCH_PAGE_SIZE,
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
