import type { UserPreferences } from '@/types/preferences';

export const DEFAULT_PREFERENCES: UserPreferences = {
  ai_opt_in: false,
  kanban_detailed_view: false,
  interest_topics: [],
  interest_keywords: [],
  onboarded_at: null,
};

/** Fills any missing preference fields with defaults. Never mutates input. */
export function applyPreferenceDefaults(
  row: Partial<UserPreferences> | null | undefined,
): UserPreferences {
  return { ...DEFAULT_PREFERENCES, ...(row ?? {}) };
}
