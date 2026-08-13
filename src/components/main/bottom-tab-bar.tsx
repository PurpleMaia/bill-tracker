'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/core/utils';
import { isNavItemActive, NAV_ITEMS } from './header-nav';

/**
 * Page navigation below lg: the four NAV_ITEMS destinations. Board view
 * switching lives in the board header, not here.
 *
 * Hidden at lg+, exactly where the header's own nav links appear — the two
 * must stay in lockstep or 768–1023px would have no page navigation at all.
 */
export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex items-stretch border-t bg-background/95 backdrop-blur py-2"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isNavItemActive(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              // flex-1 + basis-0: every tab gets an identical quarter of the
              // bar, regardless of label length
              'flex flex-1 basis-0 min-w-0 flex-col items-center gap-1 px-1 py-1 text-[11px] transition-colors',
              active ? 'text-primary font-semibold' : 'text-muted-foreground'
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
