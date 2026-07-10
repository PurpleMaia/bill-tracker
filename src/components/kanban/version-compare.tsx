'use client';

import { useMemo, useState } from 'react';
import type { BillVersion } from '@/types/legislation';
import { diffVersions, type DiffRow } from '@/services/bill-diff';
import { sortVersions } from '@/lib/bill-versions';
import { stubSummarize } from './ai-stub';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const COL_CLASS: Record<DiffRow['type'], string> = {
  add: 'bg-[#E7F4E9] text-[#2F7A3E]',
  del: 'bg-[#FBEAE6] text-[#B4442F]',
  modified: 'bg-[#FBEAE6] text-[#B4442F]',
  context: 'text-foreground/70',
};

export function VersionCompare({ versions }: { versions: BillVersion[] }) {
  const ordered = useMemo(() => sortVersions(versions), [versions]);

  const [olderId, setOlderId] = useState(ordered[0]?.id ?? '');
  const [newerId, setNewerId] = useState(ordered[ordered.length - 1]?.id ?? '');
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

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

  async function summarizeChanges() {
    if (!diff) return;
    setSummarizing(true);
    setSummary(null);
    try {
      setSummary(await stubSummarize(diff.rows.map((r) => r.text).join('\n')));
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <VersionPicker value={olderId} onChange={setOlderId} versions={ordered} />
        <span className="text-xs font-medium text-muted-foreground">compared with</span>
        <VersionPicker value={newerId} onChange={setNewerId} versions={ordered} />
        <Button variant="outline" size="sm" disabled={sameVersion || summarizing || diff?.error}
          className="ml-auto h-8 gap-1 border-olive-dark/40 px-2 text-xs text-olive-dark"
          onClick={summarizeChanges}>
          {summarizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Summarize changes
        </Button>
      </div>

      {sameVersion ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Pick two different versions.</p>
      ) : diff?.error ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Couldn&apos;t compute a diff for these versions.</p>
      ) : diff ? (
        <>
          {summary && (
            <div className="mb-3 rounded-md border border-olive-dark/40 bg-olive-soft/40 p-2.5">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-olive-dark">
                <Sparkles className="h-3 w-3" /> Summary of changes
              </span>
              <p className="mt-1 text-[12.5px] text-foreground/80">{summary}</p>
            </div>
          )}
          <div className="grid grid-cols-1 overflow-hidden rounded-md border font-mono text-[12px] sm:grid-cols-2">
            <DiffColumn label={diff.olderLabel} rows={diff.rows} keep="del" />
            <DiffColumn label={`${diff.newerLabel} · current`} rows={diff.rows} keep="add" className="border-t sm:border-l sm:border-t-0" />
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

// Renders one side of the split. `keep` = which change-type this column shows
// (older shows removed lines, newer shows added lines); modified + context show
// on both; the opposite change-type renders as a blank spacer to keep alignment.
function DiffColumn({ label, rows, keep, className }: { label: string; rows: DiffRow[]; keep: 'del' | 'add'; className?: string }) {
  return (
    <div className={className}>
      <div className="bg-muted/60 px-2.5 py-1.5 font-sans text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="py-1">
        {rows.map((row, i) => {
          const opposite = (keep === 'del' && row.type === 'add') || (keep === 'add' && row.type === 'del');
          if (opposite) return <div key={i} className="min-h-[18px] bg-muted/20 px-2.5 py-0.5">&nbsp;</div>;
          return <div key={i} className={cn('min-h-[18px] whitespace-pre-wrap px-2.5 py-0.5', COL_CLASS[row.type])}>{row.text}</div>;
        })}
      </div>
    </div>
  );
}
