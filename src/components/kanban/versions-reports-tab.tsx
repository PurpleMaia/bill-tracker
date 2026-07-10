'use client';

import { useState } from 'react';
import type { BillVersion, CommitteeReport } from '@/types/legislation';
import { BillVersionsPanel } from './bill-versions-panel';
import { VersionCompare } from './version-compare';
import { cn } from '@/lib/utils';

const SUB_TABS = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'compare', label: 'Compare' },
] as const;
type SubTab = (typeof SUB_TABS)[number]['id'];

export function VersionsReportsTab({ versions, reports }: { versions: BillVersion[]; reports: CommitteeReport[] }) {
  const [sub, setSub] = useState<SubTab>('timeline');

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Underline-style sub-tabs — tight, no rounded pill */}
      <div role="tablist" aria-label="Versions views" className="flex shrink-0 gap-4 border-b px-4">
        {SUB_TABS.map(({ id, label }) => {
          const active = sub === id;
          return (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setSub(id)}
              className={cn(
                '-mb-px border-b-2 py-2 text-sm font-medium transition-colors',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {sub === 'timeline' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <BillVersionsPanel versions={versions} reports={reports} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-4 pt-3 pb-4">
          <VersionCompare versions={versions} />
        </div>
      )}
    </div>
  );
}
