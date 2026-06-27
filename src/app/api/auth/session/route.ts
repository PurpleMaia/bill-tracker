import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { getSessionCookie } from '@/lib/cookies';
import { getUserMemberships } from '@/db/queries/tenants';

export async function GET(request: NextRequest) {
  try {
    const session_token = getSessionCookie(request);
    if (!session_token) {
      return NextResponse.json({ user: null, memberships: [] }, { status: 200 });
    }
    const user = await validateSession(session_token);

    if (user) {
      const memberships = await getUserMemberships(user.id);
      return NextResponse.json({ user, memberships }, { status: 200 });
    } else {
      return NextResponse.json({ user: null, memberships: [] }, { status: 200 });
    }
  } catch (error) {
    console.error('Error in session API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
