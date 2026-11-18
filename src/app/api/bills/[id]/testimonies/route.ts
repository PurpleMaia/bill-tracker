import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireMembership } from '@/lib/auth/auth-guards';
import { createTestimonyForCurrentRound, listBillTestimonies } from '@/db/queries/testimony';

// The caller's testimonies for one bill (one per hearing round).

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireSession.fromRequest(request);
    const { id: billId } = await params;
    const testimonies = await listBillTestimonies(user.id, billId);
    return NextResponse.json(testimonies, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in bill testimonies GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Starts the caller's testimony for the bill's current hearing round (or returns the existing one). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: billId } = await params;
    const body = await request.json().catch(() => ({}));
    const { user } = body.tenantId
      ? await requireMembership.fromRequest(request, body.tenantId)
      : await requireSession.fromRequest(request);
    const testimony = await createTestimonyForCurrentRound(user.id, { ...body, billId });
    return NextResponse.json(testimony, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in bill testimonies POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
