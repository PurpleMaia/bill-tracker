import { NextRequest, NextResponse } from 'next/server';
import { optionalSession } from '@/lib/auth/auth-guards';
import { getConferees } from '@/db/queries/conferees';
import type { ParsedConferee } from '@/lib/testimony/conferees';

/**
 * Resolve parsed conferees to contact info. POST because the conferee roster
 * (parsed client-side from status text) is a JSON body, not a query string.
 */
export async function POST(
  request: NextRequest,
  _ctx: { params: Promise<{ id: string }> },
) {
  try {
    await optionalSession.fromRequest(request);
    const body = (await request.json().catch(() => null)) as { conferees?: ParsedConferee[] } | null;
    const conferees = await getConferees(body?.conferees ?? []);
    return NextResponse.json(conferees, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in conferees POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
