'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Users } from 'lucide-react';
import { cn } from '@/lib/core/utils';
import { useTestimonies } from '@/hooks/use-testimonies';
import { useContactOpportunities } from '@/hooks/use-contacts';
import { CONTACT_HREF, TESTIMONY_HREF } from '@/lib/take-action/routes';

/**
 * Header tabs for Take Action — Testimony and Contact Legislators — styled
 * like the board's ViewToggle. Each badge counts that tab's to-dos: open
 * testimony drafts, and bills waiting on a contact. `compact` renders
 * icon-only tabs (counts kept, accessible labels) for the mobile header.
 */
export function TakeActionSubNav({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const { items } = useTestimonies();
  const { toContact, ready } = useContactOpportunities();

  const drafts = items === null ? null : items.filter((item) => item.submittedAt === null).length;
  const tabs = [
    {
      href: TESTIMONY_HREF,
      label: 'Testimony',
      icon: FileText,
      count: drafts,
      countLabel: (n: number) => `${n} draft${n === 1 ? '' : 's'}`,
    },
    {
      href: CONTACT_HREF,
      label: 'Contact Legislators',
      icon: Users,
      count: ready ? toContact.length : null,
      countLabel: (n: number) => `${n} bill${n === 1 ? '' : 's'} to contact`,
    },
  ];

  return (
    <nav
      aria-label="Take Action"
      className={cn('inline-flex h-10 items-center rounded-md bg-secondary p-1 shadow-sm', className)}
    >
      {tabs.map(({ href, label, icon: Icon, count, countLabel }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            aria-label={compact ? label : undefined}
            title={compact ? label : undefined}
            className={cn(
              'inline-flex items-center justify-center whitespace-nowrap rounded-sm py-1.5 text-sm font-medium transition-all',
              compact ? 'px-2' : 'px-3',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
              active
                ? 'bg-primary text-white shadow-sm'
                : 'text-secondary-foreground hover:bg-white/50',
            )}
          >
            <Icon className={cn(compact ? 'h-5 w-5' : 'h-4 w-4 mr-2')} />
            {!compact && label}
            {count !== null && count > 0 && (
              <span
                title={countLabel(count)}
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-xs font-semibold leading-none',
                  compact ? 'ml-1' : 'ml-1.5',
                  active ? 'bg-white/20 text-white' : 'bg-background text-muted-foreground',
                )}
              >
                {count}
                <span className="sr-only"> ({countLabel(count)})</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
