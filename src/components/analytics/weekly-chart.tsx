'use client';

import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import type { WeeklyPoint } from '@/types/analytics';

export interface WeeklySeries {
  key: string;
  label: string;
  points: WeeklyPoint[];
  /** Light/dark stroke or fill; a single-series chart uses the brand primary. */
  theme: { light: string; dark: string };
}

// Weeks arrive as 'YYYY-MM-DD' (Honolulu Monday). Format in UTC so the date
// never shifts with the viewer's own timezone.
const tickFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fullFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const weekDate = (week: string) => new Date(`${week}T00:00:00Z`);

export function WeeklyChart({
  title,
  description,
  note,
  series,
  kind,
}: {
  title: string;
  description?: string;
  note?: string;
  series: WeeklySeries[];
  kind: 'bar' | 'line';
}) {
  const config = useMemo<ChartConfig>(
    () => Object.fromEntries(series.map((s) => [s.key, { label: s.label, theme: s.theme }])),
    [series],
  );

  // One row per week with a column per series (all series share the same weeks).
  const rows = useMemo(() => {
    const weeks = series[0]?.points.map((p) => p.week) ?? [];
    return weeks.map((week, i) => {
      const row: Record<string, string | number> = { week };
      for (const s of series) row[s.key] = s.points[i]?.value ?? 0;
      return row;
    });
  }, [series]);

  const totals = series.map((s) => ({ ...s, total: s.points.reduce((sum, p) => sum + p.value, 0) }));
  const multi = series.length > 1;

  // An array (not a fragment) so recharts finds the axis/grid/tooltip children.
  const axes = [
    <CartesianGrid key="grid" vertical={false} />,
    <XAxis
      key="x"
      dataKey="week"
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      minTickGap={24}
      tickFormatter={(w: string) => tickFormat.format(weekDate(w))}
    />,
    <YAxis key="y" tickLine={false} axisLine={false} width={32} allowDecimals={false} />,
    <ChartTooltip
      key="tooltip"
      cursor={kind === 'line'}
      content={
        <ChartTooltipContent
          indicator={kind === 'line' ? 'line' : 'dot'}
          labelFormatter={(w) => `Week of ${fullFormat.format(weekDate(String(w)))}`}
        />
      }
    />,
  ];

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        {multi ? (
          // Legend doubles as direct labels: identity is never color alone.
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {totals.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.theme.light }} />
                <span>{s.label}</span>
                <span className="font-medium tabular-nums text-foreground">{s.total.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-2xl font-semibold tabular-nums">
            {totals[0]?.total.toLocaleString() ?? 0}
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">in range</span>
          </p>
        )}
        <ChartContainer config={config} className="aspect-auto h-48 w-full">
          {kind === 'bar' ? (
            <BarChart data={rows} margin={{ left: 0, right: 4, top: 4 }}>
              {axes}
              {series.map((s) => (
                <Bar key={s.key} dataKey={s.key} fill={`var(--color-${s.key})`} radius={[4, 4, 0, 0]} maxBarSize={24} />
              ))}
            </BarChart>
          ) : (
            <LineChart data={rows} margin={{ left: 0, right: 4, top: 4 }}>
              {axes}
              {series.map((s) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  type="linear"
                  stroke={`var(--color-${s.key})`}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          )}
        </ChartContainer>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
}
