'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Star, Building2, Compass } from 'lucide-react';
import { useAuth } from '@/hooks/contexts/auth-context';
import { cn } from '@/lib/core/utils';
import { isActiveBoardsTabActive } from '@/lib/boards/board-routes';

// Browse leads: any public board is now open to everyone, so finding orgs is
// the first step. "Following" + a star, not "View Board" + the kanban icon, so
// it can't be mistaken for Your Bills.
const TABS = [
  { href: '/community', label: 'Browse', icon: Compass, adminOnly: false },
  { href: '/community/following', label: 'Following', icon: Star, adminOnly: false },
  // An admin's preview of their own org's board as others see it. Not "Your
  // Tracker": that's the main nav's editable board.
  { href: '/community/public-view', label: 'Public View', icon: Building2, adminOnly: true },
] as const;

/**
 * Sub-navigation for the Active Boards section — link-based tabs styled to
 * match TakeActionSubNav (same bg-secondary pill, active = bg-primary
 * text-white). No counts. `compact` renders icon-only tabs for tight spots
 * like the mobile header's center slot.
 */
export function ActiveBoardsSubNav({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const { activeTenant } = useAuth();
  const isAdmin = activeTenant?.orgRole === 'admin';
  const tabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <nav
      aria-label="Active board views"
      className={cn('inline-flex h-10 items-center rounded-md bg-secondary p-1 shadow-sm', className)}
    >
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = isActiveBoardsTabActive(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            aria-label={compact ? label : undefined}
            title={compact ? label : undefined}
            className={cn(
              'inline-flex items-center justify-center whitespace-nowrap rounded-sm py-1.5 text-sm font-medium transition-all',
              compact ? 'px-3' : 'px-3',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
              active
                ? 'bg-primary text-white shadow-sm'
                : 'text-secondary-foreground hover:bg-white/50',
            )}
          >
            <Icon className={cn(compact ? 'h-5 w-5' : 'h-4 w-4 mr-2')} />
            {!compact && label}
          </Link>
        );
      })}
    </nav>
  );
}
