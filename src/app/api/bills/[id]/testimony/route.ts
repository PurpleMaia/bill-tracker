import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireMembership } from '@/lib/auth-guards';
import { getTestimonyDraft, upsertTestimonyDraft } from '@/db/queries/testimony';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireSession.fromRequest(request);
    const { id: billId } = await params;
    const draft = await getTestimonyDraft(user.id, billId);
    return NextResponse.json(draft, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in testimony GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: billId } = await params;
    const body = await request.json();
    const { user } = body.tenantId
      ? await requireMembership.fromRequest(request, body.tenantId)
      : await requireSession.fromRequest(request);
    const draft = await upsertTestimonyDraft(user.id, { ...body, billId });
    return NextResponse.json(draft, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in testimony PUT:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
