import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/auth-guards';
import {
  getUserPreferences,
  updateUserPreferences,
} from '@/db/queries/user-preferences';

// Fetch arm for data.preferences.get — returns the logged-in user's prefs.
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireSession.fromRequest(request);
    const prefs = await getUserPreferences(user.id);
    return NextResponse.json(prefs);
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Get preferences error:', error);
    return NextResponse.json({ error: 'Failed to load preferences' }, { status: 500 });
  }
}

// Fetch arm for data.preferences.update — patches the logged-in user's prefs.
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireSession.fromRequest(request);
    const body = await request.json().catch(() => ({}));
    // updateUserPreferences owns the field whitelist and normalization.
    const prefs = await updateUserPreferences(user.id, body ?? {});
    return NextResponse.json(prefs);
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Update preferences error:', error);
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
  }
}
