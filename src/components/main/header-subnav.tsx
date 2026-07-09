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
 * — hidden over the login wall). /boards renders its View Board/Browse Orgs
 * tabs (also logged-in only). /search renders nothing yet; its sub-nav lands
 * here later.
 */
export function HeaderSubNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  if (pathname === '/' && user) {
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

  if (pathname.startsWith('/boards') && user) {
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
