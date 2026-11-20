import { getAppUrl } from '@/lib/core/app-url';

/**
 * Routes for the Community section. Every org's board lives at
 * /community/<slug> — the link an org shares and its admins' Your Organization
 * tab alike — beside the fixed Browse (/community) and Following pages. Slugs
 * that would collide with those are reserved (see isReservedSlug).
 */

export const COMMUNITY_BROWSE = '/community';
export const COMMUNITY_FOLLOWING = '/community/following';

/** App-relative link to an org's board. */
export function publicBoardPath(slug: string): string {
  return `${COMMUNITY_BROWSE}/${encodeURIComponent(slug)}`;
}

/** Absolute link to an org's board, for sharing outside the app. */
export function publicBoardUrl(slug: string): string {
  return `${getAppUrl()}${publicBoardPath(slug)}`;
}

/** Whether a path belongs to Community. */
export function isActiveBoardsPath(pathname: string): boolean {
  return pathname === COMMUNITY_BROWSE || pathname.startsWith(`${COMMUNITY_BROWSE}/`);
}

export type CommunityTab = 'browse' | 'following' | 'your-organization';

/**
 * Which sub-nav tab a path belongs to. Your own org's board is Your
 * Organization; any other org's board counts as Browse, since that's where it
 * was opened from.
 */
export function communityTab(pathname: string, ownSlug: string | null): CommunityTab | null {
  if (!isActiveBoardsPath(pathname)) return null;
  if (pathname === COMMUNITY_FOLLOWING || pathname.startsWith(`${COMMUNITY_FOLLOWING}/`)) return 'following';
  if (ownSlug && pathname === publicBoardPath(ownSlug)) return 'your-organization';
  return 'browse';
}

/** App-relative link to an org's board for framing on other websites. */
export function embedBoardPath(slug: string): string {
  return `/embed/${encodeURIComponent(slug)}`;
}

/** Absolute embed link — the iframe `src` orgs paste into their site. */
export function embedBoardUrl(slug: string): string {
  return `${getAppUrl()}${embedBoardPath(slug)}`;
}

/** A bill opened on an org's public board (the board reopens `?bill=`). */
export function publicBillUrl(slug: string, billId: string): string {
  return `${publicBoardUrl(slug)}?bill=${encodeURIComponent(billId)}`;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** The iframe embed code shown in Org Settings. */
export function embedSnippet(slug: string, orgName: string): string {
  const title = escapeAttr(`${orgName}’s Tracker`);
  return `<iframe src="${embedBoardUrl(slug)}" title="${title}" width="100%" height="600" style="border:0" loading="lazy"></iframe>`;
}
