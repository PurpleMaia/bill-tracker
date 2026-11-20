'use client';

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ListChecks, Tags } from 'lucide-react';
import { cn } from '@/lib/core/utils';
import { FADE_IN } from '@/lib/core/motion';
import { TagManagementPanel } from './tag-management-panel';
import { BulkTagPanel } from './bulk-tag-panel';

export type TagsDialogTab = 'manage' | 'bulk';

interface TagsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: TagsDialogTab;
}

/**
 * The org admin's one place for tags: create/edit them, and add or remove
 * them on many bills at once. Full-screen on phones, where a centered modal
 * leaves the bill checklist too cramped.
 */
export function TagsDialog({ isOpen, onClose, defaultTab = 'manage' }: TagsDialogProps) {
  const [tab, setTab] = useState<TagsDialogTab>(defaultTab);

  useEffect(() => {
    if (isOpen) setTab(defaultTab);
  }, [isOpen, defaultTab]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent aria-describedby={undefined} className="flex h-[85vh] max-w-2xl flex-col max-md:h-[100dvh] max-md:max-w-none max-md:border-0">
        <DialogHeader>
          <DialogTitle>Tags Settings</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TagsDialogTab)} className="flex flex-1 min-h-0 flex-col">
          {/* Big, icon-led tabs so "Bulk Tag Bills" reads as a feature, not a footnote. */}
          <TabsList className="grid h-auto w-full grid-cols-2 p-1">
            <TabsTrigger value="manage" className="gap-2 py-2.5 text-sm font-normal sm:text-[15px]">
              <Tags className="h-5 w-5 shrink-0" aria-hidden="true" />
              Manage Tags
            </TabsTrigger>
            <TabsTrigger value="bulk" className="gap-2 py-2.5 text-sm font-normal sm:text-[15px]">
              <ListChecks className="h-5 w-5 shrink-0" aria-hidden="true" />
              Bulk Tag Bills
            </TabsTrigger>
          </TabsList>
          {/* p-1 / -m-1: room for the 4px focus ring so the scroller doesn't clip it. */}
          <TabsContent value="manage" className={cn("flex-1 min-h-0 overflow-y-auto -m-1 p-1 mt-3", FADE_IN)}>
            <TagManagementPanel />
          </TabsContent>
          <TabsContent value="bulk" className={cn("flex flex-1 min-h-0 flex-col mt-3 data-[state=inactive]:hidden", FADE_IN)}>
            <BulkTagPanel onDone={onClose} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
