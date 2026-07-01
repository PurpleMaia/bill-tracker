'use server';

import { db } from '@/db/kysely/client';
import { applyPreferenceDefaults } from '@/lib/preferences';
import type { UserPreferences } from '@/types/preferences';

/**
 * Returns the user's preferences, applying defaults when no row exists.
 * Always returns a fully-populated object.
 */
export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const row = await db
    .selectFrom('user_preferences')
    .select(['ai_opt_in', 'kanban_detailed_view'])
    .where('user_id', '=', userId)
    .executeTakeFirst();

  return applyPreferenceDefaults(row ?? null);
}

/**
 * Upserts the user's preferences with the given patch and returns the full,
 * defaults-applied preferences. Only known boolean fields are written.
 */
export async function updateUserPreferences(
  userId: string,
  patch: Partial<UserPreferences>,
): Promise<UserPreferences> {
  // Whitelist the writable fields so callers can't inject arbitrary columns.
  const writable: Partial<UserPreferences> = {};
  if (typeof patch.ai_opt_in === 'boolean') writable.ai_opt_in = patch.ai_opt_in;
  if (typeof patch.kanban_detailed_view === 'boolean') {
    writable.kanban_detailed_view = patch.kanban_detailed_view;
  }

  await db
    .insertInto('user_preferences')
    .values({
      user_id: userId,
      ...writable,
      updated_at: new Date(),
    })
    .onConflict((oc) =>
      oc.column('user_id').doUpdateSet({
        ...writable,
        updated_at: new Date(),
      }),
    )
    .execute();

  return getUserPreferences(userId);
}
