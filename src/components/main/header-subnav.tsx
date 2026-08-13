'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/contexts/auth-context';
import { TestimoniesSubNav } from '@/components/testimony/testimonies-subnav';
import { ActiveBoardsSubNav } from '@/components/boards/active-boards-subnav';
import { ViewToggle } from './view-toggle';

/**
 * Contextual sub-navigation for the header's center slot.
 * '/' hosts the board view toggle (logged-in only — hidden over the login
 * wall); compact icon-only variant on mobile. It lives in the global header
 * rather than the board header so it stays reachable from the admin view.
 * /testimonies renders its All/Drafts/Submitted tabs (both logged-in only
 * — hidden over the login wall). /boards renders its Browse/View Board tabs
 * for everyone, since browsing public orgs needs no account; the View Board
 * tab itself gates. /search renders nothing yet; its sub-nav lands here later.
 *
 * Labelled tabs only appear at xl. Below that the main nav's links reach far
 * enough left to collide with this centered track, so the compact icon-only
 * variant is used instead — measured, not guessed: full labels first clear the
 * main nav at 1280px.
 */
export function HeaderSubNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  if (pathname === '/' && user) {
    return (
      <>
        <div className="hidden xl:block">
          <ViewToggle />
        </div>
        <div className="xl:hidden">
          <ViewToggle compact />
        </div>
      </>
    );
  }

  if (pathname.startsWith('/testimonies') && user) {
    return (
      <>
        <div className="hidden xl:block">
          <TestimoniesSubNav />
        </div>
        <div className="xl:hidden flex justify-center">
          <TestimoniesSubNav compact />
        </div>
      </>
    );
  }

  // Shown logged out too: Browse is public, so the tabs must stay reachable.
  // View Board is still gated — it renders BoardsLoginWall for signed-out users.
  if (pathname.startsWith('/boards')) {
    return (
      <>
        <div className="hidden xl:block">
          <ActiveBoardsSubNav />
        </div>
        <div className="xl:hidden flex justify-center">
          <ActiveBoardsSubNav compact />
        </div>
      </>
    );
  }

  return null;
}
