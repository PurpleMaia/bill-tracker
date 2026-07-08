'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/contexts/auth-context';
import { ViewToggle } from './view-toggle';

/**
 * Contextual sub-navigation for the header's center slot.
 * '/' hosts the board view toggle (logged-in only — hidden over the login
 * wall); compact icon-only variant on mobile. It lives in the global header
 * rather than the board header so it stays reachable from the admin view.
 * /search, /testimonies, /boards render nothing yet; their sub-navs land
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

  return null;
}
