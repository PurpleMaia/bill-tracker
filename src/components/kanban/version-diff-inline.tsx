'use client';

import { useMemo, useState } from 'react';
import type { BillVersion } from '@/types/legislation';
import { diffVersions, DIFF_ROW_CLASS, type DiffRow } from '@/services/bill-diff';
import { Button } from '@/components/ui/button';
import { GitCompare } from 'lucide-react';
import { cn } from '@/lib/utils';

// Expand aligned rows into a unified (single-column) list: a modified row
// becomes a removed line followed by an added line.
function toUnifiedLines(rows: DiffRow[]): { kind: DiffRow['kind']; text: string }[] {
  const lines: { kind: DiffRow['kind']; text: string }[] = [];
  for (const row of rows) {
    if (row.kind === 'modified') {
      if (row.left !== null) lines.push({ kind: 'del', text: row.left });
      if (row.right !== null) lines.push({ kind: 'add', text: row.right });
    } else if (row.kind === 'del') {
      lines.push({ kind: 'del', text: row.left ?? '' });
    } else if (row.kind === 'add') {
      lines.push({ kind: 'add', text: row.right ?? '' });
    } else {
      lines.push({ kind: 'context', text: row.left ?? '' });
    }
  }
  return lines;
}

export function VersionDiffInline({ older, newer }: { older: BillVersion; newer: BillVersion }) {
  const [open, setOpen] = useState(false);
  const diff = useMemo(() => (open ? diffVersions(older, newer) : null), [open, older, newer]);
  const lines = useMemo(() => (diff && !diff.error ? toUnifiedLines(diff.rows) : []), [diff]);

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
            <span>{diff.error ? 'no diff available' : `${diff.rows.filter((r) => r.kind !== 'context').length} changes`}</span>
          </div>
          {diff.error ? (
            <p className="px-2.5 py-2 font-sans text-[11px] text-muted-foreground">Couldn&apos;t compute a diff for these versions.</p>
          ) : (
            <div className="py-1">
              {lines.map((line, i) => (
                <div key={i} className={cn('whitespace-pre-wrap px-2.5 py-0.5', DIFF_ROW_CLASS[line.kind])}>
                  {line.kind === 'add' ? '+ ' : line.kind === 'del' ? '− ' : '  '}{line.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
