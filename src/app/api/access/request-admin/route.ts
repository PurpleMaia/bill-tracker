import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/auth-guards';
import { requestAdminAccess } from '@/db/queries/access';
import { emailSchema } from '@/lib/auth/validators';

// Fetch arm for data.access.requestAdmin. The logged-in user requests admin
// access for the given email (their own).
export async function POST(request: NextRequest) {
  try {
    await requireSession.fromRequest(request);

    const body = await request.json();
    const emailResult = emailSchema.safeParse(body.email);
    if (!emailResult.success) {
      return NextResponse.json({ success: false, error: 'A valid email is required.' }, { status: 400 });
    }

    const ok = await requestAdminAccess(emailResult.data);
    return NextResponse.json({ success: ok });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Request admin access error:', error);
    return NextResponse.json({ success: false, error: 'Failed to request admin access' }, { status: 500 });
  }
}
