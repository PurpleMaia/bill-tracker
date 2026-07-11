'use client';

import { useMemo, useState } from 'react';
import type { BillVersion } from '@/types/legislation';
import { diffVersions, DIFF_ROW_CLASS, type DiffRow } from '@/services/bill-diff';
import { sortVersions } from '@/lib/bill-versions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export function VersionCompare({ versions }: { versions: BillVersion[] }) {
  const ordered = useMemo(() => sortVersions(versions), [versions]);

  const [olderId, setOlderId] = useState(ordered[0]?.id ?? '');
  const [newerId, setNewerId] = useState(ordered[ordered.length - 1]?.id ?? '');

  const older = ordered.find((v) => v.id === olderId) ?? ordered[0];
  const newer = ordered.find((v) => v.id === newerId) ?? ordered[ordered.length - 1];
  const sameVersion = older?.id === newer?.id;
  const diff = useMemo(
    () => (sameVersion || !older || !newer ? null : diffVersions(older, newer)),
    [sameVersion, older, newer],
  );

  if (ordered.length < 2) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Need at least two versions to compare.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <VersionPicker value={olderId} onChange={setOlderId} versions={ordered} />
        <span className="text-xs font-medium text-muted-foreground">compared with</span>
        <VersionPicker value={newerId} onChange={setNewerId} versions={ordered} />
      </div>

      {sameVersion ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Pick two different versions.</p>
      ) : diff?.error ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Couldn&apos;t compute a diff for these versions.</p>
      ) : diff ? (
        <>
          {diff.summaryText && (
            <div className="mb-3 rounded-md border bg-muted/40 p-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Summary of changes</span>
              <p className="mt-1 whitespace-pre-wrap text-[12.5px] text-foreground/80">{diff.summaryText}</p>
            </div>
          )}
          <div className="grid grid-cols-1 overflow-hidden rounded-md border font-mono text-[12px] sm:grid-cols-2">
            <DiffColumn label={diff.olderLabel} rows={diff.rows} side="left" />
            <DiffColumn label={`${diff.newerLabel} · current`} rows={diff.rows} side="right" className="border-t sm:border-l sm:border-t-0" />
          </div>
        </>
      ) : null}
    </div>
  );
}

function VersionPicker({ value, onChange, versions }: { value: string; onChange: (v: string) => void; versions: BillVersion[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto min-w-[130px] text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {versions.map((v) => <SelectItem key={v.id} value={v.id} className="text-xs">{v.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// Renders one side of the aligned split. Each row carries both `left` (older)
// and `right` (newer); this column shows its own side, blank when that side is
// null (an addition on the left, a removal on the right).
function DiffColumn({ label, rows, side, className }: { label: string; rows: DiffRow[]; side: 'left' | 'right'; className?: string }) {
  return (
    <div className={className}>
      <div className="bg-muted/60 px-2.5 py-1.5 font-sans text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="py-1">
        {rows.map((row, i) => {
          const text = side === 'left' ? row.left : row.right;
          if (text === null) return <div key={i} className="min-h-[18px] bg-muted/20 px-2.5 py-0.5">&nbsp;</div>;
          return <div key={i} className={cn('min-h-[18px] whitespace-pre-wrap px-2.5 py-0.5', DIFF_ROW_CLASS[row.kind])}>{text}</div>;
        })}
      </div>
    </div>
  );
}
