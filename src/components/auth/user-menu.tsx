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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, CircleHelp, Download, LogOut, MessageSquareText, Settings, Shield, SlidersHorizontal, UserPen, UserPlus } from 'lucide-react';
import { FEEDBACK_FORM_URL } from '@/lib/core/feedback';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { useState, useCallback } from 'react';
import { CreateOrgDialog } from './create-org-dialog';
import { ExportCsvDialog } from '@/components/kanban/export-csv-dialog';
import { SettingsDialog, type SettingsTab } from '@/components/settings/settings-dialog';
import { OrganizationDialog, type OrganizationTab } from '@/components/admin/organization-dialog';
import { isProfileIncomplete } from '@/lib/auth/profile';
import type { User } from '@/types/user';

export function UserMenu() {
  //gets user info and logout function from context
  const { user, logout, activeTenant, memberships, setActiveTenant, isPublicUser } = useAuth();
  const { setView } = useKanbanBoard();
  const pathname = usePathname();
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // Each tabbed dialog is open on a tab, or closed (null).
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [orgTab, setOrgTab] = useState<OrganizationTab | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Defer dialog opens so the dropdown fully closes first
  const openSettings = useCallback((tab: SettingsTab) => {
    setDropdownOpen(false);
    setTimeout(() => setSettingsTab(tab), 0);
  }, []);

  const openOrganization = useCallback((tab: OrganizationTab) => {
    setDropdownOpen(false);
    setTimeout(() => setOrgTab(tab), 0);
  }, []);

  const openExportDialog = useCallback(() => {
    setDropdownOpen(false);
    setTimeout(() => setExportOpen(true), 0);
  }, []);

  const openCreateOrgDialog = useCallback(() => {
    setDropdownOpen(false);
    setTimeout(() => setCreateOrgOpen(true), 0);
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

          {/* Settings are grouped by what they act on — you, or your org — in
              hover submenus, so the top level stays short. */}
          <DropdownMenuSub>
            {/* Hover reveals the submenu; a click opens the dialog on its first
                tab. preventDefault stops Radix opening the submenu as well. */}
            <DropdownMenuSubTrigger
              className="cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                openSettings('preferences');
              }}
            >
              <Settings />
              <span>Settings</span>
              {/* Carry the incomplete-profile nudge up to the collapsed group. */}
              {profileIncomplete && (
                <span className="ml-auto flex items-center">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-yellow-400" />
                  <span className="sr-only">Profile incomplete</span>
                </span>
              )}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              <DropdownMenuItem onSelect={() => openSettings('preferences')} className='cursor-pointer'>
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                <span>Preferences</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openSettings('profile')} className='cursor-pointer'>
                <UserPen className="mr-2 h-4 w-4" />
                <span>Edit Profile</span>
                {profileIncomplete && (
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span aria-hidden className="h-2 w-2 rounded-full bg-yellow-400" />
                    Incomplete
                  </span>
                )}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {activeTenant?.orgRole === 'admin' && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                className="cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  openOrganization('settings');
                }}
              >
                <Building2 />
                <span>Organization</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                <DropdownMenuItem onSelect={() => openOrganization('settings')} className='cursor-pointer'>
                  <Shield className="mr-2 h-4 w-4" />
                  {/* Sits under the Organization submenu, so the parent supplies the noun. */}
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openOrganization('invite')} className='cursor-pointer'>
                  <UserPlus className="mr-2 h-4 w-4" />
                  <span>Invite User</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          <DropdownMenuSeparator />
          {/* Board-level action, like Trello's board menu: on phones it's the
              only home for export (the board toolbar keeps just Filters). */}
          <DropdownMenuItem onSelect={openExportDialog} className='cursor-pointer'>
            <Download className="mr-2 h-4 w-4" />
            <span>Export bills</span>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className='cursor-pointer'>
            <Link href="/guide">
              <CircleHelp className="mr-2 h-4 w-4" />
              <span>Guide</span>
            </Link>
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
      <CreateOrgDialog open={createOrgOpen} onOpenChange={setCreateOrgOpen} />
      {/* This menu is app-wide: only on the board, where the filters are on
          screen, does the export default to applying them. */}
      <ExportCsvDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        applyFiltersByDefault={pathname === '/your-bills'}
      />
      <SettingsDialog tab={settingsTab} onTabChange={setSettingsTab} />
      <OrganizationDialog tab={orgTab} onTabChange={setOrgTab} />
    </>
  );
}
