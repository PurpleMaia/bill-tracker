import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import {
  consumePasswordResetToken,
  deleteAllUserSessions,
  peekPasswordResetToken,
  updateUserPassword,
} from '@/db/queries/password-reset';
import { createSession } from '@/lib/auth/session';
import { setSessionCookie } from '@/lib/auth/cookies';
import { getUserMemberships } from '@/db/queries/tenants';
import { resetPasswordSchema } from '@/lib/auth/validators';
import { limitFixedWindow, retryAfterMs } from '@/lib/core/ratelimit-memory';
import { getClientIp } from '@/lib/core/client-ip';

const RESET_PASSWORD_RATE_LIMIT = { limit: 5, windowMs: 15 * 60_000 };

/** Matches the cost used by registerUser, so all stored hashes are comparable. */
const BCRYPT_COST = 10;

/**
 * Checks a reset token's validity WITHOUT consuming it, so the reset page can
 * distinguish "expired link" from "ready to reset" on load.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ valid: false }, { status: 200 });
    }

    const valid = await peekPasswordResetToken(token);
    return NextResponse.json({ valid }, { status: 200 });
  } catch (error) {
    console.error('[RESET PASSWORD / validate]', error);
    return NextResponse.json({ valid: false }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);
    const rl = limitFixedWindow(
      `reset-password:${clientIp}`,
      RESET_PASSWORD_RATE_LIMIT.limit,
      RESET_PASSWORD_RATE_LIMIT.windowMs
    );
    if (!rl.ok) {
      const retryMs = retryAfterMs(rl.resetAt);
      return NextResponse.json(
        { error: 'Too many reset attempts. Please try again later.', retryAfterMs: retryMs },
        { status: 429, headers: { 'Retry-After': Math.ceil(retryMs / 1000).toString() } }
      );
    }

    const { token, password } = await request.json();
    const validation = resetPasswordSchema.safeParse({ token, password });
    if (!validation.success) {
      const messages = validation.error.issues.map(i => i.message).join(', ');
      return NextResponse.json({ error: messages }, { status: 400 });
    }

    // Claim the token FIRST. If a later step fails the user must request a new
    // link, which is the safe direction to fail — no reusable token is left behind.
    const userId = await consumePasswordResetToken(validation.data.token);
    if (!userId) {
      return NextResponse.json(
        { error: 'This reset link is invalid or has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(validation.data.password, BCRYPT_COST);
    await updateUserPassword(userId, hashedPassword);

    // Evict any session predating the reset, including an attacker's.
    await deleteAllUserSessions(userId);

    const sessionToken = await createSession(userId);
    const memberships = await getUserMemberships(userId);

    return NextResponse.json(
      { success: true, memberships },
      {
        status: 200,
        headers: { 'Set-Cookie': setSessionCookie(sessionToken) },
      }
    );
  } catch (error) {
    console.error('[RESET PASSWORD]', error);
    return NextResponse.json({ error: 'Failed to reset password. Please try again.' }, { status: 500 });
  }
}
