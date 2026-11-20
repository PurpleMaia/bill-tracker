'use server';

import { requireSession } from '@/lib/auth/auth-guards';
import {
  getRecommendedBills,
  type RecommendationsResponse,
} from '@/db/queries/recommendations';

/** Server-action arm for data.recommendations.get. Caller's own recommendations. */
export async function getRecommendationsAction(): Promise<RecommendationsResponse> {
  const { user } = await requireSession.fromAction();
  return getRecommendedBills(user.id);
}
