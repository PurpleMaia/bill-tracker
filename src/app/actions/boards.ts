'use server';

import type { Bill } from '@/types/legislation';
import type { PublicOrg, MyOrg } from '@/types/tenant';
import { requireSession, requireAdmin, requireMembership } from '@/lib/auth-guards';
import { ApiError } from '@/lib/errors';
import {
  listPublicTenants,
  listFollowedTenants,
  followOrg,
  unfollowOrg,
  getPublicTenant,
  getMyOrgStats,
  getTenantSettings,
  setPublicBoard,
  setTenantDescription,
} from '@/db/queries/tenants';
import { getOrgTestimonyBillIds } from '@/db/queries/testimony';
import { getAllTrackedBills, getUserTrackedBillIds } from '@/db/queries/bills-read';
import type {
  GetBoardParams,
  FollowParams,
  OrgTestimonyStatusParams,
  SetPublicBoardParams,
  SetOrgDescriptionParams,
  OrgSettingsParams,
  MyOrgStatsParams,
} from '@/lib/data-client/boards.params';

export async function listPublicOrgsAction(): Promise<PublicOrg[]> {
  const { user } = await requireSession.fromAction();
  return listPublicTenants(user.id);
}

export async function getMyOrgStatsAction(params: MyOrgStatsParams): Promise<MyOrg | null> {
  const { user } = await requireMembership.fromAction(params.tenantId);
  return getMyOrgStats(params.tenantId, user.id);
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

export async function getMyTrackedBillIdsAction(): Promise<string[]> {
  const { user } = await requireSession.fromAction();
  return getUserTrackedBillIds(user.id);
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
): Promise<{ publicBoard: boolean; description: string }> {
  await requireAdmin.fromAction(params.tenantId);
  return getTenantSettings(params.tenantId);
}

export async function setPublicBoardAction(params: SetPublicBoardParams): Promise<void> {
  await requireAdmin.fromAction(params.tenantId);
  await setPublicBoard(params.tenantId, params.enabled);
}

export async function setOrgDescriptionAction(params: SetOrgDescriptionParams): Promise<void> {
  await requireAdmin.fromAction(params.tenantId);
  await setTenantDescription(params.tenantId, params.description);
}
