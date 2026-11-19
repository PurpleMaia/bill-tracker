'use server';

import { requireSession, requireMembership } from '@/lib/auth/auth-guards';
import {
  createTestimonyForCurrentRound,
  deleteTestimony,
  deleteTestimonyById,
  getTestimonyById,
  getTestimonyDraft,
  getTestimonyStatuses,
  listTestimonyProspects,
  listBillTestimonies,
  listTestimonyBillOptions,
  listUserTestimonies,
  markTestimonySubmitted,
  markTestimonySubmittedById,
  updateTestimony,
  upsertTestimonyDraft,
} from '@/db/queries/testimony';
import type {
  TestimonyBillOption,
  TestimonyCreateInput,
  TestimonyDraft,
  TestimonyDraftInput,
  TestimonyListItem,
  TestimonyProspect,
  TestimonyStatus,
  TestimonyUpdateInput,
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

/** Server-action arm for data.testimony.getById. The caller's own testimony, or null. */
export async function getTestimonyByIdAction(testimonyId: string): Promise<TestimonyDraft | null> {
  const { user } = await requireSession.fromAction();
  return getTestimonyById(user.id, testimonyId);
}

/** Server-action arm for data.testimony.listForBill. The caller's testimonies for one bill. */
export async function listBillTestimoniesAction(billId: string): Promise<TestimonyDraft[]> {
  const { user } = await requireSession.fromAction();
  return listBillTestimonies(user.id, billId);
}

/** Server-action arm for data.testimony.create. Starts the caller's testimony for the bill's current round. */
export async function createTestimonyAction(input: TestimonyCreateInput): Promise<TestimonyDraft> {
  const { user } = input.tenantId
    ? await requireMembership.fromAction(input.tenantId)
    : await requireSession.fromAction();
  return createTestimonyForCurrentRound(user.id, input);
}

/** Server-action arm for data.testimony.update. Saves one of the caller's own testimonies. */
export async function updateTestimonyAction(
  testimonyId: string,
  input: TestimonyUpdateInput,
): Promise<TestimonyDraft> {
  const { user } = input.tenantId
    ? await requireMembership.fromAction(input.tenantId)
    : await requireSession.fromAction();
  return updateTestimony(user.id, testimonyId, input);
}

/** Server-action arm for data.testimony.markSubmittedById. Flags one of the caller's own testimonies. */
export async function markTestimonySubmittedByIdAction(testimonyId: string): Promise<TestimonyDraft> {
  const { user } = await requireSession.fromAction();
  return markTestimonySubmittedById(user.id, testimonyId);
}

/** Server-action arm for data.testimony.removeById. Deletes one of the caller's own testimonies. */
export async function deleteTestimonyByIdAction(testimonyId: string): Promise<void> {
  const { user } = await requireSession.fromAction();
  return deleteTestimonyById(user.id, testimonyId);
}

/** Server-action arm for data.testimony.billOptions. The caller's followed bills for the New testimony picker. */
export async function listTestimonyBillOptionsAction(): Promise<TestimonyBillOption[]> {
  const { user } = await requireSession.fromAction();
  return listTestimonyBillOptions(user.id);
}
