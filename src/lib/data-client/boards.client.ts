import type { Bill } from '@/types/legislation';
import type { PublicOrg, MyOrg } from '@/types/tenant';
import { defineClient } from './define-client';
import type {
  GetBoardParams,
  FollowParams,
  OrgTestimonyStatusParams,
  SetPublicBoardParams,
  SetOrgDescriptionParams,
  OrgSettingsParams,
  MyOrgStatsParams,
} from './boards.params';
import {
  listPublicOrgsAction,
  listFollowedOrgsAction,
  getMyOrgStatsAction,
  followOrgAction,
  unfollowOrgAction,
  getBoardAction,
  getMyTrackedBillIdsAction,
  getOrgTestimonyStatusAction,
  getOrgSettingsAction,
  setPublicBoardAction,
  setOrgDescriptionAction,
} from '@/app/actions/boards';

// ---- fetch arm (hits /api/boards*, unwraps the HTTP envelope) ----

async function listPublicOrgsFetch(): Promise<PublicOrg[]> {
  const res = await fetch('/api/boards?scope=public');
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load orgs');
  return ((await res.json()).orgs ?? []) as PublicOrg[];
}

async function listFollowedOrgsFetch(): Promise<PublicOrg[]> {
  const res = await fetch('/api/boards?scope=followed');
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load followed orgs');
  return ((await res.json()).orgs ?? []) as PublicOrg[];
}

async function getMyOrgStatsFetch(params: MyOrgStatsParams): Promise<MyOrg | null> {
  const qs = new URLSearchParams({ scope: 'mine', tenantId: params.tenantId });
  const res = await fetch(`/api/boards?${qs.toString()}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load your org');
  return (((await res.json()).org ?? null) as MyOrg | null);
}

async function followOrgFetch(params: FollowParams): Promise<void> {
  const res = await fetch('/api/boards/follow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: params.tenantId }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to follow');
}

async function unfollowOrgFetch(params: FollowParams): Promise<void> {
  const res = await fetch('/api/boards/follow', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: params.tenantId }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to unfollow');
}

async function getBoardFetch(params: GetBoardParams): Promise<Bill[]> {
  const qs = new URLSearchParams({ showArchived: String(params.showArchived) });
  const res = await fetch(`/api/boards/${params.tenantId}/bills?${qs.toString()}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load board');
  return ((await res.json()).bills ?? []) as Bill[];
}

async function getMyTrackedBillIdsFetch(): Promise<string[]> {
  const res = await fetch('/api/boards/tracked-ids');
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load tracked bills');
  return ((await res.json()).ids ?? []) as string[];
}

async function getOrgTestimonyStatusFetch(params: OrgTestimonyStatusParams): Promise<string[]> {
  const qs = new URLSearchParams({ showArchived: 'true', testimony: 'true' });
  const res = await fetch(`/api/boards/${params.tenantId}/bills?${qs.toString()}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load testimony status');
  const data = await res.json();
  const wanted = new Set(params.billIds);
  return ((data.testimonyBillIds ?? []) as string[]).filter((id) => wanted.has(id));
}

async function getOrgSettingsFetch(
  params: OrgSettingsParams,
): Promise<{ publicBoard: boolean; description: string }> {
  const res = await fetch(`/api/tenants/${params.tenantId}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load org settings');
  const { tenant } = await res.json();
  return { publicBoard: Boolean(tenant?.public_board), description: tenant?.description ?? '' };
}

async function setPublicBoardFetch(params: SetPublicBoardParams): Promise<void> {
  const res = await fetch(`/api/tenants/${params.tenantId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_board: params.enabled }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to save org settings');
}

async function setOrgDescriptionFetch(params: SetOrgDescriptionParams): Promise<void> {
  const res = await fetch(`/api/tenants/${params.tenantId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: params.description }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to save org description');
}

export const boardsClient = defineClient('boards', {
  listPublicOrgs: { action: listPublicOrgsAction, fetch: listPublicOrgsFetch },
  listFollowed: { action: listFollowedOrgsAction, fetch: listFollowedOrgsFetch },
  getMyOrgStats: { action: getMyOrgStatsAction, fetch: getMyOrgStatsFetch },
  follow: { action: followOrgAction, fetch: followOrgFetch },
  unfollow: { action: unfollowOrgAction, fetch: unfollowOrgFetch },
  getBoard: { action: getBoardAction, fetch: getBoardFetch },
  getMyTrackedBillIds: { action: getMyTrackedBillIdsAction, fetch: getMyTrackedBillIdsFetch },
  getOrgTestimonyStatus: { action: getOrgTestimonyStatusAction, fetch: getOrgTestimonyStatusFetch },
  getOrgSettings: { action: getOrgSettingsAction, fetch: getOrgSettingsFetch },
  setPublicBoard: { action: setPublicBoardAction, fetch: setPublicBoardFetch },
  setOrgDescription: { action: setOrgDescriptionAction, fetch: setOrgDescriptionFetch },
});
