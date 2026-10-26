import { defineClient } from './define-client';
import { updateProfileAction } from '@/app/actions/profile';
import type { User } from '@/types/user';

// ---- action arm (unwraps the result into a throw, like the fetch arm) ----

async function updateProfileViaAction(input: {
  firstName: string;
  lastName: string;
}): Promise<User> {
  const result = await updateProfileAction(input);
  if (!result.ok) throw new Error(result.error);
  return result.user;
}

// ---- fetch arm (hits /api/profile) ----

async function updateProfileFetch(input: {
  firstName: string;
  lastName: string;
}): Promise<User> {
  const res = await fetch('/api/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update profile');
  }
  return res.json();
}

export const profileClient = defineClient('profile', {
  update: { action: updateProfileViaAction, fetch: updateProfileFetch },
});
