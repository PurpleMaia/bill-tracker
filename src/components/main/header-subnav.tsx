'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/contexts/auth-context';
import { ViewToggle } from './view-toggle';

/**
 * Contextual sub-navigation for the header's center slot.
 * '/' hosts the board view toggle (logged-in only — hidden over the login
 * wall). /search, /testimonies, /boards render nothing yet; their sub-navs
 * land here later.
 */
export function HeaderSubNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  if (pathname === '/' && user) {
    return <ViewToggle />;
  }

  return null;
}
