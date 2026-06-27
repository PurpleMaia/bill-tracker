import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { getSessionCookie } from '@/lib/cookies';
import { validateMembership } from '@/db/queries/tenants';
import { db } from '@/db/kysely/client';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tokenId: string }> }
) {
  try {
    const { id: tenantId, tokenId } = await params;

    const sessionToken = getSessionCookie(request);
    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await validateSession(sessionToken);
    const orgRole = await validateMembership(user.id, tenantId);
    if (orgRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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
