import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guards';
import { db } from '@/db/kysely/client';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tokenId: string }> }
) {
  try {
    const { id: tenantId, tokenId } = await params;

    await requireAdmin.fromRequest(request, tenantId);

    const result = await db
      .updateTable('invite_tokens')
      .set({ status: 'revoked' })
      .where('id', '=', tokenId)
      .where('tenant_id', '=', tenantId)
      .where('status', '=', 'pending')
      .executeTakeFirst();

    if (!result.numUpdatedRows || result.numUpdatedRows === BigInt(0)) {
      return NextResponse.json({ error: 'Invite not found or already resolved.' }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Revoke invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
