import { defineClient } from './define-client';
import { getRecommendationsAction } from '@/app/actions/recommendations';
import type { RecommendationsResponse } from '@/db/queries/recommendations';

// ---- fetch arm (hits /api/recommendations) ----

async function getRecommendationsFetch(): Promise<RecommendationsResponse> {
  const res = await fetch('/api/recommendations');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load recommendations');
  }
  return res.json();
}

export const recommendationsClient = defineClient('recommendations', {
  get: { action: getRecommendationsAction, fetch: getRecommendationsFetch },
});
