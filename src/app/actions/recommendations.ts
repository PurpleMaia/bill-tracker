'use server';

import { requireSession } from '@/lib/auth/auth-guards';
import {
  getRecommendedBills,
  type RecommendationsResponse,
} from '@/db/queries/recommendations';

/**
 * Server-action arm for data.recommendations.get. Caller's own recommendations;
 * tenantId only scopes which of the caller's own tracked bills are left out.
 */
export async function getRecommendationsAction(
  params: { tenantId?: string | null } = {},
): Promise<RecommendationsResponse> {
  const { user } = await requireSession.fromAction();
  return getRecommendedBills(user.id, { tenantId: params.tenantId ?? null });
}
