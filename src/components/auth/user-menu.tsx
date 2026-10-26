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
import { Building2, LogOut, MessageSquareText, Settings, Shield, UserPen, UserPlus } from 'lucide-react';
import { FEEDBACK_FORM_URL } from '@/lib/core/feedback';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { useState, useCallback } from 'react';
import { InviteUserDialog } from './invite-user-dialog';
import { CreateOrgDialog } from './create-org-dialog';
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { OrgSettingsDialog } from '@/components/admin/org-settings-dialog';
import { EditProfileDialog } from './edit-profile-dialog';
import { isProfileIncomplete } from '@/lib/auth/profile';
import type { User } from '@/types/user';

export function UserMenu() {
  //gets user info and logout function from context
  const { user, logout, activeTenant, memberships, setActiveTenant, isPublicUser } = useAuth();
  const { setView } = useKanbanBoard();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [orgSettingsOpen, setOrgSettingsOpen] = useState(false);
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
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

  const openOrgSettingsDialog = useCallback(() => {
    setDropdownOpen(false);
    setTimeout(() => setOrgSettingsOpen(true), 0);
  }, []);

  const openCreateOrgDialog = useCallback(() => {
    setDropdownOpen(false);
    setTimeout(() => setCreateOrgOpen(true), 0);
  }, []);

  const openEditProfileDialog = useCallback(() => {
    setDropdownOpen(false);
    setTimeout(() => setEditProfileOpen(true), 0);
  }, []);

  const profileIncomplete = isProfileIncomplete(user);

  //creates avatar with users first initial
  const handleLogout = async () => {
    setView('kanban'); // Reset view to 'kanban' on logout
    await logout();
  };

  const getInitials = (u: User) => {
    if (u.firstName && u.lastName) {
      return `${u.firstName.charAt(0)}${u.lastName.charAt(0)}`.toUpperCase();
    }
    return u.username.charAt(0).toUpperCase();
  };

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');

  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={profileIncomplete ? 'Account menu — profile incomplete' : 'Account menu'}
            className="relative h-8 w-8 rounded-full bg-slate-200 text-black transition-shadow hover:bg-slate-200 hover:ring-2 hover:ring-white/50 focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <Avatar className="h-8 w-8 border border-slate-300">
              <AvatarFallback>{user ? getInitials(user) : ''}</AvatarFallback>
            </Avatar>
            {/* Accounts created before names were collected: nudge them to
                fill in their profile via Edit Profile. */}
            {profileIncomplete && (
              <span
                aria-hidden
                className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-yellow-400 ring-2 ring-white"
              />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-2">
              <p className="text-sm font-bold leading-none">{fullName || user?.username || ''}</p>
              {fullName && (
                <p className="text-xs leading-none text-muted-foreground">@{user?.username}</p>
              )}
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

          {isPublicUser && (
            <DropdownMenuItem onSelect={openCreateOrgDialog} className='cursor-pointer'>
              <Building2 className="mr-2 h-4 w-4" />
              <span>Create Organization</span>
            </DropdownMenuItem>
          )}

          {activeTenant?.orgRole === 'admin' && (
            <>
              <DropdownMenuItem onSelect={openInviteDialog} className='cursor-pointer'>
                <UserPlus className="mr-2 h-4 w-4" />
                <span>Invite User</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={openOrgSettingsDialog} className='cursor-pointer'>
                <Shield className="mr-2 h-4 w-4" />
                <span>Org Settings</span>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem onSelect={openEditProfileDialog} className='cursor-pointer'>
            <UserPen className="mr-2 h-4 w-4" />
            <span>Edit Profile</span>
            {profileIncomplete && (
              <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                <span aria-hidden className="h-2 w-2 rounded-full bg-yellow-400" />
                Incomplete
              </span>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={openSettingsDialog} className='cursor-pointer'>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className='cursor-pointer'>
            <a href={FEEDBACK_FORM_URL} target="_blank" rel="noopener noreferrer">
              <MessageSquareText className="mr-2 h-4 w-4" />
              <span>Feedback</span>
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className='cursor-pointer'>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <InviteUserDialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen} />
      <CreateOrgDialog open={createOrgOpen} onOpenChange={setCreateOrgOpen} />
      <SettingsDialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen} />
      <OrgSettingsDialog open={orgSettingsOpen} onOpenChange={setOrgSettingsOpen} />
      <EditProfileDialog open={editProfileOpen} onOpenChange={setEditProfileOpen} />
    </>
  );
}
