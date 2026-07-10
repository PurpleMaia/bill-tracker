'use client';

import { useMemo, useState } from 'react';
import type { BillVersion } from '@/types/legislation';
import { diffVersions, type DiffRow } from '@/services/bill-diff';
import { Button } from '@/components/ui/button';
import { GitCompare } from 'lucide-react';
import { cn } from '@/lib/utils';

const ROW_CLASS: Record<DiffRow['type'], string> = {
  add: 'bg-[#E7F4E9] text-[#2F7A3E]',
  del: 'bg-[#FBEAE6] text-[#B4442F]',
  modified: 'bg-[#FBEAE6] text-[#B4442F]',
  context: 'text-foreground/60',
};

export function VersionDiffInline({ older, newer }: { older: BillVersion; newer: BillVersion }) {
  const [open, setOpen] = useState(false);
  const diff = useMemo(() => (open ? diffVersions(older, newer) : null), [open, older, newer]);

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}
        className="h-7 gap-1 px-1.5 text-xs text-primary hover:bg-transparent hover:text-primary/80">
        <GitCompare className="h-3.5 w-3.5" /> {open ? 'Hide diff' : `Diff vs ${older.label}`}
      </Button>
      {open && diff && (
        <div className="mt-1.5 max-w-[780px] overflow-hidden rounded-md border font-mono text-[12px]">
          <div className="flex justify-between bg-muted/60 px-2.5 py-1.5 font-sans text-[11px] text-muted-foreground">
            <span>{diff.olderLabel} → {diff.newerLabel}</span>
            <span>{diff.error ? 'no diff available' : `${diff.rows.filter((r) => r.type !== 'context').length} changes`}</span>
          </div>
          {diff.error ? (
            <p className="px-2.5 py-2 font-sans text-[11px] text-muted-foreground">Couldn&apos;t compute a diff for these versions.</p>
          ) : (
            <div className="py-1">
              {diff.rows.map((row, i) => (
                <div key={i} className={cn('whitespace-pre-wrap px-2.5 py-0.5', ROW_CLASS[row.type])}>
                  {row.type === 'add' ? '+ ' : row.type === 'del' || row.type === 'modified' ? '− ' : '  '}{row.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
