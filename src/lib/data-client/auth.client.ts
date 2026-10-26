import { defineClient } from './define-client';
import { forgotPasswordAction } from '@/app/actions/auth';

// ---- action arm (unwraps the result into a throw, like the fetch arm) ----

async function forgotPasswordViaAction(email: string): Promise<void> {
  const result = await forgotPasswordAction(email);
  if (!result.ok) throw new Error(result.error);
}

// ---- fetch arm (hits /api/auth/forgot-password) ----

async function forgotPasswordFetch(email: string): Promise<void> {
  const res = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.error === 'string' ? err.error : 'Could not send reset link');
  }
}

export const authClient = defineClient('auth', {
  forgotPassword: { action: forgotPasswordViaAction, fetch: forgotPasswordFetch },
});
