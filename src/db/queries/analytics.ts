import { sql, type Expression, type ExpressionBuilder, type SqlBool } from 'kysely';
import { db } from '@/db/kysely/client';
import { CLIENT_EVENTS } from '@/lib/analytics/events';
import { fillWeeks, previousRangeStart, rangeStart, seriesStart } from '@/lib/analytics/buckets';
import { FEATURE_KEYS, featureKey, featureLabel } from '@/lib/analytics/features';
import type {
  AnalyticsRange,
  DashboardData,
  FeatureRow,
  OrgFilter,
  TopSearch,
  WeeklyPoint,
} from '@/types/analytics';

// Aggregates behind the sysadmin analytics dashboard. Like every db/queries
// module this does no auth — callers go through requireSysadmin. Everything
// returned is an aggregate; there is deliberately no per-person view.
//
// Org rules (spec §4a), applied by the filter helpers below:
//   - activity  → the org it happened in (row's tenant_id; user_bills falls back
//                 to the user's memberships when tenant_id is NULL; bill_tags via tags.tenant_id)
//   - people    → a user counts under EVERY org they currently belong to
//   - 'none'    → users with no membership, plus activity with a NULL tenant
//   - bill_search has no user/tenant: it counts in event totals and top searches
//                 only, never in unique-user or per-org numbers.

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_SEARCH_LIMIT = 20;

type AnyEB = ExpressionBuilder<any, any>;
type Filter = (eb: AnyEB) => Expression<SqlBool>;

// ---- SQL fragments ----

/**
 * Monday (Pacific/Honolulu) of the row's week, as 'YYYY-MM-DD'. Several columns are
 * naive `timestamp`; `::timestamptz` interprets them in the DB session TZ. This assumes
 * the Node process TZ equals the DB session TZ, since those columns are written both by
 * `new Date()` (Node) and by DB defaults.
 */
function weekOf(col: string) {
  return sql<string>`to_char(date_trunc('week', ${sql.ref(col)}::timestamptz AT TIME ZONE 'Pacific/Honolulu'), 'YYYY-MM-DD')`;
}

/** `col >= from`; no bound when `from` is null. The explicit timestamptz cast keeps the instant exact for naive columns. */
function since(col: string, from: Date | null): Filter {
  return (eb) => (from ? sql<SqlBool>`${sql.ref(col)} >= ${from.toISOString()}::timestamptz` : eb.lit(true));
}

function before(col: string, to: Date): Filter {
  return () => sql<SqlBool>`${sql.ref(col)} < ${to.toISOString()}::timestamptz`;
}

function memberships(eb: AnyEB, userIdCol: string, tenantId?: string) {
  let q = eb
    .selectFrom('members')
    .select(sql.lit(1).as('one'))
    .where('members.user_id', '=', eb.ref(userIdCol));
  if (tenantId) q = q.where('members.tenant_id', '=', tenantId);
  return q;
}

/** People metrics: a user counts under every org they currently belong to; 'none' = no membership at all. */
function peopleFilter(userIdCol: string, org: OrgFilter): Filter {
  return (eb) => {
    switch (org.kind) {
      case 'all':
        return eb.lit(true);
      case 'org':
        return eb.exists(memberships(eb, userIdCol, org.tenantId));
      case 'none':
        return eb.not(eb.exists(memberships(eb, userIdCol)));
    }
  };
}

/** Activity metrics: attributed to the row's own tenant; 'none' = NULL tenant. */
function activityFilter(tenantCol: string, org: OrgFilter): Filter {
  return (eb) => {
    switch (org.kind) {
      case 'all':
        return eb.lit(true);
      case 'org':
        return eb(tenantCol, '=', org.tenantId);
      case 'none':
        return eb(tenantCol, 'is', null);
    }
  };
}

/** user_bills activity: the row's tenant, or — for legacy NULL-tenant rows — every org the tracking user belongs to. */
function userBillsFilter(org: OrgFilter): Filter {
  return (eb) => {
    switch (org.kind) {
      case 'all':
        return eb.lit(true);
      case 'org':
        return eb.or([
          eb('user_bills.tenant_id', '=', org.tenantId),
          eb.and([
            eb('user_bills.tenant_id', 'is', null),
            eb.exists(memberships(eb, 'user_bills.user_id', org.tenantId)),
          ]),
        ]);
      case 'none':
        return eb.and([
          eb('user_bills.tenant_id', 'is', null),
          eb.not(eb.exists(memberships(eb, 'user_bills.user_id'))),
        ]);
    }
  };
}

