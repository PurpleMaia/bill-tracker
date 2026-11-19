'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/contexts/auth-context';
import { data } from '@/lib/data-client';
import { toast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Globe, Lock, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/core/utils';
import { CopyLinkButton } from '@/components/boards/copy-link-button';
import { publicBoardUrl } from '@/lib/boards/board-routes';

const DESCRIPTION_MAX = 200;

const CHIP_TONES = {
  on: 'bg-olive/15 text-olive-dark',
  // Matches the red Private badge on the Browse org card.
  private: 'bg-red-100 text-red-700',
} as const;

/** Small status pill: what a setting currently is, at a glance. */
function StatusChip({
  tone,
  icon: Icon,
  label,
}: {
  tone: keyof typeof CHIP_TONES;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        CHIP_TONES[tone],
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

/**
 * The org's own settings — the Organization dialog's Settings tab. Loads on
 * mount: the dialog mounts it each time it opens.
 */
export function OrgSettingsPanel() {
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
    if (!tenantId) return;
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
  }, [tenantId]);

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
        {/* Current state, spelled out: the switch alone doesn't say what
            public/private means for sharing the board. */}
        {publicBoard !== null && (
          <div className="flex flex-col gap-1.5 rounded-md bg-muted/50 p-3">
            <StatusChip
              tone={publicBoard ? 'on' : 'private'}
              icon={publicBoard ? Globe : Lock}
              label={publicBoard ? 'Your board is public' : 'Your board is private'}
            />
            <p className="text-xs text-muted-foreground">
              {publicBoard
                ? 'Anyone, even without an account, can view your board (read-only) at the link below and find it under Browse. Share it, or link to it from your own website.'
                : 'Only your members can see your board. It isn’t listed under Browse, and there’s no link to share or put on your own website. Turn this on to get one.'}
            </p>
          </div>
        )}
        {publicBoard && activeTenant && (
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/50 px-2 py-1.5 text-xs">
              {publicBoardUrl(activeTenant.slug)}
            </code>
            <CopyLinkButton url={publicBoardUrl(activeTenant.slug)} />
          </div>
        )}
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
          {loaded && savedDescription === ''
            ? 'Your card under Browse says “No description yet.” until you add one.'
            : 'Shown on your org’s card under Browse.'}
        </p>
      </section>
    </div>
  );
}
