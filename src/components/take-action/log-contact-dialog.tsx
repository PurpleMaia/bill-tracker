'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { useContacts } from '@/hooks/use-contacts';
import { useBillLegislators } from '@/hooks/use-bill-legislators';
import {
  CONTACT_METHODS,
  CONTACT_METHOD_LABELS,
  CONTACT_STAGE_ACTIONS,
  type ContactMethod,
  type ContactStage,
} from '@/lib/legislators/contact-stage';

interface LogContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billId: string;
  billNumber: string;
  stage: ContactStage;
  /** Recipients the page already knows (chairs, conferees, the Governor's office). */
  suggestedRecipients?: string[];
  /** Pre-selected method, e.g. 'form' for the Governor. */
  defaultMethod?: ContactMethod;
  onLogged?: () => void;
}

/**
 * "Mark as contacted": records who the user reached out to about a bill, and
 * how. The message itself is sent from the user's own email app or phone —
 * this only keeps the record, for them and their org.
 */
export function LogContactDialog({
  open,
  onOpenChange,
  billId,
  billNumber,
  stage,
  suggestedRecipients = [],
  defaultMethod = 'email',
  onLogged,
}: LogContactDialogProps) {
  const { log } = useContacts();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<ContactMethod>(defaultMethod);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Fresh form each time it opens; a single suggestion starts checked.
  useEffect(() => {
    if (!open) return;
    setSelected(new Set(suggestedRecipients.length === 1 ? suggestedRecipients : []));
    setMethod(defaultMethod);
    setNote('');
    // suggestedRecipients is often a fresh array each render; key on its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultMethod, suggestedRecipients.join('\n')]);

  const { data: billLegislators = [], isLoading: legislatorsLoading } = useBillLegislators(billId, open);
  // The page's suggestions first, then everyone else on the bill.
  const checkboxNames = [...new Set([...suggestedRecipients, ...billLegislators])];

  const recipients = [...selected];

  const toggle = (name: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });
  };

  const handleSave = async () => {
    if (recipients.length === 0) return;
    setSaving(true);
    try {
      await log({ billId, stage, recipients, method, note: note.trim() || null });
      toast({
        title: 'Contact saved',
        description: `Marked ${recipients.length === 1 ? recipients[0] : `${recipients.length} people`} as contacted about ${billNumber}.`,
      });
      onOpenChange(false);
      onLogged?.();
    } catch (err: any) {
      toast({
        title: 'Could not save',
        description: err?.message ?? 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as contacted — {billNumber}</DialogTitle>
          <DialogDescription>
            {CONTACT_STAGE_ACTIONS[stage]}. Record who you reached out to so you
            {' '}and your team can keep track. Nothing is sent from here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Who did you contact?</legend>
            {checkboxNames.map((name) => {
              const id = `recipient-${name.replace(/\W+/g, '-')}`;
              return (
                <div key={name} className="flex items-center gap-2">
                  <Checkbox
                    id={id}
                    checked={selected.has(name)}
                    onCheckedChange={(checked) => toggle(name, checked === true)}
                  />
                  <Label htmlFor={id} className="text-sm font-normal">
                    {name}
                  </Label>
                </div>
              );
            })}
            {legislatorsLoading ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading legislators on this bill…
              </p>
            ) : (
              checkboxNames.length === 0 && (
                <p className="text-xs text-muted-foreground">No legislators on file for this bill.</p>
              )
            )}
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="contact-method">How?</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as ContactMethod)}>
              <SelectTrigger id="contact-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {CONTACT_METHOD_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contact-note">Note (optional)</Label>
            <Textarea
              id="contact-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Left a voicemail; staffer said they'd pass it on."
              maxLength={1000}
              className="min-h-[72px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || recipients.length === 0}>
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
            )}
            Mark as contacted
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
