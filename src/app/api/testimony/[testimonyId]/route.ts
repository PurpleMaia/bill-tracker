import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireMembership } from '@/lib/auth/auth-guards';
import {
  deleteTestimonyById,
  getTestimonyById,
  markTestimonySubmittedById,
  updateTestimony,
} from '@/db/queries/testimony';

// One testimony by id — a bill can have several, one per hearing round.
// Every query filters by the session user, so another user's id is a 404/no-op.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ testimonyId: string }> }
) {
  try {
    const { user } = await requireSession.fromRequest(request);
    const { testimonyId } = await params;
    const testimony = await getTestimonyById(user.id, testimonyId);
    return NextResponse.json(testimony, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in testimony-by-id GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ testimonyId: string }> }
) {
  try {
    const { testimonyId } = await params;
    const body = await request.json();
    const { user } = body.tenantId
      ? await requireMembership.fromRequest(request, body.tenantId)
      : await requireSession.fromRequest(request);
    const testimony = await updateTestimony(user.id, testimonyId, body);
    return NextResponse.json(testimony, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in testimony-by-id PUT:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ testimonyId: string }> }
) {
  try {
    const { user } = await requireSession.fromRequest(request);
    const { testimonyId } = await params;
    const testimony = await markTestimonySubmittedById(user.id, testimonyId);
    return NextResponse.json(testimony, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in testimony-by-id PATCH:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ testimonyId: string }> }
) {
  try {
    const { user } = await requireSession.fromRequest(request);
    const { testimonyId } = await params;
    await deleteTestimonyById(user.id, testimonyId);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in testimony-by-id DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
