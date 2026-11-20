import { db } from '@/db/kysely/client';
import { applyPreferenceDefaults } from '@/lib/core/preferences';
import { normalizeInterests } from '@/lib/bills/recommendation-topics';
import type { PreferencesPatch, UserPreferences } from '@/types/preferences';

/**
 * Returns the user's preferences, applying defaults when no row exists.
 * Always returns a fully-populated object.
 */
export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const row = await db
    .selectFrom('user_preferences')
    .select([
      'ai_opt_in',
      'kanban_detailed_view',
      'interest_topics',
      'interest_keywords',
      'onboarded_at',
    ])
    .where('user_id', '=', userId)
    .executeTakeFirst();

  if (!row) return applyPreferenceDefaults(null);
  return applyPreferenceDefaults({
    ...row,
    onboarded_at: row.onboarded_at ? new Date(row.onboarded_at).toISOString() : null,
  });
}

/**
 * Upserts the user's preferences with the given patch and returns the full,
 * defaults-applied preferences. Only known fields are written; interests are
 * normalized and `mark_onboarded` stamps the server clock.
 */
export async function updateUserPreferences(
  userId: string,
  patch: PreferencesPatch,
): Promise<UserPreferences> {
  // Whitelist the writable fields so callers can't inject arbitrary columns.
  const writable: {
    ai_opt_in?: boolean;
    kanban_detailed_view?: boolean;
    interest_topics?: string[];
    interest_keywords?: string[];
    onboarded_at?: Date;
  } = {};
  if (typeof patch.ai_opt_in === 'boolean') writable.ai_opt_in = patch.ai_opt_in;
  if (typeof patch.kanban_detailed_view === 'boolean') {
    writable.kanban_detailed_view = patch.kanban_detailed_view;
  }
  const hasTopics = patch.interest_topics !== undefined;
  const hasKeywords = patch.interest_keywords !== undefined;
  if (hasTopics || hasKeywords) {
    const normalized = normalizeInterests({
      topics: patch.interest_topics,
      keywords: patch.interest_keywords,
    });
    if (hasTopics) writable.interest_topics = normalized.topics;
    if (hasKeywords) writable.interest_keywords = normalized.keywords;
  }
  if (patch.mark_onboarded === true) writable.onboarded_at = new Date();

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
