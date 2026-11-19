import { NextRequest, NextResponse } from 'next/server';
import { requireMembership, requireSession } from '@/lib/auth/auth-guards';
import { listContacts, logContacts } from '@/db/queries/legislator-contacts';
import type { LogContactsInput } from '@/types/contacts';

/** The caller's logged contacts, plus their org's with ?tenantId=. */
export async function GET(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get('tenantId') || undefined;
    const { user } = tenantId
      ? await requireMembership.fromRequest(request, tenantId)
      : await requireSession.fromRequest(request);
    const contacts = await listContacts(user.id, tenantId);
    return NextResponse.json(contacts, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in contacts GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Logs the caller's outreach on a bill — one row per recipient. */
export async function POST(request: NextRequest) {
  try {
    const input = (await request.json()) as LogContactsInput;
    const { user } = input?.tenantId
      ? await requireMembership.fromRequest(request, input.tenantId)
      : await requireSession.fromRequest(request);
    const contacts = await logContacts(user.id, input);
    return NextResponse.json(contacts, { status: 201 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in contacts POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
