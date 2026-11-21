'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/core/utils';
import { isNavItemActive, NAV_ITEMS } from './header-nav';
import { MENU_TOUR_TARGET } from '@/lib/tour/welcome-tour';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

/**
 * Mobile page navigation: the NAV_ITEMS destinations in a left-side drawer,
 * opened from a hamburger in the header. Replaces the old fixed bottom tab bar,
 * which permanently took 64px of vertical space on every page.
 */
export function MobileHamburgerMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation (covers back/forward too, not just taps in the menu).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          // The welcome tour spotlights this on phones, where the nav links
          // themselves are hidden inside the drawer.
          data-tour={MENU_TOUR_TARGET}
          className="h-10 w-10 shrink-0 text-primary-foreground hover:bg-white/10 hover:text-white"
        >
          <Menu className="h-6 w-6" />
          <span className="sr-only">Open menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <SheetHeader className="mb-4 text-left">
          <SheetTitle>Hawaiʻi Bill Tracker</SheetTitle>
          <SheetDescription className="sr-only">Main navigation</SheetDescription>
        </SheetHeader>
        <nav aria-label="Primary" className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isNavItemActive(href, pathname);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-12 items-center gap-3 rounded-md px-3 text-base transition-colors',
                  active ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-muted'
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
