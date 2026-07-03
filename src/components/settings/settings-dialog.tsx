'use client';

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
import type { UserPreferences } from '@/types/preferences';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { preferences, updatePreferences } = useAuth();
  const loading = preferences === null;

  const handleToggle = async (patch: Partial<UserPreferences>) => {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Manage your personal preferences.</DialogDescription>
        </DialogHeader>

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

          {/* Board Display */}
          <section className="flex flex-col gap-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="detailed-view" className="text-sm font-medium">
                Detailed kanban cards
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
              Show more detail on each bill card. Off = simplified cards.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
