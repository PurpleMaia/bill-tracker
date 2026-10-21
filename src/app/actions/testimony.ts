'use server';

import { requireSession, requireMembership } from '@/lib/auth/auth-guards';
import {
  deleteTestimony,
  getTestimonyDraft,
  getTestimonyStatuses,
  listTestimonyProspects,
  listUserTestimonies,
  markTestimonySubmitted,
  upsertTestimonyDraft,
} from '@/db/queries/testimony';
import type {
  TestimonyDraft,
  TestimonyDraftInput,
  TestimonyListItem,
  TestimonyProspect,
  TestimonyStatus,
} from '@/types/testimony';

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

/** Server-action arm for data.testimony.remove. Deletes the caller's own testimony. */
export async function deleteTestimonyAction(billId: string): Promise<void> {
  const { user } = await requireSession.fromAction();
  return deleteTestimony(user.id, billId);
}

/** Server-action arm for data.testimony.list. The caller's testimonies with bill context. */
export async function listUserTestimoniesAction(): Promise<TestimonyListItem[]> {
  const { user } = await requireSession.fromAction();
  return listUserTestimonies(user.id);
}

/** Server-action arm for data.testimony.prospects. Tracked bills needing testimony. */
export async function listTestimonyProspectsAction(): Promise<TestimonyProspect[]> {
  const { user } = await requireSession.fromAction();
  return listTestimonyProspects(user.id);
}

/** Server-action arm for data.testimony.getStatuses. The caller's per-bill progress. */
export async function getTestimonyStatusesAction(): Promise<TestimonyStatus[]> {
  const { user } = await requireSession.fromAction();
  return getTestimonyStatuses(user.id);
}
