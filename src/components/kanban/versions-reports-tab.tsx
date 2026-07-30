'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BillVersion, CommitteeReport } from '@/types/legislation';
import { BillVersionsPanel } from './bill-versions-panel';
import { VersionCompare } from './version-compare';
import { sortVersions, resolveComparisonOrder } from '@/lib/bill-versions';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

const SECTION_HEAD = 'shrink-0 border-b px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';

const TABS = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'compare', label: 'Compare' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export function VersionsReportsTab({
  billId,
  versions,
  reports,
}: {
  billId: string;
  versions: BillVersion[];
  reports: CommitteeReport[];
}) {
  const isMobile = useIsMobile();
  const ordered = useMemo(() => sortVersions(versions), [versions]);

  // The selected comparison pair is owned here — the single source of truth for
  // both entry points. The dropdowns set it directly; the timeline's Compare
  // button sets it too (populating the dropdowns), and the diff computes off
  // this state either way.
  const [olderId, setOlderId] = useState('');
  const [newerId, setNewerId] = useState('');
  const [tab, setTab] = useState<Tab>('timeline');

  // Default to introduced-vs-current once versions load, and recover if the
  // selected ids are no longer present.
  useEffect(() => {
    if (ordered.length < 2) return;
    const ids = new Set(ordered.map((v) => v.id));
    if (!ids.has(olderId)) setOlderId(ordered[0].id);
    if (!ids.has(newerId)) setNewerId(ordered[ordered.length - 1].id);
  }, [ordered, olderId, newerId]);

  const handleCompare = useCallback(
    (nextOlderId: string, nextNewerId: string) => {
      // The timeline is a second way into a comparison, so it gets the same
      // ordering guarantee as the dropdowns: a diff only reads older -> newer.
      const { olderId: o, newerId: n } = resolveComparisonOrder(ordered, nextOlderId, nextNewerId);
      setOlderId(o);
      setNewerId(n);
      // On mobile the panels are sub-tabs, so without this the tap looks inert.
      setTab('compare');
    },
    [ordered],
  );

  const timeline = (
    <div className="flex min-h-0 flex-1 flex-col">
      <BillVersionsPanel
        billId={billId}
        versions={versions}
        reports={reports}
        selectedOlderId={olderId}
        selectedNewerId={newerId}
        onCompare={handleCompare}
      />
    </div>
  );

  const compare = (
    <div className="min-h-0 flex-1 overflow-auto px-4 pt-3 pb-4">
      <VersionCompare
        billId={billId}
        versions={versions}
        olderId={olderId}
        newerId={newerId}
        onOlderChange={setOlderId}
        onNewerChange={setNewerId}
      />
    </div>
  );

  // Mobile: sub-tabs (two scroll regions side by side don't fit at 375px).
  if (isMobile) {
    return <MobileTabs tab={tab} onTabChange={setTab} timeline={timeline} compare={compare} />;
  }

  // Desktop: side-by-side sections — Timeline (left) | Compare (right, wider
  // for the diff). Each scrolls independently.
  return (
    <div className="flex h-full min-h-0">
      <section className="flex w-[42%] min-h-0 flex-col border-r">
        <h3 className={SECTION_HEAD}>Timeline</h3>
        {timeline}
      </section>
      <section className="flex w-[58%] min-h-0 flex-col">
        <h3 className={SECTION_HEAD}>Compare versions</h3>
        {compare}
      </section>
    </div>
  );
}

function MobileTabs({
  tab,
  onTabChange,
  timeline,
  compare,
}: {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  timeline: React.ReactNode;
  compare: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Versions views" className="flex shrink-0 gap-4 border-b px-4">
        {TABS.map(({ id, label }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => onTabChange(id)}
              className={cn(
                '-mb-px border-b-2 py-2 text-sm font-medium transition-colors',
                active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      {tab === 'timeline' ? timeline : compare}
    </div>
  );
}
