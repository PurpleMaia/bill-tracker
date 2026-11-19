import { getAppUrl } from '@/lib/core/app-url';

/**
 * Routes for the Active Boards section. Public boards live at /org/<slug>, not
 * under /boards, so a slug like "browse" can't collide with /boards/browse.
 */

/** App-relative link to an org's public board. */
export function publicBoardPath(slug: string): string {
  return `/org/${encodeURIComponent(slug)}`;
}

/** Absolute link to an org's public board, for sharing outside the app. */
export function publicBoardUrl(slug: string): string {
  return `${getAppUrl()}${publicBoardPath(slug)}`;
}

/** Whether a path belongs to Active Boards (Following, Browse, a public board). */
export function isActiveBoardsPath(pathname: string): boolean {
  return pathname.startsWith('/boards') || pathname.startsWith('/org/');
}

/**
 * Sub-nav highlight. Following is exact; a public board page counts as Browse,
 * since that's where people open it from.
 */
export function isActiveBoardsTabActive(href: string, pathname: string): boolean {
  if (href === '/boards') return pathname === '/boards';
  if (href === '/boards/browse' && pathname.startsWith('/org/')) return true;
  return pathname.startsWith(href);
}
