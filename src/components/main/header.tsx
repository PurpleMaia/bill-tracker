'use client';

import Link from 'next/link';
import { AuthHeader } from '../auth/auth-header';
import { HeaderNav } from './header-nav';
import { HeaderSubNav } from './header-subnav';

export function Header() {
  return (
    // Three-column grid with equal flexible side tracks so the sub-nav sits at
    // the true center of the viewport at every breakpoint, regardless of how
    // wide the brand or the nav/auth cluster is.
    <header className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 hd:gap-4 px-3 hd:px-8 py-3 hd:py-4 border-b-[3px] border-olive bg-primary text-primary-foreground">
      {/* Brand — logo only until hd (830px), logo + "Bill Tracker" above it */}
      <h1 className="min-w-0 justify-self-start text-lg hd:text-xl font-semibold text-primary-foreground">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static asset, no optimization needed */}
          <img
            src="/favicon.ico"
            alt=""
            className="h-7 w-7 shrink-0 rounded-md"
          />
          <span className="hidden hd:block truncate">Bill Tracker</span>
          <span className="sr-only hd:hidden">Bill Tracker</span>
        </Link>
      </h1>

      {/* Contextual sub-nav — centered grid track (auto-sized, so it keeps its
          intrinsic width while the minmax(0,1fr) side tracks absorb the rest).
          justify-self-center keeps it centered within its own track rather than
          hugging the nav cluster on its right. */}
      <div className="min-w-0 justify-self-center px-2">
        <HeaderSubNav />
      </div>

      {/* Nav links (desktop) + avatar/login (all sizes; page nav lives in the
          bottom tab bar on mobile).
          min-w-0 lets this cluster be constrained by its grid track instead of
          overflowing leftward into the centered sub-nav — being justify-self-end,
          any excess width spills toward the middle of the header. */}
      <div className="flex min-w-0 items-center gap-2 xl:gap-4 justify-self-end">
        {/* lg, not md: between 768–1023px there isn't room for the brand, the
            centered sub-nav, four nav links AND the auth control, and this
            cluster (justify-self-end) would spill left over the sub-nav. Page
            navigation is still reachable from the bottom tab bar below lg. */}
        <div className="hidden lg:flex items-center gap-3 xl:gap-4">
          <HeaderNav />
        </div>
        <AuthHeader />
      </div>
    </header>
  );
}
