import { NextRequest, NextResponse } from 'next/server';
import { summarizeDiffAction } from '@/app/actions/summaries';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: billId } = await params;
    const body = await request.json().catch(() => ({}));
    const olderId = body.olderId as string;
    const newerId = body.newerId as string;

    if (typeof olderId !== 'string' || typeof newerId !== 'string' || !olderId || !newerId) {
      return NextResponse.json({ error: 'Invalid request parameters.' }, { status: 400 });
    }

    const result = await summarizeDiffAction({ billId, olderId, newerId });
    return NextResponse.json(result);
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Summarize diff error:', error);
    return NextResponse.json({ error: 'Failed to summarize changes' }, { status: 500 });
  }
}
