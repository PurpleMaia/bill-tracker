'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/contexts/auth-context';
import { TestimoniesSubNav } from '@/components/testimony/testimonies-subnav';
import { ActiveBoardsSubNav } from '@/components/boards/active-boards-subnav';
import { ViewToggle } from './view-toggle';

/**
 * Contextual sub-navigation for the header's center slot.
 * '/your-bills' hosts the board view toggle (logged-in only — hidden over the
 * login wall); compact icon-only variant on mobile. It lives in the global header
 * rather than the board header so it stays reachable from the admin view.
 * /testimonies renders its All/Drafts/Submitted tabs (both logged-in only
 * — hidden over the login wall). /boards renders its View Board/Browse tabs
 * for everyone, since browsing public orgs needs no account; the View Board
 * tab itself gates. /search renders nothing yet; its sub-nav lands here later.
 */
export function HeaderSubNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  if (pathname.startsWith('/your-bills') && user) {
    return (
      <>
        <div className="hidden md:block">
          <ViewToggle />
        </div>
        <div className="md:hidden">
          <ViewToggle compact />
        </div>
      </>
    );
  }

  if (pathname.startsWith('/testimonies') && user) {
    return (
      <>
        <div className="hidden md:block">
          <TestimoniesSubNav />
        </div>
        <div className="md:hidden flex justify-center">
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
