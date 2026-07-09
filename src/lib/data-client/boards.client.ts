import type { Bill } from '@/types/legislation';
import type { PublicOrg } from '@/types/tenant';
import { defineClient } from './define-client';
import type {
  GetBoardParams,
  FollowParams,
  OrgTestimonyStatusParams,
} from './boards.params';
import {
  listPublicOrgsAction,
  listFollowedOrgsAction,
  followOrgAction,
  unfollowOrgAction,
  getBoardAction,
  getOrgTestimonyStatusAction,
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

async function getOrgTestimonyStatusFetch(params: OrgTestimonyStatusParams): Promise<string[]> {
  const qs = new URLSearchParams({ showArchived: 'true', testimony: 'true' });
  const res = await fetch(`/api/boards/${params.tenantId}/bills?${qs.toString()}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load testimony status');
  const data = await res.json();
  const wanted = new Set(params.billIds);
  return ((data.testimonyBillIds ?? []) as string[]).filter((id) => wanted.has(id));
}

export const boardsClient = defineClient('boards', {
  listPublicOrgs: { action: listPublicOrgsAction, fetch: listPublicOrgsFetch },
  listFollowed: { action: listFollowedOrgsAction, fetch: listFollowedOrgsFetch },
  follow: { action: followOrgAction, fetch: followOrgFetch },
  unfollow: { action: unfollowOrgAction, fetch: unfollowOrgFetch },
  getBoard: { action: getBoardAction, fetch: getBoardFetch },
  getOrgTestimonyStatus: { action: getOrgTestimonyStatusAction, fetch: getOrgTestimonyStatusFetch },
});
