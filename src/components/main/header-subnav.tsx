'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/contexts/auth-context';
import { TakeActionSubNav } from '@/components/take-action/take-action-subnav';
import { isTakeActionPath } from '@/lib/take-action/routes';
import { isActiveBoardsPath } from '@/lib/boards/board-routes';
import { ActiveBoardsSubNav } from '@/components/boards/active-boards-subnav';
import { ViewToggle } from './view-toggle';

/**
 * Contextual sub-navigation for the header's center slot.
 * '/tracker' hosts the board view toggle (logged-in only — hidden over
 * the login wall); compact icon-only variant on mobile. It lives in the global header
 * rather than the board header so it stays reachable from the admin view.
 * /take-action renders its Testimony/Contact Legislators tabs (logged-in only
 * — both tabs sit behind a login wall). /community renders its Browse/Following tabs
 * for everyone, since browsing public orgs needs no account; the Following
 * tab itself gates. '/' and /find-bills render nothing yet; their sub-nav lands here later.
 */
export function HeaderSubNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  if (pathname.startsWith('/tracker') && user) {
    return (
      <>
        <div className="hidden md:block">
          <ViewToggle />
        </div>
        <div className="md:hidden flex justify-center">
          <ViewToggle compact />
        </div>
      </>
    );
  }

  if (isTakeActionPath(pathname) && user) {
    return (
      <>
        <div className="hidden md:block">
          <TakeActionSubNav />
        </div>
        <div className="md:hidden flex justify-center">
          <TakeActionSubNav compact />
        </div>
      </>
    );
  }

  // Shown logged out too: Browse is public, so the tabs must stay reachable.
  // Following is still gated — it renders BoardsLoginWall for signed-out users.
  // Public /org/<slug> boards show the tabs too, with Browse highlighted.
  if (isActiveBoardsPath(pathname)) {
    return (
      <>
        <div className="hidden md:block">
          <ActiveBoardsSubNav />
        </div>
        <div className="md:hidden flex justify-center">
          <ActiveBoardsSubNav compact />
        </div>
      </>
    );
  }

  return null;
}
