import { describe, it, expect } from 'vitest';
import { applyPreferenceDefaults, DEFAULT_PREFERENCES } from '@/lib/core/preferences';

describe('applyPreferenceDefaults', () => {
  it('returns all-false defaults for null', () => {
    expect(applyPreferenceDefaults(null)).toEqual({
      ai_opt_in: false,
      kanban_detailed_view: false,
    });
  });

  it('returns defaults for undefined', () => {
    expect(applyPreferenceDefaults(undefined)).toEqual(DEFAULT_PREFERENCES);
  });

  it('fills missing fields from a partial row', () => {
    expect(applyPreferenceDefaults({ ai_opt_in: true })).toEqual({
      ai_opt_in: true,
      kanban_detailed_view: false,
    });
  });

  it('passes a full row through unchanged', () => {
    const full = { ai_opt_in: true, kanban_detailed_view: true };
    expect(applyPreferenceDefaults(full)).toEqual(full);
  });

  it('does not mutate the input', () => {
    const input = { ai_opt_in: true };
    applyPreferenceDefaults(input);
    expect(input).toEqual({ ai_opt_in: true });
  });
});
