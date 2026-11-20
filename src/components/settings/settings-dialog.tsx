'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/contexts/auth-context';
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EditProfilePanel } from '@/components/auth/edit-profile-dialog';
import { isProfileIncomplete } from '@/lib/auth/profile';
import { Button } from '@/components/ui/button';
import { InterestsEditor, type InterestsValue } from '@/components/recommendations/interests-editor';
import { normalizeInterests } from '@/lib/bills/recommendation-topics';
import type { PreferencesPatch } from '@/types/preferences';

export type SettingsTab = 'preferences' | 'profile';

interface SettingsDialogProps {
  /** The open tab, or null when the dialog is closed. */
  tab: SettingsTab | null;
  onTabChange: (tab: SettingsTab | null) => void;
}

/** Personal preference toggles (AI, board view) — the Settings dialog's
 *  Preferences tab. */
export function PreferencesPanel() {
  const { preferences, updatePreferences } = useAuth();
  const loading = preferences === null;
  const queryClient = useQueryClient();

  const saved: InterestsValue = normalizeInterests({
    topics: preferences?.interest_topics,
    keywords: preferences?.interest_keywords,
  });
  const [interests, setInterests] = useState<InterestsValue>(saved);
  const [savingInterests, setSavingInterests] = useState(false);
  // Seed the draft once preferences arrive (they may load after mount).
  const [seeded, setSeeded] = useState(!loading);
  useEffect(() => {
    if (!seeded && preferences) {
      setInterests(saved);
      setSeeded(true);
    }
  }, [seeded, preferences]); // eslint-disable-line react-hooks/exhaustive-deps

  const interestsDirty =
    interests.topics.join('\n') !== saved.topics.join('\n') ||
    interests.keywords.join('\n') !== saved.keywords.join('\n');

  const saveInterests = async () => {
    // Save stays clickable even when nothing looks changed: a keyword typed but
    // not yet added only lands in `interests` when the input blurs on mousedown,
    // so a disabled button would swallow that click.
    if (!interestsDirty) {
      toast({ title: 'No changes to save', duration: 3000 });
      return;
    }
    setSavingInterests(true);
    try {
      await updatePreferences({
        interest_topics: interests.topics,
        interest_keywords: interests.keywords,
        mark_onboarded: true,
      });
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      toast({ title: 'Interests saved', duration: 3000 });
    } catch (e) {
      console.error('Failed to save interests:', e);
      toast({
        title: 'Could not save interests',
        description: 'Please try again.',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setSavingInterests(false);
    }
  };

  const handleToggle = async (patch: PreferencesPatch) => {
    try {
      await updatePreferences(patch);
    } catch (e) {
      console.error('Failed to update preferences:', e);
      toast({
        title: 'Could not save setting',
        description: 'Please try again.',
        variant: 'destructive',
        duration: 5000,
      });
    }
  };

  return (
    <div className="flex flex-col gap-6 py-2">
      {/* AI Features */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="ai-opt-in" className="text-sm font-medium">
            Enable AI features
          </Label>
          <Switch
            id="ai-opt-in"
            disabled={loading}
            checked={preferences?.ai_opt_in ?? false}
            onCheckedChange={(checked) => handleToggle({ ai_opt_in: checked })}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Turn on AI-assisted summaries and testimony help. Off by default.
        </p>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="ai-info" className="border-b-0">
            <AccordionTrigger className="text-xs py-2">
              What does AI do &amp; how are models hosted?
            </AccordionTrigger>
            <AccordionContent className="text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">When enabled, AI provides:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  <span className="font-medium">Bill summaries</span>: plain-language
                  summaries of bills, translating legal text and summarizing key status.
                </li>
                <li>
                  <span className="font-medium">Testimony assistance</span>: drafting
                  help and suggestions for written testimony.
                </li>
              </ul>

              <p className="font-medium text-foreground pt-1">How
                our models are hosted</p>
              <p>
                Inference runs locally on our Maui cluster. Your
                data never leaves to a mainland data center, and 
                your testimonies are never used to train models.
              </p>
              <p>
                We reuse an existing open model rather than training our own, so we add
                nothing to that one-time training footprint, and we keep our own carbon-
                use low through caching and smaller models.
              </p>
              <p>
                AI output can be inaccurate,
                so always review before relying on it or submitting testimony. You can 
                turn this off at anytime.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      {/* Interests */}
      <section className="flex flex-col gap-3 border-t pt-4">
        <Label className="text-sm font-medium">Interests</Label>
        <p className="text-xs text-muted-foreground">
          Pick topics and add your own keywords to get recommended bills.
        </p>
        <InterestsEditor
          value={interests}
          onChange={setInterests}
          disabled={loading || savingInterests}
        />
        <Button
          size="sm"
          className="self-start"
          disabled={loading || savingInterests}
          onClick={saveInterests}
        >
          {savingInterests ? 'Saving...' : 'Save interests'}
        </Button>
      </section>

      {/* Board Display */}
      <section className="flex flex-col gap-2 border-t pt-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="detailed-view" className="text-sm font-medium">
            Detailed kanban columns
          </Label>
          <Switch
            id="detailed-view"
            disabled={loading}
            checked={preferences?.kanban_detailed_view ?? false}
            onCheckedChange={(checked) =>
              handleToggle({ kanban_detailed_view: checked })
            }
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Shows in-depth bill statuses, highlighting each committee that a bill has to pass through. Off by default for a simpler view.
        </p>
      </section>
    </div>
  );
}

/**
 * Everything about you, one tab per kind of setting. Preferences leads: board
 * view and AI are what people most often come here for. The avatar menu's
 * Settings items open it straight onto the matching tab.
 */
export function SettingsDialog({ tab, onTabChange }: SettingsDialogProps) {
  const { user } = useAuth();
  const close = () => onTabChange(null);

  return (
    <Dialog open={tab !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Manage your profile, board view, and AI features.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab ?? 'preferences'} onValueChange={(v) => onTabChange(v as SettingsTab)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="profile" className="gap-1.5">
              Profile
              {isProfileIncomplete(user) && (
                <>
                  <span aria-hidden className="h-2 w-2 rounded-full bg-yellow-400" />
                  <span className="sr-only">(incomplete)</span>
                </>
              )}
            </TabsTrigger>
          </TabsList>
          {/* forceMount + hidden: switching tabs keeps an unsaved name draft. */}
          <TabsContent value="preferences" forceMount className="mt-2 data-[state=inactive]:hidden">
            <PreferencesPanel />
          </TabsContent>
          <TabsContent value="profile" forceMount className="mt-4 data-[state=inactive]:hidden">
            <EditProfilePanel onSaved={close} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
