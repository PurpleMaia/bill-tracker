export interface UserPreferences {
  ai_opt_in: boolean;
  kanban_detailed_view: boolean;
  interest_topics: string[];
  interest_keywords: string[];
  onboarded_at: string | null; // ISO string
}

export interface PreferencesPatch {
  ai_opt_in?: boolean;
  kanban_detailed_view?: boolean;
  interest_topics?: string[];
  interest_keywords?: string[];
  mark_onboarded?: true; // server stamps now(); client never sends a time
}
