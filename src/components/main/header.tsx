'use client';

import Link from 'next/link';
import { AuthHeader } from '../auth/auth-header';
import { HeaderNav } from './header-nav';
import { HeaderSubNav } from './header-subnav';

export function Header() {
  return (
    // Three-column grid. From md up the side tracks are equal and flexible so
    // the sub-nav sits at the true center of the viewport regardless of how wide
    // the brand or the nav/auth cluster is. On mobile the side tracks size to
    // their content instead: the logo is tiny but the signed-out cluster
    // (Login + Guide + Feedback) is wide, and equal tracks would push that
    // cluster over the sub-nav. The sub-nav centers in the space left between.
    <header className="sticky top-0 z-10 grid grid-cols-[auto_minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 md:gap-4 px-3 md:px-8 py-3 md:py-4 border-b-[3px] border-olive bg-primary text-primary-foreground">
      {/* Brand — logo only on mobile, logo + name on md+. The build credit now
          lives in the Discover hero (the landing page), not under the logo.
          A div, not an h1: the brand repeats on every page, so each page owns
          its own h1 (visible or sr-only) to name the page for screen readers. */}
      <div className="min-w-0 justify-self-start font-semibold text-primary-foreground">
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
          header is the same height on pages with no sub-nav (Discover). */}
      <div className="flex min-h-10 min-w-0 items-center justify-center px-2">
        <HeaderSubNav />
      </div>

      {/* Nav links (desktop) + avatar/login (all sizes; page nav lives in the
          bottom tab bar on mobile) */}
      <div className="flex items-center gap-4 justify-self-end">
        <div className="hidden md:flex items-center gap-4">
          <HeaderNav />
        </div>
        <AuthHeader />
      </div>
    </header>
  );
}
