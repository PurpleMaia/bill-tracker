'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InviteUserPanel } from '@/components/auth/invite-user-dialog';
import { useAuth } from '@/hooks/contexts/auth-context';
import { OrgSettingsPanel } from './org-settings-dialog';

export type OrganizationTab = 'settings' | 'invite';

interface OrganizationDialogProps {
  /** The open tab, or null when the dialog is closed. */
  tab: OrganizationTab | null;
  onTabChange: (tab: OrganizationTab | null) => void;
}

/**
 * Org-admin tools, one tab per kind of setting. The avatar menu's
 * Organization items open it straight onto the matching tab.
 */
export function OrganizationDialog({ tab, onTabChange }: OrganizationDialogProps) {
  const { activeTenant } = useAuth();
  const close = () => onTabChange(null);

  return (
    <Dialog open={tab !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Organization</DialogTitle>
          <DialogDescription>Manage {activeTenant?.name}.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab ?? 'settings'} onValueChange={(v) => onTabChange(v as OrganizationTab)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="invite">Invite</TabsTrigger>
          </TabsList>
          {/* forceMount + hidden: switching tabs keeps a half-typed invite email. */}
          <TabsContent value="settings" forceMount className="mt-2 data-[state=inactive]:hidden">
            <OrgSettingsPanel />
          </TabsContent>
          <TabsContent value="invite" forceMount className="mt-4 data-[state=inactive]:hidden">
            <InviteUserPanel onInvited={close} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
