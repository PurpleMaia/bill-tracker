'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Check, Loader2, Plus } from 'lucide-react';
import { data } from '@/lib/data-client';
import { FROM_TESTIMONY } from '@/lib/take-action/routes';
import type { TestimonyBillOption } from '@/types/testimony';
import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

/**
 * "New testimony" on Your Testimonies: pick any bill you follow — hearing
 * scheduled first — and open the writer on that bill's current hearing round.
 * A bill whose current round you already wrote for opens that testimony.
 */
export function NewTestimonyButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<TestimonyBillOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  // Fetched on each open so a bill followed (or a hearing scheduled) since last time shows up.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    data.testimony
      .billOptions()
      .then((next) => {
        if (!cancelled) setOptions(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? 'Failed to load your bills');
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const choose = (billId: string) => {
    setOpening(billId);
    router.push(`/bills/${billId}/testimony?from=${FROM_TESTIMONY}&round=current`);
  };

  const scheduled = options?.filter((o) => o.scheduled) ?? [];
  const others = options?.filter((o) => !o.scheduled) ?? [];

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Testimony
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search bills you follow…" />
        <CommandList className="max-h-[60vh]">
          {options === null && !error ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading your bills…
            </div>
          ) : error ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{error}</p>
          ) : (
            <>
              <CommandEmpty className="px-6 py-8 text-center text-sm text-muted-foreground">
                {options?.length === 0
                  ? 'None of the bills you follow can take testimony right now. Track a bill from Find Bills or Your Tracker to write testimony for it — failed and archived bills don’t appear here.'
                  : 'No bills you follow match your search.'}
              </CommandEmpty>
              {scheduled.length === 0 && others.length > 0 && (
                <p className="flex items-center gap-1.5 px-4 pb-1 pt-3 text-xs text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                  No hearings are scheduled for bills you follow yet — you can still start a draft now.
                </p>
              )}
              {scheduled.length > 0 && (
                <CommandGroup heading="Hearing scheduled">
                  {scheduled.map((option) => (
                    <BillOptionItem key={option.billId} option={option} opening={opening} onSelect={choose} />
                  ))}
                </CommandGroup>
              )}
              {others.length > 0 && (
                <CommandGroup heading="All bills you follow">
                  {others.map((option) => (
                    <BillOptionItem key={option.billId} option={option} opening={opening} onSelect={choose} />
                  ))}
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}

function BillOptionItem({
  option,
  opening,
  onSelect,
}: {
  option: TestimonyBillOption;
  opening: string | null;
  onSelect: (billId: string) => void;
}) {
  const name = option.nickname || option.billTitle || '';
  return (
    <CommandItem
      // cmdk filters on this value: bill number + name + round.
      value={`${option.billNumber} ${name} ${option.roundLabel}`}
      onSelect={() => onSelect(option.billId)}
      disabled={opening !== null}
      // Light teal-soft highlight instead of the shared deep-teal accent.
      className="flex items-start gap-3 data-[selected='true']:bg-secondary data-[selected=true]:text-secondary-foreground"
    >
      <span className="mt-0.5 w-16 shrink-0 text-sm font-semibold">{option.billNumber}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{name}</span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {option.scheduled && <CalendarClock className="!size-3" />}
          {option.roundLabel}
        </span>
      </span>
      {opening === option.billId ? (
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      ) : option.written ? (
        <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
          <Check className="!size-3" />
          Started
        </span>
      ) : null}
    </CommandItem>
  );
}
