export type AnalyticsRange = '30d' | '90d' | '1y' | 'all';

export type OrgFilter = { kind: 'all' } | { kind: 'org'; tenantId: string } | { kind: 'none' };

/** week = 'YYYY-MM-DD' (Monday, Pacific/Honolulu). */
export interface WeeklyPoint {
  week: string;
  value: number;
}

export interface FeatureRow {
  key: string;
  label: string;
  count: number;
  previousCount: number;
  uniqueUsers: number;
  anonVisitors: number;
}

export interface TopSearch {
  query: string;
  count: number;
  avgResults: number;
}

export type SeriesKey =
  | 'signups'
  | 'logins'
  | 'activeUsers'
  | 'billsTracked'
  | 'testimonies'
  | 'contacts'
  | 'follows';

export interface DashboardData {
  range: AnalyticsRange;
  /** First usage_events.created_at, ISO; also the logins history/event cutover. */
  eventsSince: string | null;
  kpis: {
    totalUsers: number;
    activeUsers7d: number;
    activeUsers30d: number;
    billsTracked: number;
    testimonies: number;
  };
  series: Record<SeriesKey, WeeklyPoint[]>;
  /** One row per page_view section + one per other client event. */
  features: FeatureRow[];
  /** Top 20. */
  topSearches: TopSearch[];
  orgs: { id: string; name: string }[];
}
