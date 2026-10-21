import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth/session';
import { getUsersByIds } from '@/db/queries/users';
import { getSessionCookie } from '@/lib/auth/cookies';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session_token = getSessionCookie(request);
    if (!session_token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await validateSession(session_token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Only allow admins and supervisors
    if (user.role !== 'admin' && user.role !== 'supervisor') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { userIds } = await request.json();
    
    if (!userIds || !Array.isArray(userIds)) {
      return NextResponse.json({ error: 'Invalid user IDs' }, { status: 400 });
    }

    const users = await getUsersByIds(userIds);
    
    return NextResponse.json({ users }, { status: 200 });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
