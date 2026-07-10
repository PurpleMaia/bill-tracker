'use client';

import type { BillVersion, CommitteeReport } from '@/types/legislation';
import { BillVersionsPanel } from './bill-versions-panel';
import { VersionCompare } from './version-compare';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export function VersionsReportsTab({ versions, reports }: { versions: BillVersion[]; reports: CommitteeReport[] }) {
  return (
    <Tabs defaultValue="timeline" className="flex h-full min-h-0 flex-col">
      <TabsList className="mx-4 mt-3 w-fit shrink-0">
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
        <TabsTrigger value="compare">Compare</TabsTrigger>
      </TabsList>
      <TabsContent value="timeline" className="mt-2 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
        <BillVersionsPanel versions={versions} reports={reports} />
      </TabsContent>
      <TabsContent value="compare" className="mt-2 min-h-0 flex-1 overflow-auto px-4 pb-4 data-[state=inactive]:hidden">
        <VersionCompare versions={versions} />
      </TabsContent>
    </Tabs>
  );
}
