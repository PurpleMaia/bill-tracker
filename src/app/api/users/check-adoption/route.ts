import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth/session';
import { db } from '../../../../db/kysely/client';
import { getSessionCookie } from '@/lib/auth/cookies';

export async function GET(request: NextRequest) {
  try {
    // Validate session
    const session_token = getSessionCookie(request);
    if (!session_token) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const user = await validateSession(session_token);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });
    }

    // Only check adoption for interns (users with role 'user')
    if (user.role !== 'user') {
      // Admins and supervisors don't need adoption
      return NextResponse.json({ success: true, isAdopted: true });
    }

    // Check if user is adopted by a supervisor
    const adoption = await (db as any)
      .selectFrom('supervisor_users')
      .select(['id'])
      .where('user_id', '=', user.id)
      .executeTakeFirst();

    const isAdopted = !!adoption;

    return NextResponse.json({ success: true, isAdopted });
  } catch (error) {
    console.error('Error checking adoption status:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to check adoption status' 
    }, { status: 500 });
  }
}

