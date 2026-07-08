'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Download, Menu, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isNavItemActive, NAV_ITEMS } from './header-nav';
import { AuthHeader } from '@/components/auth/auth-header';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { useAuth } from '@/hooks/contexts/auth-context';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ExportCsvDialog } from '@/components/kanban/export-csv-dialog';
import { ViewScopeToggle } from '@/components/kanban/view-scope-toggle';
import { SettingsDialog } from '@/components/settings/settings-dialog';

export function MobileHamburgerMenu() {
  const { activeTenant, memberships, setActiveTenant, user } = useAuth();
  const { view, setView } = useKanbanBoard();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  const isPublic = !user;

  return (
    <>
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open menu</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <div className="flex flex-col gap-4">
          {/* Top-level navigation */}
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                aria-current={isNavItemActive(href, pathname) ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-2 text-sm',
                  isNavItemActive(href, pathname)
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'hover:bg-muted'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>

          {/* Tenant selector */}
          {memberships.length > 1 && (
            <select
              value={activeTenant?.tenantId ?? ''}
              onChange={(e) => setActiveTenant(e.target.value)}
              aria-label="Switch organization"
              className="text-sm border border-input bg-background rounded-md px-2 py-1.5 w-full"
            >
              {memberships.map((m) => (
                <option key={m.tenantId} value={m.tenantId}>
                  {m.name}
                </option>
              ))}
            </select>
          )}

          {/* View scope (org members only) */}
          {activeTenant && (
            <div className="flex flex-col gap-2 border-t pt-3">
              <Label className="text-sm">Viewing</Label>
              <ViewScopeToggle className="w-full justify-stretch [&>button]:flex-1 [&>button]:justify-center" />
            </div>
          )}

          {/* Admin view toggle */}
          {!isPublic && activeTenant?.orgRole === 'admin' && (
            <div className="flex items-center justify-between border-t pt-3">
              <Label htmlFor="mobile-admin-view" className="text-sm">Admin View</Label>
              <Switch
                id="mobile-admin-view"
                checked={view === 'admin'}
                onCheckedChange={(checked) => setView(checked ? 'admin' : 'kanban')}
              />
            </div>
          )}

          {/* Export CSV */}
          {!isPublic && (
            <div className="border-t pt-3">
              <ExportCsvDialog>
                <Button variant="outline" className="w-full justify-start">
                  <Download className="h-4 w-4" /> Export CSV
                </Button>
              </ExportCsvDialog>
            </div>
          )}

          {/* Settings */}
          {!isPublic && (
            <div className="border-t pt-3">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings className="h-4 w-4" /> Settings
              </Button>
            </div>
          )}

          {/* Auth */}
          <div className="flex justify-end border-t pt-3">
            <AuthHeader />
          </div>
        </div>
      </PopoverContent>
    </Popover>
    <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
