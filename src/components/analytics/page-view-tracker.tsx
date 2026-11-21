'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useTrack } from '@/hooks/use-track';
import { normalizePath, sectionForPath } from '@/lib/analytics/paths';

/** Logs one page_view per distinct pathname, once auth has resolved. Renders nothing. */
export function PageViewTracker() {
  const pathname = usePathname();
  const { loading } = useAuth();
  const track = useTrack();
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    // Wait for auth so signed-in users aren't logged as anonymous.
    if (loading || !pathname || lastTracked.current === pathname) return;
    lastTracked.current = pathname;
    const section = sectionForPath(pathname);
    if (section) track('page_view', { section }, { path: normalizePath(pathname) });
  }, [pathname, loading, track]);

  return null;
}
