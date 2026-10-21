import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/auth-guards';
import { profileSchema } from '@/lib/auth/validators';
import { updateUserProfile } from '@/db/queries/users';

// Fetch arm for data.profile.update — edits the logged-in user's own name.
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireSession.fromRequest(request);
    const body = await request.json().catch(() => ({}));
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((i) => i.message).join(', ');
      return NextResponse.json({ error: messages }, { status: 400 });
    }
    const updated = await updateUserProfile(user.id, parsed.data);
    return NextResponse.json(updated);
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Update profile error:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
