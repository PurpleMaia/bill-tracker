'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertCircle, FileText, ListChecks, Loader2, UserCheck, Users, type LucideIcon } from 'lucide-react';
import { data } from '@/lib/data-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { WeeklyChart, type WeeklySeries } from './weekly-chart';
import { TopSearches } from './top-searches';
import { FeatureUsageTable } from './feature-usage-table';
import type { AnalyticsRange, DashboardData, OrgFilter } from '@/types/analytics';

const RANGE_OPTIONS: { value: AnalyticsRange; label: string }[] = [
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '1y', label: '1 year' },
  { value: 'all', label: 'All time' },
];

/** Single-series charts wear the brand primary (a theme token). */
const PRIMARY = { light: 'hsl(var(--primary))', dark: 'hsl(var(--primary))' };

/**
 * "Work done" categorical slots 1–4 (blue, orange, aqua, yellow), fixed order,
 * validated for CVD/normal-vision separation in both modes (dataviz palette).
 * Light yellow/aqua sit under 3:1 on white, so the legend carries totals as
 * direct labels.
 */
const WORK_SERIES = [
  { key: 'testimonies', label: 'Testimonies', theme: { light: '#2a78d6', dark: '#3987e5' } },
  { key: 'contacts', label: 'Contacts logged', theme: { light: '#eb6834', dark: '#d95926' } },
  { key: 'tagsApplied', label: 'Tags applied', theme: { light: '#1baf7a', dark: '#199e70' } },
  { key: 'follows', label: 'Follows', theme: { light: '#eda100', dark: '#c98500' } },
] as const;

/** Week keys are 'YYYY-MM-DD' calendar dates; format them in UTC so they don't shift a day. */
const weekFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'Pacific/Honolulu',
});

/** Select value ↔ OrgFilter: 'all' | 'none' | tenant id. */
function toOrgFilter(value: string): OrgFilter {
  if (value === 'all' || value === 'none') return { kind: value };
  return { kind: 'org', tenantId: value };
}

export function AnalyticsDashboard() {
  const [range, setRange] = useState<AnalyticsRange>('90d');
  const [orgValue, setOrgValue] = useState('all');

  const query = useQuery({
    queryKey: ['analytics', 'dashboard', range, orgValue],
    queryFn: () => data.analytics.getDashboard({ range, org: toOrgFilter(orgValue) }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const dashboard = query.data;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">How people use the Bill Tracker. Aggregates only.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {query.isFetching && dashboard && (
            <Loader2 aria-label="Updating" className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <Select value={range} onValueChange={(v) => setRange(v as AnalyticsRange)}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Date range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={orgValue} onValueChange={setOrgValue}>
            <SelectTrigger className="w-full sm:w-56" aria-label="Organization">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All organizations</SelectItem>
              <SelectItem value="none">No organization</SelectItem>
              {!!dashboard?.orgs.length && <SelectSeparator />}
              {dashboard?.orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {query.isError && !dashboard ? (
        <ErrorState message={(query.error as Error)?.message} onRetry={() => query.refetch()} />
      ) : !dashboard ? (
        <DashboardSkeleton />
      ) : (
        <>
          {query.isError && (
            <ErrorState message={(query.error as Error)?.message} onRetry={() => query.refetch()} />
          )}
          <DashboardBody dashboard={dashboard} orgScoped={orgValue !== 'all'} />
        </>
      )}
    </div>
  );
}

function DashboardBody({ dashboard, orgScoped }: { dashboard: DashboardData; orgScoped: boolean }) {
  const { kpis, series, eventsSince } = dashboard;
  const since = eventsSince ? dateFormat.format(new Date(eventsSince)) : null;
  const collectingNote = since ? `Collecting since ${since}` : 'Not collecting yet';
  // Weekly charts count whole weeks, so the first bar can start up to six days
  // before the selected range (a clipped first week would read as a false dip).
  const firstWeek = series.signups[0]?.week;

  const single = (key: keyof DashboardData['series'], label: string): WeeklySeries[] => [
    { key, label, points: series[key], theme: PRIMARY },
  ];
  const work = useMemo<WeeklySeries[]>(
    () => WORK_SERIES.map((s) => ({ ...s, points: series[s.key] })),
    [series],
  );

  return (
    <div className="space-y-6">
      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Kpi icon={Users} label="Total users" value={kpis.totalUsers} />
        <Kpi icon={UserCheck} label="Active users, 7 days" value={kpis.activeUsers7d} />
        <Kpi icon={UserCheck} label="Active users, 30 days" value={kpis.activeUsers30d} />
        <Kpi icon={ListChecks} label="Bills currently tracked" value={kpis.billsTracked} />
        <Kpi icon={FileText} label="Testimonies in range" value={kpis.testimonies} />
      </section>

      {firstWeek && (
        <p className="text-xs text-muted-foreground">
          Weekly charts count whole weeks (Monday to Sunday, Hawaii time), starting the week of{' '}
          {weekFormat.format(new Date(firstWeek))}, so their totals can include a few days before the selected range.
        </p>
      )}
      <section aria-label="Weekly trends" className="grid gap-4 lg:grid-cols-2">
        <WeeklyChart title="Signups" description="New accounts per week" kind="bar" series={single('signups', 'Signups')} />
        <WeeklyChart
          title="Logins"
          description="Logins per week"
          kind="bar"
          series={single('logins', 'Logins')}
          note={since ? `Logins before ${since} are approximate.` : 'Login history is approximate until event collection starts.'}
        />
        <WeeklyChart
          title="Active users"
          description="People who used the app or signed in that week"
          kind="bar"
          series={single('activeUsers', 'Active users')}
        />
        <WeeklyChart
          title="Bills tracked"
          description="Bills added to trackers per week"
          kind="bar"
          series={single('billsTracked', 'Bills tracked')}
        />
        <div className="lg:col-span-2">
          <WeeklyChart title="Work done" description="Per week, by kind of work" kind="line" series={work} />
        </div>
      </section>

      <section aria-label="Searches and features" className="grid gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-2">
          <TopSearches searches={dashboard.topSearches} orgScoped={orgScoped} collectingNote={collectingNote} />
        </div>
        <div className="min-w-0 lg:col-span-3">
          <FeatureUsageTable
            features={dashboard.features}
            hasPrevious={dashboard.range !== 'all'}
            collectingNote={collectingNote}
          />
        </div>
      </section>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center">
      <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Couldn&apos;t load analytics</p>
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading analytics">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-72 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-80 rounded-lg lg:col-span-2" />
        <Skeleton className="h-80 rounded-lg lg:col-span-3" />
      </div>
    </div>
  );
}
