import { NextRequest, NextResponse } from 'next/server';
import { optionalSession } from '@/lib/auth/auth-guards';
import { getLegislatorOptions } from '@/db/queries/legislators';

export async function GET(request: NextRequest) {
  try {
    // Legislators are public record; resolve the session only for parity with
    // the action arm.
    await optionalSession.fromRequest(request);
    const options = await getLegislatorOptions();
    return NextResponse.json(options, {
      status: 200,
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in legislators GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
