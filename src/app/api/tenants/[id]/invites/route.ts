import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guards';
import { db } from '@/db/kysely/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tenantId } = await params;

    await requireAdmin.fromRequest(request, tenantId);

    const invites = await db
      .selectFrom('invite_tokens as it')
      .innerJoin('user as u', 'it.invited_by', 'u.id')
      .select([
        'it.id',
        'it.email',
        'it.token',
        'it.status',
        'it.expires_at',
        'it.created_at',
        'it.accepted_at',
        'u.username as invited_by_username',
      ])
      .where('it.tenant_id', '=', tenantId)
      .orderBy('it.created_at', 'desc')
      .execute();

    return NextResponse.json({ invites }, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('List invites error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
