import { NextRequest, NextResponse } from 'next/server';
import { createPasswordResetToken, findUserByEmailForReset } from '@/db/queries/password-reset';
import { sendPasswordResetEmail } from '@/services/email';
import { forgotPasswordSchema } from '@/lib/auth/validators';
import { limitFixedWindow, retryAfterMs } from '@/lib/core/ratelimit-memory';
import { getClientIp } from '@/lib/core/client-ip';

const FORGOT_PASSWORD_RATE_LIMIT = { limit: 5, windowMs: 15 * 60_000 };

/**
 * Identical response whether or not the email belongs to an account.
 * This endpoint is unauthenticated, so a differing response would be an
 * account-existence oracle.
 */
const NEUTRAL_RESPONSE = {
  success: true,
  message: "If an account exists for that email, we've sent a reset link.",
};

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);
    const rl = limitFixedWindow(
      `forgot-password:${clientIp}`,
      FORGOT_PASSWORD_RATE_LIMIT.limit,
      FORGOT_PASSWORD_RATE_LIMIT.windowMs
    );
    if (!rl.ok) {
      const retryMs = retryAfterMs(rl.resetAt);
      return NextResponse.json(
        { error: 'Too many reset requests. Please try again later.', retryAfterMs: retryMs },
        { status: 429, headers: { 'Retry-After': Math.ceil(retryMs / 1000).toString() } }
      );
    }

    const { email } = await request.json();
    const validation = forgotPasswordSchema.safeParse({ email });
    if (!validation.success) {
      const messages = validation.error.issues.map(i => i.message).join(', ');
      return NextResponse.json({ error: messages }, { status: 400 });
    }

    const user = await findUserByEmailForReset(validation.data.email);

    if (user) {
      const rawToken = await createPasswordResetToken(user.id);
      // Delivery failures are logged inside the service; we never surface them,
      // since doing so would reveal that the account exists.
      await sendPasswordResetEmail(validation.data.email, user.username, rawToken);
    } else {
      console.log('[FORGOT PASSWORD] No account for requested email; returning neutral response.');
    }

    return NextResponse.json(NEUTRAL_RESPONSE, { status: 200 });
  } catch (error) {
    console.error('[FORGOT PASSWORD]', error);
    // Still neutral: an error here must not distinguish existing from missing accounts.
    return NextResponse.json(NEUTRAL_RESPONSE, { status: 200 });
  }
}
