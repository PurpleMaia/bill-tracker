import { defineClient } from './define-client';
import {
  getPreferencesAction,
  updatePreferencesAction,
} from '@/app/actions/preferences';
import type { UserPreferences } from '@/types/preferences';

// ---- fetch arm (hits /api/preferences) ----

async function getPreferencesFetch(): Promise<UserPreferences> {
  const res = await fetch('/api/preferences');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load preferences');
  }
  return res.json();
}

async function updatePreferencesFetch(
  patch: Partial<UserPreferences>,
): Promise<UserPreferences> {
  const res = await fetch('/api/preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update preferences');
  }
  return res.json();
}

export const preferencesClient = defineClient('preferences', {
  get: { action: getPreferencesAction, fetch: getPreferencesFetch },
  update: { action: updatePreferencesAction, fetch: updatePreferencesFetch },
});
