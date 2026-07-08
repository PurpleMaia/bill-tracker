'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/contexts/auth-context';
import { AuthHeader } from '../auth/auth-header';
import { HeaderNav } from './header-nav';
import { HeaderSubNav } from './header-subnav';

export function Header() {
  const { activeTenant } = useAuth();

  return (
    <header className="sticky top-0 z-10 flex items-center gap-4 px-3 md:px-8 py-3 md:py-4 border-b-[3px] border-olive bg-primary text-primary-foreground">
      {/* Brand — links home, truncates so it can't collide with the center slot */}
      <h1 className="min-w-0 shrink text-lg md:text-xl font-semibold text-primary-foreground">
        <Link
          href="/"
          className="block truncate rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          {activeTenant?.name ?? 'Food+'} Bill Tracker
        </Link>
      </h1>

      {/* Contextual sub-nav — flex sibling, so long titles push it instead of
          overlapping it */}
      <div className="flex flex-1 min-w-0 justify-center px-2">
        <HeaderSubNav />
      </div>

      {/* Nav links + auth — desktop only */}
      <div className="hidden md:flex items-center gap-4 shrink-0">
        <HeaderNav />
        <AuthHeader />
      </div>

      {/* Avatar / login — mobile only (page nav lives in the bottom tab bar) */}
      <div className="md:hidden ml-auto">
        <AuthHeader />
      </div>
    </header>
  );
}
