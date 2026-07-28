import { NextRequest, NextResponse } from 'next/server';
import { summarizeDocumentAction } from '@/app/actions/summaries';
import type { SummaryTarget } from '@/db/queries/summaries';

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
