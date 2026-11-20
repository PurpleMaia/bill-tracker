'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Search } from 'lucide-react';
import { bulkUpdateBillTagsAction, getTagsAction } from '@/app/actions/tags';
import { searchBillsLocal } from '@/lib/bills/bill-search';
import { matchBillNumberList } from '@/lib/bills/bill-number-list';
import { cn } from '@/lib/core/utils';
import { FADE_IN } from '@/lib/core/motion';
import type { Tag } from '@/types/legislation';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useBills } from '@/hooks/contexts/bills-context';

interface BulkTagPanelProps {
  /** Called after a successful apply (the Tags dialog closes itself). */
  onDone: () => void;
}

type Mode = 'add' | 'remove';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Org-admin panel for adding or removing tags on many bills at once. Bills
 * come from the current board, picked from a searchable checklist or by
 * pasting a list of bill numbers. The Tags dialog's Bulk tag tab; it mounts
 * fresh each time the tab opens, so a previous run's selection can't be
 * re-applied by accident.
 */
export function BulkTagPanel({ onDone }: BulkTagPanelProps) {
  const { activeTenant } = useAuth();
  const tenantId = activeTenant?.tenantId;
  const { bills, updateBill } = useBills();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [mode, setMode] = useState<Mode>('add');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [pasted, setPasted] = useState('');
  const [pasteResult, setPasteResult] = useState<{ matched: number; unmatched: string[] } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setLoadingTags(true);
    getTagsAction({ tenantId })
      .then((fetched) => { if (!cancelled) setTags(fetched); })
      .catch(() => toast({ title: 'Error', description: 'Failed to load tags', variant: 'destructive' }))
      .finally(() => { if (!cancelled) setLoadingTags(false); });
    return () => { cancelled = true; };
  }, [tenantId]);

  const sortedBills = useMemo(
    () => [...bills].sort((a, b) => a.bill_number.localeCompare(b.bill_number, undefined, { numeric: true })),
    [bills]
  );
  const shownBills = useMemo(
    () => (query.trim() ? searchBillsLocal(sortedBills, query) : sortedBills),
    [sortedBills, query]
  );
  const allShownSelected = shownBills.length > 0 && shownBills.every((b) => selectedBillIds.has(b.id));

  const toggleTag = (tagId: string) =>
    setSelectedTagIds((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]));

  const toggleBill = (billId: string) =>
    setSelectedBillIds((prev) => {
      const next = new Set(prev);
      if (next.has(billId)) next.delete(billId);
      else next.add(billId);
      return next;
    });

  const toggleAllShown = () =>
    setSelectedBillIds((prev) => {
      const next = new Set(prev);
      for (const bill of shownBills) {
        if (allShownSelected) next.delete(bill.id);
        else next.add(bill.id);
      }
      return next;
    });

  const selectPasted = () => {
    const { matchedIds, unmatched } = matchBillNumberList(pasted, bills);
    setSelectedBillIds((prev) => new Set([...prev, ...matchedIds]));
    setPasteResult({ matched: matchedIds.length, unmatched });
  };

  const handleApply = async () => {
    if (!tenantId) return;
    setSaving(true);
    try {
      const updated = await bulkUpdateBillTagsAction({
        billIds: Array.from(selectedBillIds),
        tagIds: selectedTagIds,
        mode,
        tenantId,
      });
      for (const [billId, billTags] of Object.entries(updated)) {
        updateBill(billId, { tags: billTags });
      }
      toast({
        title: 'Tags updated',
        description: `${mode === 'add' ? 'Added' : 'Removed'} ${plural(selectedTagIds.length, 'tag')} ${mode === 'add' ? 'to' : 'from'} ${plural(Object.keys(updated).length, 'bill')}.`,
      });
      onDone();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update tags',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const canApply = selectedTagIds.length > 0 && selectedBillIds.size > 0 && !saving;

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4">
        {/* p-1 / -m-1: room for the 4px focus ring (ring + offset) so the
            scroll container doesn't clip it, without shifting the layout. */}
        <div className="flex flex-1 min-h-0 flex-col gap-5 overflow-y-auto -m-1 p-1">
          {/* Step 1: what to do, and with which tags */}
          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">1. Choose tags</h3>
              <div role="group" aria-label="Add or remove" className="inline-flex rounded-md border p-0.5">
                {(['add', 'remove'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={mode === value}
                    onClick={() => setMode(value)}
                    className={cn(
                      'rounded px-3 py-1 text-xs font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      mode === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'
                    )}
                  >
                    {value === 'add' ? 'Add tags' : 'Remove tags'}
                  </button>
                ))}
              </div>
            </div>
            {loadingTags ? (
              <p className="text-sm text-muted-foreground">Loading tags...</p>
            ) : tags.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No tags yet. Create some in the Manage Tags tab first.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => {
                  const selected = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      onClick={() => toggleTag(tag.id)}
                      className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Badge
                        variant="outline"
                        style={selected ? { backgroundColor: tag.color || '#3b82f6', borderColor: tag.color || '#3b82f6', color: 'white' } : undefined}
                        className="text-xs cursor-pointer"
                      >
                        {tag.name}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Step 2: which bills */}
          {/* Grows to fill the dialog so the bill list runs down to the footer. */}
          <section className="flex flex-1 flex-col gap-2">
            <h3 className="text-sm font-semibold">2. Choose bills</h3>
            <Tabs defaultValue="pick" className="flex flex-1 flex-col">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="pick">Pick from board</TabsTrigger>
                <TabsTrigger value="paste">Paste a list</TabsTrigger>
              </TabsList>

              <TabsContent value="pick" className={cn("flex flex-1 flex-col gap-2", FADE_IN)}>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by number or title"
                      aria-label="Search bills"
                      className="pl-9"
                    />
                  </div>
                  <Button variant="outline" size="sm" onClick={toggleAllShown} disabled={shownBills.length === 0}>
                    {allShownSelected ? 'Clear shown' : 'Select shown'}
                  </Button>
                </div>
                <div className="min-h-[240px] flex-1 basis-0 overflow-y-auto rounded-md border divide-y">
                  {shownBills.length === 0 ? (
                    <p className="p-4 text-center text-sm text-muted-foreground">No bills match.</p>
                  ) : (
                    shownBills.map((bill) => (
                      <label
                        key={bill.id}
                        className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-secondary/60"
                      >
                        <Checkbox
                          checked={selectedBillIds.has(bill.id)}
                          onCheckedChange={() => toggleBill(bill.id)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-muted-foreground">{bill.bill_number}</span>
                            {bill.year && <span className="text-xs text-muted-foreground">· {bill.year}</span>}
                          </span>
                          <span className="block truncate text-sm">{bill.nickname || bill.bill_title}</span>
                          {bill.tags && bill.tags.length > 0 && (
                            <span className="mt-1 flex flex-wrap gap-1">
                              {bill.tags.map((tag) => (
                                <span
                                  key={tag.id}
                                  className="rounded px-1.5 text-[11px] leading-4 text-white"
                                  style={{ backgroundColor: tag.color || '#3b82f6' }}
                                >
                                  {tag.name}
                                </span>
                              ))}
                            </span>
                          )}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="paste" className={cn("space-y-2", FADE_IN)}>
                <Textarea
                  value={pasted}
                  onChange={(e) => { setPasted(e.target.value); setPasteResult(null); }}
                  placeholder={'HB1334, SB45\nHB 12 HD1'}
                  aria-label="Bill numbers"
                  rows={6}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Separate with commas, spaces, or new lines. Only bills on this board can be tagged.
                  </p>
                  <Button variant="outline" size="sm" onClick={selectPasted} disabled={!pasted.trim()}>
                    Select these bills
                  </Button>
                </div>
                {pasteResult && (
                  <div className="rounded-md bg-secondary/60 p-2 text-xs" role="status">
                    <p>Selected {plural(pasteResult.matched, 'bill')}.</p>
                    {pasteResult.unmatched.length > 0 && (
                      <p className="mt-1 text-destructive">
                        Not on this board: {pasteResult.unmatched.join(', ')}
                      </p>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </section>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {plural(selectedBillIds.size, 'bill')} selected
            {selectedBillIds.size > 0 && (
              <>
                {' · '}
                <button
                  type="button"
                  onClick={() => setSelectedBillIds(new Set())}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  clear
                </button>
              </>
            )}
          </p>
          <div className="flex gap-2">
            <Button
              className="w-full sm:w-auto"
              onClick={handleApply}
              disabled={!canApply}
              variant={mode === 'remove' ? 'destructive' : 'default'}
            >
              {saving
                ? 'Saving...'
                : `${mode === 'add' ? 'Add' : 'Remove'} ${plural(selectedTagIds.length, 'tag')} ${mode === 'add' ? 'to' : 'from'} ${plural(selectedBillIds.size, 'bill')}`}
            </Button>
          </div>
        </div>
    </div>
  );
}
