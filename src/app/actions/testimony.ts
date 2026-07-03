'use server';

import { requireSession, requireMembership } from '@/lib/auth-guards';
import {
  getTestimonyDraft,
  getTestimonyStatuses,
  markTestimonySubmitted,
  upsertTestimonyDraft,
} from '@/db/queries/testimony';
import type { TestimonyDraft, TestimonyDraftInput, TestimonyStatus } from '@/types/testimony';

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

/** Server-action arm for data.testimony.markSubmitted. Flags the caller's own testimony. */
export async function markTestimonySubmittedAction(billId: string): Promise<TestimonyDraft> {
  const { user } = await requireSession.fromAction();
  return markTestimonySubmitted(user.id, billId);
}

/** Server-action arm for data.testimony.getStatuses. The caller's per-bill progress. */
export async function getTestimonyStatusesAction(): Promise<TestimonyStatus[]> {
  const { user } = await requireSession.fromAction();
  return getTestimonyStatuses(user.id);
}
