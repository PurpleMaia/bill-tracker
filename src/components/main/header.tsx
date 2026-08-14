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
    <header className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 md:gap-4 px-3 md:px-8 py-3 md:py-4 border-b-[3px] border-olive bg-primary text-primary-foreground">
      {/* Brand — logo only on mobile, logo + name/subtitle on md+ */}
      <h1 className="min-w-0 justify-self-start font-semibold text-primary-foreground">
        <span className="flex items-center gap-2">
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
        </span>
        {/* Credit subtitle — sits outside the home link so the org links are
            their own anchors (no nested <a>). */}
        <span className="hidden truncate pl-9 text-[11px] font-normal leading-tight text-primary-foreground/70 md:block">
          made by{' '}
          <a
            href="https://www.foodpluspolicy.com/"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-primary-foreground/30 underline-offset-2 hover:decoration-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            Hawaiʻi Food+ Policy
          </a>{' '}
          &amp;{' '}
          <a
            href="https://www.purplemaia.org/"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-primary-foreground/30 underline-offset-2 hover:decoration-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            Purple Maiʻa Foundation
          </a>
        </span>
      </h1>

      {/* Contextual sub-nav — centered grid track (auto-sized, so it keeps its
          intrinsic width while the minmax(0,1fr) side tracks absorb the
          remaining space). */}
      <div className="min-w-0 px-2">
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
