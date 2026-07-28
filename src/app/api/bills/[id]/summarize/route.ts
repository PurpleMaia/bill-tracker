import { NextRequest, NextResponse } from 'next/server';
import { summarizeDocumentAction } from '@/app/actions/summaries';
import type { SummaryTarget } from '@/db/queries/summaries';

// Fetch arm for data.summaries.summarizeDocument. Thin transport over the
// action, which owns the opt-in check — so both arms share one consent path.
//
// NOTE: the [id] path segment is intentionally unused. A bill version or
// committee report is addressed by its own globally-unique primary key, which
// the body carries as `id`; the action and the query underneath take no bill id
// to cross-check against. The segment exists only so this route sits alongside
// the other /api/bills/[id]/* endpoints. Unlike ../summarize-diff, which
// genuinely needs the bill id to enumerate that bill's versions, nothing here
// is scoped by it — do not assume it constrains the lookup.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const target = body.target as SummaryTarget;
    const id = body.id as string;

    if ((target !== 'version' && target !== 'report') || typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'Invalid request parameters.' }, { status: 400 });
    }

    const result = await summarizeDocumentAction({ target, id });
    return NextResponse.json(result);
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Summarize document error:', error);
    return NextResponse.json({ error: 'Failed to summarize document' }, { status: 500 });
  }
}
