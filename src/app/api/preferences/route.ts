import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth-guards';
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
    const patch: { ai_opt_in?: boolean; kanban_detailed_view?: boolean } = {};
    if (typeof body.ai_opt_in === 'boolean') patch.ai_opt_in = body.ai_opt_in;
    if (typeof body.kanban_detailed_view === 'boolean') {
      patch.kanban_detailed_view = body.kanban_detailed_view;
    }
    const prefs = await updateUserPreferences(user.id, patch);
    return NextResponse.json(prefs);
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Update preferences error:', error);
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
  }
}
