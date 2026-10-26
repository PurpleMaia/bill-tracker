'use server';

import { headers } from 'next/headers';
import { requestPasswordReset } from '@/db/queries/password-reset';
import { forgotPasswordSchema } from '@/lib/auth/validators';
import { limitFixedWindow } from '@/lib/core/ratelimit-memory';
import { getClientIp } from '@/lib/core/client-ip';
import { FORGOT_PASSWORD_RATE_LIMIT } from '@/lib/auth/rate-limits';

/**
 * Server-action arm for data.auth.forgotPassword.
 *
 * Returns a result rather than throwing: Next.js redacts thrown server-action
 * messages in production, and the user needs to see "too many requests" or a
 * validation error. auth.client.ts unwraps it into a throw, matching the fetch
 * arm. Like the route, it answers identically whether or not the account exists.
 */
export async function forgotPasswordAction(
  email: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rl = limitFixedWindow(
    `forgot-password:${getClientIp({ headers: await headers() })}`,
    FORGOT_PASSWORD_RATE_LIMIT.limit,
    FORGOT_PASSWORD_RATE_LIMIT.windowMs
  );
  if (!rl.ok) return { ok: false, error: 'Too many reset requests. Please try again later.' };

  const validation = forgotPasswordSchema.safeParse({ email });
  if (!validation.success) {
    return { ok: false, error: validation.error.issues.map((i) => i.message).join(', ') };
  }

  try {
    await requestPasswordReset(validation.data.email);
  } catch (error) {
    // Still neutral: an error here must not distinguish existing from missing accounts.
    console.error('[FORGOT PASSWORD]', error);
  }
  return { ok: true };
}
