import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { getSessionCookie } from '@/lib/cookies';
import { validateMembership } from '@/services/data/tenants';
import { db } from '@/db/kysely/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionToken = getSessionCookie(request);
    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await validateSession(sessionToken);
    await validateMembership(user.id, id);
    const tenant = await db
      .selectFrom('tenants')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    return NextResponse.json({ tenant }, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionToken = getSessionCookie(request);
    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await validateSession(sessionToken);
    const orgRole = await validateMembership(user.id, id);
    if (orgRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const { brandingConfig } = body;
    const tenant = await db
      .updateTable('tenants')
      .set({ branding_config: brandingConfig ? JSON.stringify(brandingConfig) : null })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    return NextResponse.json({ tenant }, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionToken = getSessionCookie(request);
    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await validateSession(sessionToken);
    if (user.systemRole !== 'sysadmin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await db
      .deleteFrom('tenants')
      .where('id', '=', id)
      .execute();
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
