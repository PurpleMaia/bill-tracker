import { describe, it, expect } from 'vitest';
import { applyPreferenceDefaults, DEFAULT_PREFERENCES } from '@/lib/core/preferences';

describe('applyPreferenceDefaults', () => {
  it('returns defaults for null', () => {
    expect(applyPreferenceDefaults(null)).toEqual({
      ai_opt_in: false,
      kanban_detailed_view: false,
      interest_topics: [],
      interest_keywords: [],
      onboarded_at: null,
    });
  });

  it('returns defaults for undefined', () => {
    expect(applyPreferenceDefaults(undefined)).toEqual(DEFAULT_PREFERENCES);
  });

  it('fills missing fields from a partial row', () => {
    expect(applyPreferenceDefaults({ ai_opt_in: true })).toEqual({
      ai_opt_in: true,
      kanban_detailed_view: false,
      interest_topics: [],
      interest_keywords: [],
      onboarded_at: null,
    });
  });

  it('passes a full row through unchanged', () => {
    const full = {
      ai_opt_in: true,
      kanban_detailed_view: true,
      interest_topics: ['dairy'],
      interest_keywords: ['milk'],
      onboarded_at: '2026-01-01T00:00:00.000Z',
    };
    expect(applyPreferenceDefaults(full)).toEqual(full);
  });

  it('defaults interests to empty and not onboarded', () => {
    const p = applyPreferenceDefaults(null);
    expect(p.interest_topics).toEqual([]);
    expect(p.interest_keywords).toEqual([]);
    expect(p.onboarded_at).toBeNull();
  });

  it('does not mutate the input', () => {
    const input = { ai_opt_in: true };
    applyPreferenceDefaults(input);
    expect(input).toEqual({ ai_opt_in: true });
  });
});
