'use client';

import { useState } from 'react';
import type { BillVersion, CommitteeReport } from '@/types/legislation';
import { BillVersionsPanel } from './bill-versions-panel';
import { VersionCompare } from './version-compare';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

const SECTION_HEAD = 'shrink-0 border-b px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';

export function VersionsReportsTab({ versions, reports }: { versions: BillVersion[]; reports: CommitteeReport[] }) {
  const isMobile = useIsMobile();

  const timeline = (
    <div className="flex min-h-0 flex-1 flex-col">
      <BillVersionsPanel versions={versions} reports={reports} />
    </div>
  );

  const compare = (
    <div className="min-h-0 flex-1 overflow-auto px-4 pt-3 pb-4">
      <VersionCompare versions={versions} />
    </div>
  );

  // Mobile: sub-tabs (two scroll regions side by side don't fit at 375px).
  if (isMobile) {
    return <MobileTabs timeline={timeline} compare={compare} />;
  }

  // Desktop: side-by-side sections — Timeline (left) | Compare (right, wider
  // for the two-column diff). Each scrolls independently.
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

const TABS = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'compare', label: 'Compare' },
] as const;
type Tab = (typeof TABS)[number]['id'];

function MobileTabs({ timeline, compare }: { timeline: React.ReactNode; compare: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>('timeline');
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
              onClick={() => setTab(id)}
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
