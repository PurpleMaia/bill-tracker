'use server';

import { requireSession, requireMembership } from '@/lib/auth-guards';
import { getTestimonyDraft, upsertTestimonyDraft } from '@/db/queries/testimony';
import type { TestimonyDraft, TestimonyDraftInput } from '@/types/testimony';

/** Server-action arm for data.testimony.getDraft. Returns the caller's own draft. */
export async function getTestimonyDraftAction(billId: string): Promise<TestimonyDraft | null> {
  const { user } = await requireSession.fromAction();
  return getTestimonyDraft(user.id, billId);
}

/** Server-action arm for data.testimony.saveDraft. Upserts the caller's own draft. */
export async function saveTestimonyDraftAction(
  input: TestimonyDraftInput,
): Promise<TestimonyDraft> {
  const { user } = input.tenantId
    ? await requireMembership.fromAction(input.tenantId)
    : await requireSession.fromAction();
  return upsertTestimonyDraft(user.id, input);
}
