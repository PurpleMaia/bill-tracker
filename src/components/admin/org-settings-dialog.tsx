'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/contexts/auth-context';
import { data } from '@/lib/data-client';
import { toast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface OrgSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrgSettingsDialog({ open, onOpenChange }: OrgSettingsDialogProps) {
  const { activeTenant } = useAuth();
  const tenantId = activeTenant?.tenantId;
  const [publicBoard, setPublicBoardState] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !tenantId) return;
    let cancelled = false;
    data.boards.getOrgSettings({ tenantId })
      .then((s) => { if (!cancelled) setPublicBoardState(s.publicBoard); })
      .catch(() => { if (!cancelled) setPublicBoardState(false); });
    return () => { cancelled = true; };
  }, [open, tenantId]);

  const handleToggle = async (checked: boolean) => {
    if (!tenantId) return;
    setSaving(true);
    setPublicBoardState(checked);
    try {
      await data.boards.setPublicBoard({ tenantId, enabled: checked });
    } catch {
      setPublicBoardState(!checked);
      toast({
        title: 'Could not save setting',
        description: 'Please try again.',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Org Settings</DialogTitle>
          <DialogDescription>Manage settings for {activeTenant?.name}.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 py-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="public-board" className="text-sm font-medium">
              Public board visibility
            </Label>
            <Switch
              id="public-board"
              disabled={publicBoard === null || saving}
              checked={publicBoard ?? false}
              onCheckedChange={handleToggle}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            When on, anyone can view this org&apos;s board (read-only) under Active Boards.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
