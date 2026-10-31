'use server';

import { requireSession } from '@/lib/auth/auth-guards';
import { profileSchema } from '@/lib/auth/validators';
import { updateUserProfile } from '@/db/queries/users';
import type { User } from '@/types/user';

/**
 * Server-action arm for data.profile.update. Edits the caller's own name.
 *
 * Validation failures are returned, not thrown: Next.js redacts thrown
 * server-action messages in production, and the user needs to see e.g.
 * "First name cannot exceed 100 characters." profile.client.ts unwraps this
 * into a throw, matching the fetch arm.
 */
export async function updateProfileAction(input: {
  firstName: string;
  lastName: string;
}): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
  const { user } = await requireSession.fromAction();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') };
  }
  return { ok: true, user: await updateUserProfile(user.id, parsed.data) };
}
