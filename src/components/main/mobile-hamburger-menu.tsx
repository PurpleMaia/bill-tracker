'use client';

import { useState } from 'react';
import { Download, Menu, Settings } from 'lucide-react';
import { AuthHeader } from '@/components/auth/auth-header';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useBills } from '@/hooks/contexts/bills-context';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ExportCsvDialog } from '@/components/kanban/export-csv-dialog';
import { SettingsDialog } from '@/components/settings/settings-dialog';

export function MobileHamburgerMenu() {
  const { activeTenant, memberships, setActiveTenant, user } = useAuth();
  const { view, setView } = useKanbanBoard();
  const { viewMode, toggleViewMode, showArchived, toggleShowArchived } = useBills();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isPublic = !user;

  return (
    <>
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open menu</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <div className="flex flex-col gap-4">
          {/* Tenant selector */}
          {memberships.length > 1 && (
            <select
              value={activeTenant?.tenantId ?? ''}
              onChange={(e) => setActiveTenant(e.target.value)}
              className="text-sm border border-input bg-background rounded-md px-2 py-1.5 w-full"
            >
              {memberships.map((m) => (
                <option key={m.tenantId} value={m.tenantId}>
                  {m.name}
                </option>
              ))}
            </select>
          )}

          {/* Toggles */}
          {!isPublic && (
            <div className="flex flex-col gap-3 border-t pt-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="mobile-all-bills" className="text-sm">All Bills</Label>
                <Switch id="mobile-all-bills" checked={viewMode === 'all-bills'} onCheckedChange={toggleViewMode} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="mobile-show-archived" className="text-sm">Show Archived</Label>
                <Switch id="mobile-show-archived" checked={showArchived} onCheckedChange={toggleShowArchived} />
              </div>
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
