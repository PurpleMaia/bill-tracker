'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BillVersion } from '@/types/legislation';
import type { VersionComparison } from '@/lib/versions/version-diff';
import { data } from '@/lib/data-client';
import { sortVersions, resolveComparisonOrder } from '@/lib/versions/bill-versions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeftRight } from 'lucide-react';
import { VersionDiffAccordion } from './version-diff-accordion';

const ERROR_COPY: Record<NonNullable<VersionComparison['error']>, string> = {
  'no-html': 'This version has no source document to compare.',
  'fetch-failed': "Couldn't reach the source document.",
  'parse-failed': "Couldn't read the source document for these versions.",
  'rate-limited': 'This comparison has been requested too many times just now. Try again in a minute.',
};

/** Errors a second attempt could plausibly resolve. */
const RETRYABLE: ReadonlySet<NonNullable<VersionComparison['error']>> = new Set([
  'fetch-failed',
  'rate-limited',
]);

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
  // Set when a pick was out of chronological order and we reordered it, so the
  // correction is visible rather than the dropdowns silently disagreeing with
  // what the user clicked.
  const [reordered, setReordered] = useState(false);

  // A diff is only meaningful older -> newer: comparing HB1334_CD2 against
  // HB1334 would render the bill's own amendments backwards, showing additions
  // as removals. Both pickers keep every option (filtering one list can strand
  // a selection the user can no longer reach); an inverted pick is swapped so
  // they still get the two versions they asked for, on the correct sides.
  function selectVersion(side: 'older' | 'newer', id: string) {
    const next = resolveComparisonOrder(
      ordered,
      side === 'older' ? id : olderId,
      side === 'newer' ? id : newerId,
    );
    setReordered(next.swapped);
    if (next.olderId !== olderId) onOlderChange(next.olderId);
    if (next.newerId !== newerId) onNewerChange(next.newerId);
  }

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
        <VersionPicker
          value={olderId}
          onChange={(id) => selectVersion('older', id)}
          versions={ordered}
          label="Older version"
        />
        <span className="text-xs font-medium text-muted-foreground">compared with</span>
        <VersionPicker
          value={newerId}
          onChange={(id) => selectVersion('newer', id)}
          versions={ordered}
          label="Newer version"
        />
      </div>

      {reordered && (
        <p className="mb-3 flex items-start gap-1.5 text-[11.5px] text-muted-foreground" role="status">
          <ArrowLeftRight className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Swapped so the earlier version is on the left — a comparison only reads one way.</span>
        </p>
      )}

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
          {/* Only a transient failure can succeed on a second try — a missing
              html_link or an unparseable document never will, so no Retry is
              offered there. */}
          {RETRYABLE.has(comparison.error) && (
            <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={() => setAttempt((a) => a + 1)}>
              Retry
            </Button>
          )}
        </div>
      ) : comparison ? (
        <VersionDiffAccordion key={`${olderId}-${newerId}`} comparison={comparison} billId={billId} olderId={olderId} newerId={newerId} />
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