type WeekRow = { week: string; value: string | number | bigint };

function toPoints(rows: WeekRow[]): WeeklyPoint[] {
  return rows.map((r) => ({ week: r.week, value: Number(r.value) }));
}

// ---- metric groups ----

/** Distinct (user, instant) activity from usage_events ∪ sessions, people-filtered. bill_search rows have no user so drop out here. */
function activeUserRows(org: OrgFilter, from: Date | null) {
  const events = db
    .selectFrom('usage_events')
    .select(['usage_events.user_id as user_id', sql<Date>`usage_events.created_at::timestamptz`.as('at')])
    .where('usage_events.user_id', 'is not', null)
    .where(since('usage_events.created_at', from))
    .where(peopleFilter('usage_events.user_id', org));
  const sessions = db
    .selectFrom('sessions')
    .select(['sessions.user_id as user_id', sql<Date>`sessions.created_at::timestamptz`.as('at')])
    .where('sessions.user_id', 'is not', null)
    .where(since('sessions.created_at', from))
    .where(peopleFilter('sessions.user_id', org));
  return events.unionAll(sessions);
}

async function countActiveUsers(org: OrgFilter, from: Date): Promise<number> {
  const row = await db
    .selectFrom(activeUserRows(org, from).as('a'))
    .select(sql<string>`count(distinct a.user_id)`.as('n'))
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}

async function getKpis(org: OrgFilter, from: Date | null, now: Date): Promise<DashboardData['kpis']> {
  const [users, active7, active30, bills, testimonies] = await Promise.all([
    // People: users counted under every current membership.
    db
      .selectFrom('user')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where(peopleFilter('user.id', org))
      .executeTakeFirst(),
    countActiveUsers(org, new Date(now.getTime() - 7 * DAY_MS)),
    countActiveUsers(org, new Date(now.getTime() - 30 * DAY_MS)),
    // Activity: distinct bills currently tracked, NULL-tenant rows via membership.
    db
      .selectFrom('user_bills')
      .select(sql<string>`count(distinct user_bills.bill_id)`.as('n'))
      .where(userBillsFilter(org))
      .executeTakeFirst(),
    // Activity: testimonies created in the selected range, by testimony tenant.
    db
      .selectFrom('testimonies')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where(since('testimonies.created_at', from))
      .where(activityFilter('testimonies.tenant_id', org))
      .executeTakeFirst(),
  ]);
  return {
    totalUsers: Number(users?.n ?? 0),
    activeUsers7d: active7,
    activeUsers30d: active30,
    billsTracked: Number(bills?.n ?? 0),
    testimonies: Number(testimonies?.n ?? 0),
  };
}

async function weeklySignups(org: OrgFilter, from: Date | null): Promise<WeeklyPoint[]> {
  const week = weekOf('user.created_at');
  const rows = await db
    .selectFrom('user')
    .select([week.as('week'), (eb) => eb.fn.countAll<string>().as('value')])
    .where('user.created_at', 'is not', null)
    .where(since('user.created_at', from))
    .where(peopleFilter('user.id', org)) // people rule
    .groupBy(week)
    .execute();
  return toPoints(rows);
}

/** Logins: session rows before the event cutover (approximate history), `login` events after it. */
async function weeklyLogins(org: OrgFilter, from: Date | null, eventsSince: Date | null): Promise<WeeklyPoint[]> {
  let sessions = db
    .selectFrom('sessions')
    .select(sql<Date>`sessions.created_at::timestamptz`.as('at'))
    .where('sessions.created_at', 'is not', null)
    .where(since('sessions.created_at', from))
    .where(peopleFilter('sessions.user_id', org)); // people rule
  if (eventsSince) sessions = sessions.where(before('sessions.created_at', eventsSince));

  const logins = db
    .selectFrom('usage_events')
    .select(sql<Date>`usage_events.created_at::timestamptz`.as('at'))
    .where('usage_events.event', '=', 'login')
    .where(since('usage_events.created_at', from))
    .where(peopleFilter('usage_events.user_id', org)); // people rule

  const week = weekOf('l.at');
  const rows = await db
    .selectFrom(sessions.unionAll(logins).as('l'))
    .select([week.as('week'), sql<string>`count(*)`.as('value')])
    .groupBy(week)
    .execute();
  return toPoints(rows);
}

async function weeklyActiveUsers(org: OrgFilter, from: Date | null): Promise<WeeklyPoint[]> {
  const week = weekOf('a.at');
  const rows = await db
    .selectFrom(activeUserRows(org, from).as('a')) // people rule applied inside
    .select([week.as('week'), sql<string>`count(distinct a.user_id)`.as('value')])
    .groupBy(week)
    .execute();
  return toPoints(rows);
}

