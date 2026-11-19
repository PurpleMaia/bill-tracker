import { getAppUrl } from '@/lib/core/app-url';

/**
 * Routes for the Active Boards section. Public boards live at /org/<slug>, not
 * under /community, so a slug like "following" can't collide with a tab.
 */

/** App-relative link to an org's public board. */
export function publicBoardPath(slug: string): string {
  return `/org/${encodeURIComponent(slug)}`;
}

/** Absolute link to an org's public board, for sharing outside the app. */
export function publicBoardUrl(slug: string): string {
  return `${getAppUrl()}${publicBoardPath(slug)}`;
}

/** Whether a path belongs to Community (Browse, Following, Public View, a public board). */
export function isActiveBoardsPath(pathname: string): boolean {
  return pathname === '/community' || pathname.startsWith('/community/') || pathname.startsWith('/org/');
}

/**
 * Sub-nav highlight. Browse is /community itself, so it matches exactly; a
 * public board page also counts as Browse, since that's where people open it.
 */
export function isActiveBoardsTabActive(href: string, pathname: string): boolean {
  if (href === '/community') return pathname === '/community' || pathname.startsWith('/org/');
  return pathname === href || pathname.startsWith(`${href}/`);
}
