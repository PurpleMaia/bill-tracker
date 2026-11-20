import { defineClient } from './define-client';
import { getRecommendationsAction } from '@/app/actions/recommendations';
import type { RecommendationsResponse } from '@/db/queries/recommendations';

// ---- fetch arm (hits /api/recommendations) ----

async function getRecommendationsFetch(
  params: { tenantId?: string | null } = {},
): Promise<RecommendationsResponse> {
  const qs = params.tenantId ? `?tenantId=${encodeURIComponent(params.tenantId)}` : '';
  const res = await fetch(`/api/recommendations${qs}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load recommendations');
  }
  return res.json();
}

export const recommendationsClient = defineClient('recommendations', {
  get: { action: getRecommendationsAction, fetch: getRecommendationsFetch },
});
