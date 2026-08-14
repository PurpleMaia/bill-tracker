import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../db/kysely/client';
import { sendVerificationEmail } from '@/services/email';
import { limitFixedWindow, retryAfterMs } from '@/lib/core/ratelimit-memory';

const RESEND_RATE_LIMIT = { limit: 3, windowMs: 15 * 60_000 };

function getClientIp(request: NextRequest): string {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);
    const rl = limitFixedWindow(`resend-verify:${clientIp}`, RESEND_RATE_LIMIT.limit, RESEND_RATE_LIMIT.windowMs);
    if (!rl.ok) {
      const retryMs = retryAfterMs(rl.resetAt);
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.', retryAfterMs: retryMs },
        { status: 429, headers: { 'Retry-After': Math.ceil(retryMs / 1000).toString() } }
      );
    }

    const { email } = await request.json();
    
    if (!email) {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    }

    // Find user by email
    const user = await db
      .selectFrom('user')
      .select(['id', 'email', 'username', 'email_verified', 'verification_token'])
      .where((eb) => eb.or([
        eb('email', '=', email),
        eb('username', '=', email)
      ]))
      .executeTakeFirst();

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    if (user.email_verified) {
      return NextResponse.json({ 
        success: true, 
        message: 'Email already verified' 
      });
    }

    if (!user.verification_token) {
      return NextResponse.json({ 
        success: false, 
        error: 'No verification token found. Please register again.' 
      }, { status: 400 });
    }

    // Resend verification email
    const emailResult = await sendVerificationEmail(user.email, user.username, user.verification_token);
    
    if (!emailResult.success) {
      // The URL is deliberately not logged here: it carries a live verification
      // token, and sendVerificationEmail already logs it on this path when
      // running in development.
      console.error('Failed to resend verification email:', emailResult.error);
      return NextResponse.json({
        success: false,
        error: 'Failed to send verification email. Please try again later.'
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Verification email sent successfully. Please check your inbox.' 
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

