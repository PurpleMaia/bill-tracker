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
import { Textarea } from '@/components/ui/textarea';

interface OrgSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DESCRIPTION_MAX = 200;

export function OrgSettingsDialog({ open, onOpenChange }: OrgSettingsDialogProps) {
  const { activeTenant } = useAuth();
  const tenantId = activeTenant?.tenantId;
  const [publicBoard, setPublicBoardState] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  // Description: `description` is the editable draft; `savedDescription` is the
  // last value persisted, used to detect changes on blur and to revert on error.
  const [description, setDescription] = useState('');
  const [savedDescription, setSavedDescription] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [savingDescription, setSavingDescription] = useState(false);

  useEffect(() => {
    if (!open || !tenantId) return;
    let cancelled = false;
    setLoaded(false);
    data.boards.getOrgSettings({ tenantId })
      .then((s) => {
        if (cancelled) return;
        setPublicBoardState(s.publicBoard);
        setDescription(s.description);
        setSavedDescription(s.description);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setPublicBoardState(false);
        setLoaded(true);
      });
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

  // Save the description on blur, only when it actually changed.
  const handleDescriptionBlur = async () => {
    if (!tenantId) return;
    const next = description.trim();
    if (next === savedDescription) return;
    setSavingDescription(true);
    try {
      await data.boards.setOrgDescription({ tenantId, description: next });
      setSavedDescription(next);
      setDescription(next);
    } catch {
      setDescription(savedDescription);
      toast({
        title: 'Could not save description',
        description: 'Please try again.',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setSavingDescription(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Org Settings</DialogTitle>
          <DialogDescription>Manage settings for {activeTenant?.name}.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6 py-2">
          {/* Public board visibility */}
          <section className="flex flex-col gap-2">
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
          </section>

          {/* Public description */}
          <section className="flex flex-col gap-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="org-description" className="text-sm font-medium">
                Description
              </Label>
              <span className="text-[10px] text-muted-foreground">
                {description.length}/{DESCRIPTION_MAX}
              </span>
            </div>
            <Textarea
              id="org-description"
              rows={3}
              maxLength={DESCRIPTION_MAX}
              disabled={!loaded || savingDescription}
              placeholder="A short line about what your org does. This is shown when people browse through active boards & organizations."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescriptionBlur}
            />
            <p className="text-xs text-muted-foreground">
              Shown on your org&apos;s card under Browse. Saved when you click away.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
