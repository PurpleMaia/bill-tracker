'use server';

import type { Tag } from '@/types/legislation';
import { requireAdmin, requireMembership } from '@/lib/auth/auth-guards';
import { tagsSchema, bulkTagsSchema } from '@/lib/auth/validators';
import {
  getAllTags,
  getBillTags,
  updateBillTags,
  bulkUpdateBillTags,
  createTag,
  updateTag,
  deleteTag,
} from '@/db/queries/tags';

// ==============================================
// TAGS — SERVER ACTIONS
// ==============================================
// Guarded wrappers over db/queries/tags. Tags are tenant-scoped: any member of
// the org can read them; creating/editing tags and changing a bill's tags is
// org-admin only (matching POST /api/bills/[id]/tags and the UI's gating).

export async function getTagsAction(params: { tenantId: string }): Promise<Tag[]> {
  await requireMembership.fromAction(params.tenantId);
  return getAllTags(params.tenantId);
}

export async function getBillTagsAction(params: { billId: string; tenantId: string }): Promise<Tag[]> {
  await requireMembership.fromAction(params.tenantId);
  return getBillTags(params.billId, params.tenantId);
}

export async function updateBillTagsAction(params: {
  billId: string;
  tagIds: string[];
  tenantId: string;
}): Promise<Tag[]> {
  await requireAdmin.fromAction(params.tenantId);
  const { tagIds } = tagsSchema.parse({ tagIds: params.tagIds });
  return updateBillTags(params.billId, tagIds, params.tenantId);
}

export async function bulkUpdateBillTagsAction(params: {
  billIds: string[];
  tagIds: string[];
  mode: 'add' | 'remove';
  tenantId: string;
}): Promise<Record<string, Tag[]>> {
  const { user } = await requireAdmin.fromAction(params.tenantId);
  const { billIds, tagIds, mode } = bulkTagsSchema.parse(params);
  return bulkUpdateBillTags(billIds, tagIds, mode, params.tenantId, user.id);
}

export async function createTagAction(params: {
  name: string;
  color?: string;
  tenantId: string;
}): Promise<Tag> {
  await requireAdmin.fromAction(params.tenantId);
  return createTag(params.name, params.color, params.tenantId);
}

export async function updateTagAction(params: {
  id: string;
  name: string;
  color?: string;
  tenantId: string;
}): Promise<Tag> {
  await requireAdmin.fromAction(params.tenantId);
  return updateTag(params.id, params.name, params.color, params.tenantId);
}

export async function deleteTagAction(params: { id: string; tenantId: string }): Promise<void> {
  await requireAdmin.fromAction(params.tenantId);
  await deleteTag(params.id, params.tenantId);
}
