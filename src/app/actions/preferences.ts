'use server';

import { requireSession } from '@/lib/auth/auth-guards';
import {
  getUserPreferences,
  updateUserPreferences,
} from '@/db/queries/user-preferences';
import type { UserPreferences } from '@/types/preferences';

/** Server-action arm for data.preferences.get. Returns the caller's own prefs. */
export async function getPreferencesAction(): Promise<UserPreferences> {
  const { user } = await requireSession.fromAction();
  return getUserPreferences(user.id);
}

/** Server-action arm for data.preferences.update. Patches the caller's own prefs. */
export async function updatePreferencesAction(
  patch: Partial<UserPreferences>,
): Promise<UserPreferences> {
  const { user } = await requireSession.fromAction();
  return updateUserPreferences(user.id, patch);
}
