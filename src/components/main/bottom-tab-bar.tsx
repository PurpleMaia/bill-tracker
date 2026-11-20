'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/core/utils';
import { isNavItemActive, NAV_ITEMS } from './header-nav';

/**
 * Mobile page navigation: the NAV_ITEMS destinations. Board view
 * switching lives in the board header, not here.
 */
export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      // Fixed h-16: the main layout reserves exactly this (pb-16).
      className="md:hidden fixed bottom-0 left-0 right-0 z-chrome flex h-16 items-stretch border-t bg-background/95 backdrop-blur py-1.5"
    >
      {NAV_ITEMS.map((item) => {
        const { href, label, icon: Icon } = item;
        const active = isNavItemActive(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            data-tour={`nav-${href}`}
            aria-current={active ? 'page' : undefined}
            className={cn(
              // flex-1 + basis-0: every tab gets an identical share of the
              // bar, regardless of label length
              'flex flex-1 basis-0 min-w-0 flex-col items-center gap-1 px-1 py-1 text-xs transition-colors',
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