async function weeklyBillsTracked(org: OrgFilter, from: Date | null): Promise<WeeklyPoint[]> {
  const week = weekOf('user_bills.adopted_at');
  const rows = await db
    .selectFrom('user_bills')
    .select([week.as('week'), (eb) => eb.fn.countAll<string>().as('value')])
    .where('user_bills.adopted_at', 'is not', null)
    .where(since('user_bills.adopted_at', from))
    .where(userBillsFilter(org)) // activity rule with membership fallback
    .groupBy(week)
    .execute();
  return toPoints(rows);
}

async function weeklyTestimonies(org: OrgFilter, from: Date | null): Promise<WeeklyPoint[]> {
  const week = weekOf('testimonies.created_at');
  const rows = await db
    .selectFrom('testimonies')
    .select([week.as('week'), (eb) => eb.fn.countAll<string>().as('value')])
    .where(since('testimonies.created_at', from))
    .where(activityFilter('testimonies.tenant_id', org)) // activity rule
    .groupBy(week)
    .execute();
  return toPoints(rows);
}

async function weeklyContacts(org: OrgFilter, from: Date | null): Promise<WeeklyPoint[]> {
  const week = weekOf('legislator_contacts.contacted_at');
  const rows = await db
    .selectFrom('legislator_contacts')
    .select([week.as('week'), (eb) => eb.fn.countAll<string>().as('value')])
    .where(since('legislator_contacts.contacted_at', from))
    .where(activityFilter('legislator_contacts.tenant_id', org)) // activity rule
    .groupBy(week)
    .execute();
  return toPoints(rows);
}

async function weeklyTagsApplied(org: OrgFilter, from: Date | null): Promise<WeeklyPoint[]> {
  const week = weekOf('bill_tags.created_at');
  const rows = await db
    .selectFrom('bill_tags')
    .innerJoin('tags', 'tags.id', 'bill_tags.tag_id')
    .select([week.as('week'), (eb) => eb.fn.countAll<string>().as('value')])
    .where(since('bill_tags.created_at', from))
    // Activity rule: bill_tags has no tenant column, so the tag's org is used.
    // tags.tenant_id is NOT NULL, so 'none' is always empty here.
    .where(activityFilter('tags.tenant_id', org))
    .groupBy(week)
    .execute();
  return toPoints(rows);
}

async function weeklyFollows(org: OrgFilter, from: Date | null): Promise<WeeklyPoint[]> {
  const week = weekOf('org_follows.created_at');
  const rows = await db
    .selectFrom('org_follows')
    .select([week.as('week'), (eb) => eb.fn.countAll<string>().as('value')])
    .where(since('org_follows.created_at', from))
    // Activity rule: attributed to the followed org. tenant_id is NOT NULL,
    // so 'none' is always empty here.
    .where(activityFilter('org_follows.tenant_id', org))
    .groupBy(week)
    .execute();
  return toPoints(rows);
}

/** Feature usage in range vs. the previous equal-length window. */
async function getFeatures(org: OrgFilter, from: Date | null, prevFrom: Date | null): Promise<FeatureRow[]> {
  const inRange = from ? sql`usage_events.created_at >= ${from.toISOString()}::timestamptz` : sql`true`;
  const inPrev =
    from && prevFrom
      ? sql`usage_events.created_at >= ${prevFrom.toISOString()}::timestamptz and usage_events.created_at < ${from.toISOString()}::timestamptz`
      : sql`false`;

  // Only page views split by section, so every feature key is exactly one group.
  const pageSection = sql<string | null>`case when usage_events.event = 'page_view' then usage_events.props->>'section' end`;

  let q = db
    .selectFrom('usage_events')
    .select([
      'usage_events.event as event',
      pageSection.as('section'),
      sql<string>`count(*) filter (where ${inRange})`.as('count'),
      sql<string>`count(*) filter (where ${inPrev})`.as('previous_count'),
      sql<string>`count(distinct usage_events.user_id) filter (where ${inRange})`.as('unique_users'),
      sql<string>`count(distinct usage_events.anon_id) filter (where ${inRange})`.as('anon_visitors'),
    ])
    .where('usage_events.event', 'in', [...CLIENT_EVENTS])
    .where(since('usage_events.created_at', prevFrom ?? from))
    .where(activityFilter('usage_events.tenant_id', org)) // activity rule (event's own tenant)
    .groupBy(['usage_events.event', pageSection]);
  // bill_search carries no tenant, so it never counts in per-org numbers.
  if (org.kind !== 'all') q = q.where('usage_events.event', '<>', 'bill_search');
  const rows = await q.execute();

  const byKey = new Map<string, FeatureRow>();
  for (const key of FEATURE_KEYS) {
    if (org.kind !== 'all' && key === 'bill_search') continue;
    byKey.set(key, { key, label: featureLabel(key), count: 0, previousCount: 0, uniqueUsers: 0, anonVisitors: 0 });
  }
  for (const r of rows) {
    const key = featureKey(r.event, r.section);
    byKey.set(key, {
      key,
      label: featureLabel(key),
      count: Number(r.count),
      previousCount: Number(r.previous_count),
      uniqueUsers: Number(r.unique_users),
      anonVisitors: Number(r.anon_visitors),
    });
  }
  return [...byKey.values()];
}

