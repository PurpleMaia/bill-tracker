import { NextRequest, NextResponse } from 'next/server';
import { summarizeDocumentAction } from '@/app/actions/summaries';
import type { SummaryTarget } from '@/db/queries/summaries';

// Fetch arm for data.summaries.summarizeDocument. Thin transport over the
// action, which owns the opt-in check — so both arms share one consent path.
//
// The [id] path segment is the BILL id, and it is load-bearing: the action scopes
// the document lookup to it, so a version or report id that belongs to a
// different bill resolves as not-found instead of being summarized. Do not drop
// it from the call.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: billId } = await params;
    const body = await request.json().catch(() => ({}));
    const target = body.target as SummaryTarget;
    const id = body.id as string;

    if ((target !== 'version' && target !== 'report') || typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'Invalid request parameters.' }, { status: 400 });
    }

    const result = await summarizeDocumentAction({ target, billId, id });
    return NextResponse.json(result);
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Summarize document error:', error);
    return NextResponse.json({ error: 'Failed to summarize document' }, { status: 500 });
  }
}
