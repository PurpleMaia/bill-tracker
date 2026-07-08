'use client';

import { useAuth } from '@/hooks/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut, Settings, UserPlus } from 'lucide-react';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { useState, useCallback } from 'react';
import { InviteUserDialog } from './invite-user-dialog';
import { SettingsDialog } from '@/components/settings/settings-dialog';

export function UserMenu() {
  //gets user info and logout function from context
  const { user, logout, activeTenant, memberships, setActiveTenant } = useAuth();
  const { setView } = useKanbanBoard();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Defer dialog opens so the dropdown fully closes first
  const openInviteDialog = useCallback(() => {
    setDropdownOpen(false);
    setTimeout(() => setInviteDialogOpen(true), 0);
  }, []);

  const openSettingsDialog = useCallback(() => {
    setDropdownOpen(false);
    setTimeout(() => setSettingsDialogOpen(true), 0);
  }, []);

  //creates avatar with users first initial
  const handleLogout = async () => {
    setView('kanban'); // Reset view to 'kanban' on logout
    await logout();
  };

  const getInitials = (username: string) => {
    return username.charAt(0).toUpperCase();
  };

  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Account menu"
            className="h-8 w-8 rounded-full bg-slate-200 text-black transition-shadow hover:bg-slate-200 hover:ring-2 hover:ring-white/50 focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <Avatar className="h-8 w-8 border border-slate-300">
              <AvatarFallback>{user ? getInitials(user.username) : ''}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-2">
              <p className="text-sm font-bold leading-none">{user ? user.username : ''}</p>
              <p className="text-sm font-medium leading-none">{user ? user.email : ''}</p>
              <p className="text-xs leading-none text-muted-foreground">
                {activeTenant
                  && `${activeTenant.name} · ${activeTenant.orgRole === 'admin' ? 'Admin' : 'Member'}`
                }
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {/* Org switcher — only when there is something to switch between */}
          {memberships.length > 1 && (
            <>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Organization
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={activeTenant?.tenantId ?? ''}
                onValueChange={setActiveTenant}
              >
                {memberships.map((m) => (
                  <DropdownMenuRadioItem key={m.tenantId} value={m.tenantId} className="cursor-pointer">
                    {m.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
            </>
          )}

          {activeTenant?.orgRole === 'admin' && (
            <DropdownMenuItem onSelect={openInviteDialog} className='cursor-pointer'>
              <UserPlus className="mr-2 h-4 w-4" />
              <span>Invite User</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={openSettingsDialog} className='cursor-pointer'>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className='cursor-pointer'>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <InviteUserDialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen} />
      <SettingsDialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen} />
    </>
  );
}
