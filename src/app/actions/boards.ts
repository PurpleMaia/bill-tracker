'use server';

import type { Bill } from '@/types/legislation';
import type { PublicOrg } from '@/types/tenant';
import { requireSession, requireAdmin } from '@/lib/auth-guards';
import { ApiError } from '@/lib/errors';
import {
  listPublicTenants,
  listFollowedTenants,
  followOrg,
  unfollowOrg,
  getPublicTenant,
  getTenantPublicBoard,
  setPublicBoard,
} from '@/db/queries/tenants';
import { getOrgTestimonyBillIds } from '@/db/queries/testimony';
import { getAllTrackedBills } from '@/db/queries/bills-read';
import type {
  GetBoardParams,
  FollowParams,
  OrgTestimonyStatusParams,
  SetPublicBoardParams,
  OrgSettingsParams,
} from '@/lib/data-client/boards.params';

export async function listPublicOrgsAction(): Promise<PublicOrg[]> {
  const { user } = await requireSession.fromAction();
  return listPublicTenants(user.id);
}

export async function listFollowedOrgsAction(): Promise<PublicOrg[]> {
  const { user } = await requireSession.fromAction();
  return listFollowedTenants(user.id);
}

export async function followOrgAction(params: FollowParams): Promise<void> {
  const { user } = await requireSession.fromAction();
  // Only allow following orgs that are actually public.
  const org = await getPublicTenant(params.tenantId);
  if (!org) throw new ApiError('TENANT_NOT_FOUND', 404, 'Organization not found');
  await followOrg(user.id, params.tenantId);
}

export async function unfollowOrgAction(params: FollowParams): Promise<void> {
  const { user } = await requireSession.fromAction();
  await unfollowOrg(user.id, params.tenantId);
}

export async function getBoardAction(params: GetBoardParams): Promise<Bill[]> {
  await requireSession.fromAction();
  const org = await getPublicTenant(params.tenantId);
  if (!org) throw new ApiError('BOARD_NOT_FOUND', 404, 'Board not found');
  // includeTrackedBy: false — person-tracking data never leaves the DB here.
  return getAllTrackedBills(params.showArchived, params.tenantId, false);
}

export async function getOrgTestimonyStatusAction(
  params: OrgTestimonyStatusParams,
): Promise<string[]> {
  await requireSession.fromAction();
  const org = await getPublicTenant(params.tenantId);
  if (!org) throw new ApiError('BOARD_NOT_FOUND', 404, 'Board not found');
  return getOrgTestimonyBillIds(params.tenantId, params.billIds);
}

export async function getOrgSettingsAction(
  params: OrgSettingsParams,
): Promise<{ publicBoard: boolean }> {
  await requireAdmin.fromAction(params.tenantId);
  const publicBoard = await getTenantPublicBoard(params.tenantId);
  return { publicBoard };
}

export async function setPublicBoardAction(params: SetPublicBoardParams): Promise<void> {
  await requireAdmin.fromAction(params.tenantId);
  await setPublicBoard(params.tenantId, params.enabled);
}
