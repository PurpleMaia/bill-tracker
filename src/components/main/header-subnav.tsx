'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/contexts/auth-context';
import { TestimoniesSubNav } from '@/components/testimony/testimonies-subnav';
import { ViewToggle } from './view-toggle';

/**
 * Contextual sub-navigation for the header's center slot.
 * '/' hosts the board view toggle, /testimonies its All/Drafts/Submitted
 * tabs (both logged-in only — hidden over the login wall). /search and
 * /boards render nothing yet; their sub-navs land here later.
 */
export function HeaderSubNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  if (pathname === '/' && user) {
    return <ViewToggle />;
  }

  if (pathname.startsWith('/testimonies') && user) {
    return <TestimoniesSubNav />;
  }

  return null;
}
