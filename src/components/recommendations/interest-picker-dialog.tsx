'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/contexts/auth-context';
import { toast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { InterestsEditor, type InterestsValue } from '@/components/recommendations/interests-editor';
import { normalizeInterests } from '@/lib/bills/recommendation-topics';
import { shouldOpenInterestPicker, tourBlocksPicker } from '@/lib/recommendations/interest-picker';
import { TOUR_END_EVENT, TOUR_OPEN_EVENT, hasSeenTour } from '@/lib/tour/welcome-tour';

interface InterestPickerDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * "What do you care about?" Uncontrolled (no props): auto-opens once for
 * not-yet-onboarded users after the welcome tour. Controlled (open passed):
 * edit mode, saves interests only.
 */
export function InterestPickerDialog({ open, onOpenChange }: InterestPickerDialogProps = {}) {
  const editMode = open !== undefined;
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { user, preferences, updatePreferences } = useAuth();

  // The picker comes after the welcome tour: it waits while a tour runs, and for
  // an unseen tour on a page where it auto-starts (see tourBlocksPicker).
  // tourSeen starts false and is read from storage after mount, so the server
  // and client render the same closed dialog and nothing flashes.
  const [tourSeen, setTourSeen] = useState(false);
  const [tourRunning, setTourRunning] = useState(false);
  // Set as soon as Save/Skip fires so the dialog can't re-open while the
  // request is in flight, or after a failure, for this page view.
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<InterestsValue>({ topics: [], keywords: [] });

  useEffect(() => {
    setTourSeen(hasSeenTour());
    const start = () => setTourRunning(true);
    const end = () => {
      setTourRunning(false);
      setTourSeen(true);
    };
    window.addEventListener(TOUR_OPEN_EVENT, start);
    window.addEventListener(TOUR_END_EVENT, end);
    return () => {
      window.removeEventListener(TOUR_OPEN_EVENT, start);
      window.removeEventListener(TOUR_END_EVENT, end);
    };
  }, []);

  const autoOpen =
    !dismissed &&
    shouldOpenInterestPicker({
      signedIn: !!user,
      preferences,
      tourRunning: tourBlocksPicker({ tourRunning, tourSeen, pathname }),
    });
  const isOpen = editMode ? open : autoOpen;

  // Seed the draft each time the dialog opens.
  useEffect(() => {
    if (!isOpen) return;
    setDraft(
      normalizeInterests({
        topics: preferences?.interest_topics,
        keywords: preferences?.interest_keywords,
      }),
    );
    // Only on open transitions; later preference updates must not clobber edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const submit = async (withInterests: boolean) => {
    if (saving) return;
    setSaving(true);
    if (!editMode) setDismissed(true);
    try {
      await updatePreferences({
        ...(withInterests
          ? { interest_topics: draft.topics, interest_keywords: draft.keywords }
          : {}),
        mark_onboarded: true as const,
      });
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      if (editMode) {
        toast({ title: 'Interests saved', duration: 3000 });
        onOpenChange?.(false);
      }
    } catch (e) {
      console.error('Failed to save interests:', e);
      toast({
        title: 'Could not save interests',
        description: 'Please try again.',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (next) return;
    if (editMode) onOpenChange?.(false);
    else void submit(false); // Esc / overlay counts as Skip
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>What do you care about?</DialogTitle>
          <DialogDescription>
            Pick topics and add your own keywords. We use them to recommend bills on Find Bills.
          </DialogDescription>
        </DialogHeader>
        <InterestsEditor value={draft} onChange={setDraft} disabled={saving} />
        <DialogFooter>
          <Button
            variant="ghost"
            disabled={saving}
            onClick={() => (editMode ? onOpenChange?.(false) : void submit(false))}
          >
            {editMode ? 'Cancel' : 'Skip'}
          </Button>
          <Button disabled={saving} onClick={() => void submit(true)}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
