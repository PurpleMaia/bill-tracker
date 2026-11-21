'use client';

import Link from 'next/link';
import { AuthHeader } from '../auth/auth-header';
import { HeaderNav } from './header-nav';
import { HeaderSubNav } from './header-subnav';
import { MobileHamburgerMenu } from './mobile-hamburger-menu';

export function Header() {
  return (
    // Three-column grid; the side tracks size to their content and the sub-nav
    // centers in the space left between, so it can never be pushed under the
    // brand or the nav/auth cluster. (Equal 1fr side tracks put it at the true
    // viewport center, but the desktop nav cluster is wider than its share
    // below ~1500px and ran over the sub-nav.) Between md and xl there isn't
    // room for all three on one line, so the sub-nav drops to its own centered
    // row under the brand and nav; mobile keeps it inline, icon-only.
    <header className="sticky top-0 z-chrome grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 md:gap-x-4 md:gap-y-3 px-3 md:px-8 py-3 md:py-4 border-b-[3px] border-olive bg-primary text-primary-foreground">
      {/* Brand — logo only on mobile, logo + name on md+. The build credit now
          lives in the Discover hero (the landing page), not under the logo.
          A div, not an h1: the brand repeats on every page, so each page owns
          its own h1 (visible or sr-only) to name the page for screen readers. */}
      <div className="flex min-w-0 items-center gap-1 justify-self-start font-semibold text-primary-foreground">
        {/* Page nav lives in this drawer on mobile (no bottom tab bar). */}
        <div className="-ml-2 md:hidden">
          <MobileHamburgerMenu />
        </div>
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
          <span className="hidden truncate text-lg md:block md:text-xl">Hawaiʻi Bill Tracker</span>
          <span className="sr-only md:hidden">Hawaiʻi Bill Tracker</span>
        </Link>
      </div>

      {/* Contextual sub-nav — centered grid track (auto-sized, so it keeps its
          intrinsic width while the minmax(0,1fr) side tracks absorb the
          remaining space). min-h-10 matches the sub-nav pills' h-10 so the
          header is the same height on pages with no sub-nav (Find Bills).
          Between md and xl it takes its own row, hidden when empty. */}
      <div className="flex min-h-10 min-w-0 items-center justify-center px-2 justify-self-center md:max-xl:col-span-3 md:max-xl:row-start-2 md:max-xl:empty:hidden">
        <HeaderSubNav />
      </div>

      {/* Nav links (desktop) + avatar/login (all sizes; page nav lives in the
          hamburger drawer on mobile) */}
      <div className="flex items-center gap-4 justify-self-end md:col-start-3 md:row-start-1">
        <div className="hidden md:flex items-center gap-4">
          <HeaderNav />
        </div>
        <AuthHeader />
      </div>
    </header>
  );
}
