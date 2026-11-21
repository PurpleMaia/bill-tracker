'use client';

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { percentChange } from '@/lib/analytics/buckets';
import { cn } from '@/lib/core/utils';
import type { FeatureRow } from '@/types/analytics';

/** Searches are stored with no user/anon identity, so per-person counts don't exist for them. */
const ANONYMOUS_KEY = 'bill_search';

function Untracked() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="cursor-help text-muted-foreground" aria-label="Not tracked: searches are stored anonymously">
          —
        </span>
      </TooltipTrigger>
      <TooltipContent>Searches are stored anonymously</TooltipContent>
    </Tooltip>
  );
}

function Change({ current, previous, hasPrevious }: { current: number; previous: number; hasPrevious: boolean }) {
  const pct = hasPrevious ? percentChange(current, previous) : null;
  if (pct === null) {
    return <span className="text-muted-foreground">{hasPrevious && current > 0 ? 'New' : '—'}</span>;
  }
  const Icon = pct > 0 ? ArrowUpRight : pct < 0 ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
        pct > 0 ? 'bg-primary/10 text-primary' : pct < 0 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
      )}
    >
      <Icon aria-hidden className="h-3 w-3" />
      {pct > 0 ? '+' : ''}
      {pct}%
    </span>
  );
}

export function FeatureUsageTable({
  features,
  hasPrevious,
  collectingNote,
}: {
  features: FeatureRow[];
  /** False for "All time": there is no previous period to compare against. */
  hasPrevious: boolean;
  collectingNote: string;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Feature usage</CardTitle>
        <CardDescription>{collectingNote}</CardDescription>
      </CardHeader>
      <CardContent>
        {features.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No feature usage recorded in this range.</p>
        ) : (
          // The table scrolls inside its card so the page never scrolls sideways.
          <div className="overflow-x-auto">
            <Table className="min-w-[36rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">vs. previous period</TableHead>
                  <TableHead className="text-right">Unique users</TableHead>
                  <TableHead className="text-right">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={0} className="cursor-help underline decoration-dotted underline-offset-2">
                          Anonymous visitors
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Approximate: counted per device/browser</TooltipContent>
                    </Tooltip>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {features.map((f) => {
                  const anonymous = f.key === ANONYMOUS_KEY;
                  return (
                    <TableRow key={f.key}>
                      <TableCell className="font-medium">{f.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{f.count.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <Change current={f.count} previous={f.previousCount} hasPrevious={hasPrevious} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {anonymous ? <Untracked /> : f.uniqueUsers.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {anonymous ? <Untracked /> : `≈ ${f.anonVisitors.toLocaleString()}`}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
