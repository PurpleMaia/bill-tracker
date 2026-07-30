import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/auth-guards';
import { listUserTestimonies } from '@/db/queries/testimony';

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireSession.fromRequest(request);
    const testimonies = await listUserTestimonies(user.id);
    return NextResponse.json(testimonies, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in testimony list GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
