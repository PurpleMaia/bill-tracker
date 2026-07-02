'use client';

import { useState } from 'react';
import { Settings } from 'lucide-react';
import { useAuth } from '@/hooks/contexts/auth-context';
import { AuthHeader } from '../auth/auth-header';
import { HeaderNav } from './header-nav';
import { HeaderSubNav } from './header-subnav';
import { MobileHamburgerMenu } from './mobile-hamburger-menu';
import { SettingsDialog } from '@/components/settings/settings-dialog';

export function Header() {
  const { user, activeTenant, memberships, setActiveTenant } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center px-3 md:px-8 py-3 md:py-4 border-b-[3px] border-olive bg-primary text-primary-foreground">
        {/* Title — always visible */}
        <div className="flex-shrink-0 flex items-center gap-3">
          <h1 className="text-lg md:text-xl font-semibold text-primary-foreground">
            {activeTenant?.name ?? 'Food+'} Bill Tracker
          </h1>
          {/* Tenant selector — desktop only */}
          {memberships.length > 1 && (
            <select
              value={activeTenant?.tenantId ?? ''}
              onChange={(e) => setActiveTenant(e.target.value)}
              className="hidden md:block text-sm bg-white/10 border border-white/20 text-white rounded-md px-2 py-1"
            >
              {memberships.map((m) => (
                <option key={m.tenantId} value={m.tenantId} className="text-black">
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Contextual sub-nav — desktop only, absolutely centered */}
        <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 justify-center w-fit">
          <HeaderSubNav />
        </div>

        {/* Nav links, settings, auth — desktop only */}
        <div className="hidden md:flex items-center gap-4 flex-shrink-0 ml-auto">
          <HeaderNav />
          {user && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Open settings"
              className="flex items-center justify-center rounded-md p-2 text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            >
              <Settings className="h-5 w-5" />
            </button>
          )}
          <AuthHeader />
        </div>

        {/* Hamburger menu — mobile only */}
        <div className="md:hidden ml-auto">
          <MobileHamburgerMenu />
        </div>
      </header>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
