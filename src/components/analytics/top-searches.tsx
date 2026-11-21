'use client';

import { SearchX } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { TopSearch } from '@/types/analytics';

export function TopSearches({
  searches,
  orgScoped,
  collectingNote,
}: {
  searches: TopSearch[];
  /** Searches carry no org by design, so they only exist under "All organizations". */
  orgScoped: boolean;
  collectingNote: string;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Top searches</CardTitle>
        <CardDescription>{collectingNote}</CardDescription>
      </CardHeader>
      <CardContent>
        {orgScoped ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Searches are stored without an organization, so they appear only under All organizations.
          </p>
        ) : searches.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No searches recorded in this range.</p>
        ) : (
          <ol className="divide-y">
            {searches.map((s, i) => {
              const noResults = s.avgResults === 0;
              return (
                <li key={s.query} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium" title={s.query}>
                    {s.query}
                  </span>
                  {noResults && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                      <SearchX aria-hidden className="h-3 w-3" />
                      No results
                    </span>
                  )}
                  <span className="shrink-0 text-right tabular-nums">
                    {s.count.toLocaleString()}
                    <span className="ml-1 text-xs text-muted-foreground">×</span>
                  </span>
                  <span className="hidden w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:inline">
                    avg {s.avgResults.toLocaleString(undefined, { maximumFractionDigits: 1 })} results
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
