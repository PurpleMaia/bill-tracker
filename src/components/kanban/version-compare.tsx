'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BillVersion } from '@/types/legislation';
import type { VersionComparison } from '@/lib/version-diff';
import { data } from '@/lib/data-client';
import { sortVersions } from '@/lib/bill-versions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { VersionDiffAccordion } from './version-diff-accordion';

const ERROR_COPY: Record<NonNullable<VersionComparison['error']>, string> = {
  'no-html': 'This version has no source document to compare.',
  'fetch-failed': "Couldn't reach the source document.",
  'parse-failed': "Couldn't read the source document for these versions.",
};

export function VersionCompare({
  billId,
  versions,
  olderId,
  newerId,
  onOlderChange,
  onNewerChange,
}: {
  billId: string;
  versions: BillVersion[];
  olderId: string;
  newerId: string;
  onOlderChange: (id: string) => void;
  onNewerChange: (id: string) => void;
}) {
  const ordered = useMemo(() => sortVersions(versions), [versions]);
  const sameVersion = olderId === newerId;

  const [comparison, setComparison] = useState<VersionComparison | null>(null);
  const [loading, setLoading] = useState(false);
  // Bumping this re-runs the effect for Retry without changing the selection.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!billId || !olderId || !newerId || sameVersion) {
      setComparison(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    data.bills
      .compareVersions({ billId, olderId, newerId })
      .then((result) => {
        if (!cancelled) setComparison(result);
      })
      .catch(() => {
        if (!cancelled) {
          setComparison({
            olderLabel: ordered.find((v) => v.id === olderId)?.label ?? 'older',
            newerLabel: ordered.find((v) => v.id === newerId)?.label ?? 'newer',
            sections: [],
            totals: { added: 0, removed: 0, modified: 0, unchanged: 0 },
            parseIncomplete: false,
            error: 'fetch-failed',
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `ordered` is only read for fallback labels; excluded to avoid refetching
    // when the array identity changes but the selected ids do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billId, olderId, newerId, sameVersion, attempt]);

  if (ordered.length < 2) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Need at least two versions to compare.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <VersionPicker value={olderId} onChange={onOlderChange} versions={ordered} label="Older version" />
        <span className="text-xs font-medium text-muted-foreground">compared with</span>
        <VersionPicker value={newerId} onChange={onNewerChange} versions={ordered} label="Newer version" />
      </div>

      {sameVersion ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Pick two different versions.</p>
      ) : loading ? (
        <div className="space-y-2" aria-busy="true" aria-live="polite">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : comparison?.error ? (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">{ERROR_COPY[comparison.error]}</p>
          {/* Only a fetch failure can succeed on a second try — a missing
              html_link never will, so no Retry is offered there. */}
          {comparison.error === 'fetch-failed' && (
            <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={() => setAttempt((a) => a + 1)}>
              Retry
            </Button>
          )}
        </div>
      ) : comparison ? (
        <VersionDiffAccordion comparison={comparison} />
      ) : null}
    </div>
  );
}

function VersionPicker({
  value,
  onChange,
  versions,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  versions: BillVersion[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto min-w-[130px] text-xs" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {versions.map((v) => (
          <SelectItem key={v.id} value={v.id} className="text-xs">
            {v.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