/** Most frequent searches in range (lowercased). Only for 'all': searches carry no org. */
async function getTopSearches(org: OrgFilter, from: Date | null): Promise<TopSearch[]> {
  if (org.kind !== 'all') return [];
  const query = sql<string>`lower(trim(usage_events.props->>'query'))`;
  const rows = await db
    .selectFrom('usage_events')
    .select([
      query.as('query'),
      sql<string>`count(*)`.as('count'),
      sql<string | null>`avg(case when jsonb_typeof(usage_events.props->'resultCount') = 'number' then (usage_events.props->>'resultCount')::numeric end)`.as(
        'avg_results',
      ),
    ])
    .where('usage_events.event', '=', 'bill_search')
    .where(since('usage_events.created_at', from))
    .where(sql<SqlBool>`coalesce(trim(usage_events.props->>'query'), '') <> ''`)
    .groupBy(query)
    .orderBy(sql`count(*)`, 'desc')
    .orderBy(query)
    .limit(TOP_SEARCH_LIMIT)
    .execute();
  return rows.map((r) => ({
    query: r.query,
    count: Number(r.count),
    avgResults: r.avg_results === null ? 0 : Math.round(Number(r.avg_results) * 10) / 10,
  }));
}

// ---- entry point ----

export async function getAnalyticsDashboard(params: {
  range: AnalyticsRange;
  org: OrgFilter;
}): Promise<DashboardData> {
  const { range, org } = params;
  const now = new Date();
  const from = rangeStart(range, now);
  const sFrom = seriesStart(range, now); // week-aligned lower bound for weekly series
  const prevFrom = previousRangeStart(range, now);

  const [firstEvent, firstUser, orgs] = await Promise.all([
    db
      .selectFrom('usage_events')
      .select(sql<Date | null>`min(usage_events.created_at)`.as('at'))
      .executeTakeFirst(),
    db
      .selectFrom('user')
      .select(sql<Date | null>`min(${sql.ref('user.created_at')}::timestamptz)`.as('at'))
      .executeTakeFirst(),
    db.selectFrom('tenants').select(['tenants.id', 'tenants.name']).orderBy('tenants.name').execute(),
  ]);
  const eventsSince = firstEvent?.at ? new Date(firstEvent.at) : null;
  // 'all' starts the charts at the first signup.
  const seriesFrom = sFrom ?? (firstUser?.at ? new Date(firstUser.at) : now);

  const [kpis, signups, logins, activeUsers, billsTracked, testimonies, contacts, tagsApplied, follows, features, topSearches] =
    await Promise.all([
      getKpis(org, from, now),
      weeklySignups(org, sFrom),
      weeklyLogins(org, sFrom, eventsSince),
      weeklyActiveUsers(org, sFrom),
      weeklyBillsTracked(org, sFrom),
      weeklyTestimonies(org, sFrom),
      weeklyContacts(org, sFrom),
      weeklyTagsApplied(org, sFrom),
      weeklyFollows(org, sFrom),
      getFeatures(org, from, prevFrom),
      getTopSearches(org, from),
    ]);

  const fill = (rows: WeeklyPoint[]) => fillWeeks(rows, seriesFrom, now);
  return {
    range,
    eventsSince: eventsSince ? eventsSince.toISOString() : null,
    kpis,
    series: {
      signups: fill(signups),
      logins: fill(logins),
      activeUsers: fill(activeUsers),
      billsTracked: fill(billsTracked),
      testimonies: fill(testimonies),
      contacts: fill(contacts),
      tagsApplied: fill(tagsApplied),
      follows: fill(follows),
    },
    features,
    topSearches,
    orgs: orgs.map((o) => ({ id: o.id, name: o.name })),
  };
}
