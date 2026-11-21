# User Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect first-party usage events in Postgres and show a sysadmin-only analytics dashboard (backfilled + event-based metrics) reached from the avatar menu.

**Architecture:** A `usage_events` table is fed by (a) server-side `logEvent()` calls at login/signup/status-change and (b) client `data.analytics.track()` calls validated by pure functions in `src/lib/analytics/`. One query module, `src/db/queries/analytics.ts`, builds the whole dashboard payload, served through the usual action+route pair behind a new `requireSysadmin` guard, and rendered at `/analytics`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Kysely/Postgres, zod, recharts via `src/components/ui/chart.tsx`, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-user-analytics-design.md`

## Global Constraints

- Follow `CLAUDE.md`: queries only in `src/db/queries/*`; `src/lib/` DB-free, no barrel files, deep imports; client data via `data.*`; auth via guards; `'use server'` files export only async functions; tests pure, flat in `src/lib/__tests__/`.
- Dashboard is aggregates only — **no per-person activity view anywhere**.
- No IP addresses or user agents stored. No third-party services.
- Tracking never throws to the caller, never shows a toast, never blocks navigation.
- `bill_search` is stored with `user_id`, `anon_id` and `tenant_id` all NULL.
- Team/sysadmin usage is **included** — no exclusions.
- Analytics is reachable **only** from the avatar menu, item shown only when `user.systemRole === 'sysadmin'`; `/analytics` returns `notFound()` for everyone else; `/analytics` is never page-view tracked.
- Weekly buckets are weeks in `Pacific/Honolulu`, starting Monday.
- Props cap: 2048 bytes (JSON). Search query cap: 100 chars. Rate limit: 120 events / 60 s per user id or anon id.
- Every commit: `pnpm typecheck && pnpm test` pass. Final task also `pnpm build`. Commit messages use `feat:`/`fix:`/`refactor:`/`docs:`, no `Co-Authored-By` line (CLAUDE.md overrides).

## Review Focus

1. Signed-out visitor whose browser blocks `localStorage` → tracking still works with a per-page-load id, no exception. *(Task 3, `getAnonId` test)*
2. Client posts a `tenantId` for an org the user is not in, or posts one while signed out → stored `tenant_id` is NULL. *(Task 2, `resolveTenant` tests)*
3. Client posts a server-only event (`login`), an unknown event, or oversized props → rejected, nothing stored. *(Task 2, `validateClientEvent` tests)*
4. Signed-in user searches → the stored row carries no user/tenant/anon identity. *(Task 2, `toStoredEvent` test)*
5. Fresh deploy with zero events / weeks with no activity → charts show zero-filled weeks and "Not collecting yet", no crash. *(Task 6, `fillWeeks` test; Task 7 empty state)*

---

### Task 1: `usage_events` table and server-side logger

**Files:**
- Create: `src/db/migrations/000038_usage_events.up.sql`, `src/db/migrations/000038_usage_events.down.sql`
- Modify: `src/db/types.ts` (regenerated)
- Create: `src/db/queries/usage-events.ts`

**Interfaces:**
- Produces:
  - `type NewUsageEvent = { event: string; userId: string | null; tenantId: string | null; anonId: string | null; path: string | null; props: Record<string, unknown> }`
  - `insertUsageEvent(row: NewUsageEvent): Promise<void>` — throws on DB error.
  - `logEvent(event: 'login' | 'signup' | 'status_change', userId: string | null, opts?: { tenantId?: string | null; props?: Record<string, unknown> }): Promise<void>` — **never throws** (catches, `console.error('[usage-events] ...')`).

- [ ] **Step 1: Write the up migration** — table exactly as spec §1 (`id uuid pk default gen_random_uuid()`, `event text not null`, `user_id uuid references "user"(id) on delete set null`, `tenant_id uuid references tenants(id) on delete set null`, `anon_id text`, `path text`, `props jsonb not null default '{}'`, `created_at timestamptz not null default now()`), with a header comment in the 000037 style, `IF NOT EXISTS`, and indexes `idx_usage_events_event_created (event, created_at)`, `idx_usage_events_created (created_at)`, `idx_usage_events_tenant_created (tenant_id, created_at)`. Down: `DROP TABLE IF EXISTS usage_events;`
- [ ] **Step 2: Apply and regenerate** — Run `pnpm migrate:up && pnpm codegen`. Expected: `src/db/types.ts` gains `UsageEvents` and `usage_events: UsageEvents` in `DB`; `pnpm migrate:down && pnpm migrate:up` round-trips cleanly.
- [ ] **Step 3: Implement `src/db/queries/usage-events.ts`** with the two functions above (NOT `'use server'`).
- [ ] **Step 4: Verify** — `pnpm typecheck` passes.
- [ ] **Step 5: Commit** — `feat: add usage_events table and server-side event logger`

---

### Task 2: Event allowlist and validation (pure)

**Files:**
- Create: `src/lib/analytics/events.ts`
- Test: `src/lib/__tests__/analytics-events.test.ts`

**Interfaces:**
- Produces (all from `@/lib/analytics/events`):
  - `CLIENT_EVENTS = ['page_view','bill_opened','bill_search','testimony_exported','csv_exported','tracker_view_changed','tour_finished'] as const`; `type ClientEventName`
  - `SERVER_EVENTS = ['login','signup','status_change'] as const`; `type ServerEventName`
  - `MAX_PROPS_BYTES = 2048`, `MAX_QUERY_CHARS = 100`
  - `type TrackInput = { event: ClientEventName; props?: Record<string, unknown>; tenantId?: string | null; anonId?: string | null; path?: string | null }`
  - `validateClientEvent(input: unknown): TrackInput | null` — zod; `event` in `CLIENT_EVENTS`; `props` a plain object whose `JSON.stringify` length ≤ `MAX_PROPS_BYTES`; `anonId` ≤ 64 chars; `path` ≤ 200 chars; for `bill_search`, `props.query` is trimmed and sliced to `MAX_QUERY_CHARS`.
  - `resolveTenant(requested: string | null | undefined, memberTenantIds: string[] | null): string | null` — `memberTenantIds === null` means signed out.
  - `toStoredEvent(input: TrackInput, ctx: { userId: string | null; memberTenantIds: string[] | null }): NewUsageEvent | null` — `null` when signed out and no `anonId`; `anonId` dropped when signed in; `bill_search` gets all three identity fields NULL. (Import the `NewUsageEvent` *type* from `@/db/queries/usage-events` with `import type` — type-only, keeps lib DB-free at runtime.)

- [ ] **Step 1: Write the failing tests**

```ts
describe('validateClientEvent', () => {
  it('accepts an allowlisted event', () => {
    expect(validateClientEvent({ event: 'page_view', props: { section: 'tracker' } })?.event).toBe('page_view');
  });
  it('rejects server-only events', () => {
    expect(validateClientEvent({ event: 'login' })).toBeNull();
    expect(validateClientEvent({ event: 'status_change' })).toBeNull();
  });
  it('rejects unknown events and non-objects', () => {
    expect(validateClientEvent({ event: 'hack' })).toBeNull();
    expect(validateClientEvent('page_view')).toBeNull();
    expect(validateClientEvent(null)).toBeNull();
  });
  it('rejects props over 2048 bytes', () => {
    expect(validateClientEvent({ event: 'csv_exported', props: { x: 'a'.repeat(2100) } })).toBeNull();
  });
  it('trims and caps bill_search query at 100 chars', () => {
    const v = validateClientEvent({ event: 'bill_search', props: { query: '  ' + 'b'.repeat(150), resultCount: 3 } });
    expect(v?.props?.query).toBe('b'.repeat(100));
  });
});

describe('resolveTenant', () => {
  it('keeps a tenant the user belongs to', () => expect(resolveTenant('t1', ['t1', 't2'])).toBe('t1'));
  it('drops a tenant the user does not belong to', () => expect(resolveTenant('t9', ['t1'])).toBeNull());
  it('drops any tenant when signed out', () => expect(resolveTenant('t1', null)).toBeNull());
  it('returns null when none requested', () => expect(resolveTenant(undefined, ['t1'])).toBeNull());
});

describe('toStoredEvent', () => {
  it('requires anonId when signed out', () => {
    expect(toStoredEvent({ event: 'page_view' }, { userId: null, memberTenantIds: null })).toBeNull();
  });
  it('drops anonId when signed in', () => {
    const row = toStoredEvent({ event: 'page_view', anonId: 'a1' }, { userId: 'u1', memberTenantIds: [] });
    expect(row).toMatchObject({ userId: 'u1', anonId: null });
  });
  it('strips all identity from bill_search', () => {
    const row = toStoredEvent(
      { event: 'bill_search', tenantId: 't1', anonId: 'a1', props: { query: 'poi' } },
      { userId: 'u1', memberTenantIds: ['t1'] },
    );
    expect(row).toMatchObject({ userId: null, tenantId: null, anonId: null, props: { query: 'poi' } });
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run src/lib/__tests__/analytics-events.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement `src/lib/analytics/events.ts`** per the Interfaces block.
- [ ] **Step 4: Run to verify it passes** — same command → PASS.
- [ ] **Step 5: Commit** — `feat: add analytics event allowlist and validation`

---

### Task 3: Client event ingestion (route, action, data-client, hook)

**Files:**
- Modify: `src/db/queries/usage-events.ts` (add `recordClientEvent`)
- Create: `src/app/actions/analytics.ts`, `src/app/api/events/route.ts`
- Create: `src/lib/data-client/analytics.client.ts`; Modify: `src/lib/data-client/index.ts`, `src/lib/data-client/transport.ts`
- Create: `src/lib/analytics/anon-id.ts`, `src/hooks/use-track.ts`
- Test: `src/lib/__tests__/analytics-anon-id.test.ts`

**Interfaces:**
- Consumes: `validateClientEvent`, `toStoredEvent`, `TrackInput` (Task 2); `insertUsageEvent` (Task 1); `optionalSession`; `getUserMemberships`; `limitFixedWindow`.
- Produces:
  - `recordClientEvent(userId: string | null, input: unknown): Promise<void>` in `usage-events.ts` — validate → (signed in: `getUserMemberships(userId).map(m => m.tenantId)`) → `toStoredEvent` → `insertUsageEvent`; silently returns on invalid input.
  - `trackEventAction(input: TrackInput): Promise<void>` (`'use server'`) — `optionalSession.fromAction()`, rate-limit key `events:${user?.id ?? input.anonId}` with `limitFixedWindow(key, 120, 60_000)`, then `recordClientEvent`; catches everything.
  - `POST /api/events` — same flow via `optionalSession.fromRequest`; always responds `204` (also on invalid/limited input) so beacons never retry.
  - `data.analytics.track(input: TrackInput): Promise<void>` — fetch arm: `navigator.sendBeacon('/api/events', new Blob([JSON.stringify(input)], { type: 'application/json' }))`, falling back to `fetch(..., { method: 'POST', keepalive: true })` when `sendBeacon` is missing or returns false; both arms swallow all errors.
  - `OVERRIDES['analytics.track'] = 'fetch'` in `transport.ts` with a one-line comment (beacon survives unload).
  - `getAnonId(storage?: Pick<Storage, 'getItem' | 'setItem'>): string` in `src/lib/analytics/anon-id.ts` — key `'foodplus_anon_id'`, value `crypto.randomUUID()`; any storage throw → falls back to a module-level id generated once per page load.
  - `useTrack(): (event: ClientEventName, props?: Record<string, unknown>) => void` in `src/hooks/use-track.ts` — reads `user`, `activeTenant` from `useAuth()`; sends `tenantId: activeTenant?.tenantId ?? null`, `anonId: user ? null : getAnonId()`, `path: window.location.pathname`; fire-and-forget (`void data.analytics.track(...).catch(() => {})`).

- [ ] **Step 1: Write the failing test**

```ts
describe('getAnonId', () => {
  it('persists and reuses an id', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const a = getAnonId(storage);
    expect(a).toMatch(/[0-9a-f-]{36}/);
    expect(getAnonId(storage)).toBe(a);
  });
  it('falls back to a stable per-load id when storage throws', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const a = getAnonId(broken);
    expect(typeof a).toBe('string');
    expect(getAnonId(broken)).toBe(a);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run src/lib/__tests__/analytics-anon-id.test.ts` → FAIL.
- [ ] **Step 3: Implement `getAnonId`**, then the rest of the Interfaces block.
- [ ] **Step 4: Verify** — test PASS; `pnpm typecheck` passes; with `pnpm dev`, `curl -i -X POST localhost:9002/api/events -H 'content-type: application/json' -d '{"event":"page_view","anonId":"x","props":{"section":"guide"}}'` → `204`, and a row exists in `usage_events` with `anon_id='x'`. Posting `{"event":"login","anonId":"x"}` → `204`, no row.
- [ ] **Step 5: Commit** — `feat: client usage-event ingestion via data.analytics.track`

---

### Task 4: Server-side events (login, signup, status change)

**Files:**
- Modify: `src/app/api/auth/login/route.ts` (after `createSession`, ~line 76), `src/app/api/auth/[provider]/callback/route.ts` (~line 144), `src/app/api/auth/register/route.ts` (~line 109)
- Modify: `src/db/queries/bills-write.ts` (`updateBillStatus`, line 26)
- Modify callers: `src/app/actions/bills.ts:81`, `src/app/api/bills/[id]/route.ts:103`, `src/app/actions/proposals.ts:101`, `src/app/api/proposals/route.ts:130`

**Interfaces:**
- Consumes: `logEvent` (Task 1).
- Produces: `updateBillStatus(billId: string, newStatus: string, tenantId?: string, actorUserId?: string): Promise<Bill>`.

- [ ] **Step 1: Login/signup** — `await logEvent('login', user.id)` in the password-login route; in the OAuth callback `await logEvent(isNewUser ? 'signup' : 'login', user.id, { props: { provider: providerId } })`; in register `await logEvent('signup', user.id)`. Not in reset-password.
- [ ] **Step 2: Status change** — in `updateBillStatus`, read the prior status (`org_bills.bill_status` for the tenant branch, `bills.bill_status` otherwise) before writing, and after a successful write `await logEvent('status_change', actorUserId ?? null, { tenantId: tenantId ?? null, props: { billId, from: prior ?? null, to: newStatus } })`. Pass `user.id` as `actorUserId` from all four callers (for proposal acceptance, the accepting user).
- [ ] **Step 3: Verify** — `pnpm typecheck && pnpm test` pass; in dev, log in, sign up a new account, and drag a bill on an org board → three rows (`login`, `signup`, `status_change` with correct `from`/`to`).
- [ ] **Step 4: Commit** — `feat: log login, signup and status-change usage events`

---

### Task 5: Page views and feature instrumentation

**Files:**
- Create: `src/lib/analytics/paths.ts`; Test: `src/lib/__tests__/analytics-paths.test.ts`
- Create: `src/components/analytics/page-view-tracker.tsx`; Modify: `src/app/layout.tsx` (mount inside `<Providers>`, wrapped in `<Suspense fallback={null}>`)
- Modify: `src/components/kanban/bill-details-dialog.tsx` (open effect ~line 147), `src/components/search/bill-search-view.tsx`, `src/components/testimony/testimony-export-step.tsx` (`handleDownload`, line 42), `src/components/kanban/export-csv-dialog.tsx` (`handleExport`, line 97), `src/components/main/view-toggle.tsx` (line 35), `src/components/tour/welcome-tour.tsx` (`close`, line 85)

**Interfaces:**
- Consumes: `useTrack` (Task 3).
- Produces:
  - `type Section = 'tracker' | 'find-bills' | 'take-action' | 'community' | 'guide' | 'learn' | 'bill'`
  - `normalizePath(pathname: string): string` — strips query/hash and trailing slash; `/bills/<x>/...` → `/bills/[id]/...`; `/community/<slug>` (not `following`/`your-organization`) → `/community/[slug]`.
  - `sectionForPath(pathname: string): Section | null` — `/` and `/tracker*` → `tracker`; `/bills/*` → `bill`; first segment for the others; anything else (incl. `/analytics`, `/login`, `/register`) → `null`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('normalizePath', () => {
  it('replaces bill ids', () => expect(normalizePath('/bills/3f2a-uuid/testimony')).toBe('/bills/[id]/testimony'));
  it('replaces community slugs but not fixed subpages', () => {
    expect(normalizePath('/community/hawaii-foodbank')).toBe('/community/[slug]');
    expect(normalizePath('/community/following')).toBe('/community/following');
  });
  it('strips query, hash and trailing slash', () => expect(normalizePath('/find-bills/?q=poi#x')).toBe('/find-bills'));
});
describe('sectionForPath', () => {
  it('maps main sections', () => {
    expect(sectionForPath('/tracker')).toBe('tracker');
    expect(sectionForPath('/take-action/testimony')).toBe('take-action');
    expect(sectionForPath('/bills/abc/contact')).toBe('bill');
  });
  it('never tracks the analytics page or auth pages', () => {
    expect(sectionForPath('/analytics')).toBeNull();
    expect(sectionForPath('/login')).toBeNull();
  });
});
```
(Confirm what `/` renders by reading `src/app/(main)/page.tsx` and adjust the `/` mapping + test if it is not the tracker.)

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run src/lib/__tests__/analytics-paths.test.ts` → FAIL.
- [ ] **Step 3: Implement `paths.ts`** → test PASS.
- [ ] **Step 4: `PageViewTracker`** — `usePathname()`; on change, if `sectionForPath` is non-null, `track('page_view', { section })` with `path` overridden to `normalizePath(pathname)` (extend `useTrack` to accept an optional `{ path }` override if needed). Fire once per distinct pathname (guard with a ref against StrictMode double effects).
- [ ] **Step 5: Feature events** (one `track()` call each):
  - `bill_opened` `{ billId, section: sectionForPath(pathname) }` when the dialog opens on a bill (inside the existing `isOpen && billID` effect).
  - `bill_search` `{ query: debouncedQuery, resultCount: totalCount }` once per distinct non-empty `debouncedQuery` after its results load (`!isLoading`). Find Bills only — the tracker's board filter is not a search.
  - `testimony_exported` `{ format }` after a successful download.
  - `csv_exported` `{ rowCount }` after a successful export.
  - `tracker_view_changed` `{ view }` in the `onValueChange` handler.
  - `tour_finished` `{ completed }` — change `close` to `close(completed: boolean)`: last-step button → `true`; Skip button and Escape → `false`.
- [ ] **Step 6: Verify** — `pnpm typecheck && pnpm test` pass; in dev, click through each section and each action and confirm one row per action in `usage_events` (no duplicate `page_view` per navigation; `/analytics` visit adds none).
- [ ] **Step 7: Commit** — `feat: track page views and key feature usage`

---

### Task 6: Dashboard data (guard, helpers, query, transports)

**Files:**
- Modify: `src/lib/auth/permissions.ts` (add `isSysadmin`); Modify: `src/lib/__tests__/permissions.test.ts`
- Modify: `src/lib/auth/auth-guards.ts` (add `requireSysadmin`, update the header comment's mode list)
- Create: `src/lib/analytics/buckets.ts`; Test: `src/lib/__tests__/analytics-buckets.test.ts`
- Create: `src/types/analytics.ts`, `src/db/queries/analytics.ts`
- Modify: `src/app/actions/analytics.ts`; Create: `src/app/api/analytics/route.ts`; Modify: `src/lib/data-client/analytics.client.ts`

**Interfaces:**
- Produces:
  - `isSysadmin(user: { systemRole?: string } | null | undefined): boolean`
  - `requireSysadmin = { fromRequest(request: NextRequest): Promise<AuthContext>; fromAction(): Promise<AuthContext> }` — throws `Errors.FORBIDDEN` when signed in but not sysadmin.
  - `src/types/analytics.ts`:
    ```ts
    export type AnalyticsRange = '30d' | '90d' | '1y' | 'all';
    export type OrgFilter = { kind: 'all' } | { kind: 'org'; tenantId: string } | { kind: 'none' };
    export interface WeeklyPoint { week: string; value: number } // week = 'YYYY-MM-DD' (Monday, Pacific/Honolulu)
    export interface FeatureRow { key: string; label: string; count: number; previousCount: number; uniqueUsers: number; anonVisitors: number }
    export interface TopSearch { query: string; count: number; avgResults: number }
    export interface DashboardData {
      range: AnalyticsRange;
      eventsSince: string | null;      // first usage_events.created_at, ISO; also the logins history/event cutover
      kpis: { totalUsers: number; activeUsers7d: number; activeUsers30d: number; billsTracked: number; testimonies: number };
      series: Record<'signups' | 'logins' | 'activeUsers' | 'billsTracked' | 'testimonies' | 'contacts' | 'tagsApplied' | 'follows', WeeklyPoint[]>;
      features: FeatureRow[];          // one row per page_view section + one per other client event
      topSearches: TopSearch[];        // top 20
      orgs: { id: string; name: string }[];
    }
    ```
  - `buckets.ts`: `rangeStart(range: AnalyticsRange, now: Date): Date | null` (`all` → null); `previousRangeStart(range, now): Date | null`; `fillWeeks(rows: WeeklyPoint[], from: Date, to: Date): WeeklyPoint[]` (zero-fills missing Mondays in Pacific/Honolulu, ascending); `percentChange(current: number, previous: number): number | null` (`previous === 0` → null).
  - `getAnalyticsDashboard(params: { range: AnalyticsRange; org: OrgFilter }): Promise<DashboardData>` in `src/db/queries/analytics.ts`. For `range: 'all'`, `from` = earliest `user.created_at`. Weekly SQL: ``sql`date_trunc('week', ${col} AT TIME ZONE 'Pacific/Honolulu')` ``. Org rules (spec §4a): activity by the org it happened in (`user_bills.tenant_id` falling back to the user's memberships when NULL; `bill_tags` via `tags.tenant_id`); people metrics count users under every current membership; `none` = users with no `members` row + events with NULL tenant. `bill_search` rows excluded from unique-user/per-org numbers. Logins series = `sessions.created_at` before `eventsSince` unioned with `login` events after it. Active users = distinct `user_id` over `usage_events` ∪ `sessions` in the window.
  - `getAnalyticsDashboardAction(params: { range: AnalyticsRange; org: OrgFilter }): Promise<DashboardData>` (`requireSysadmin.fromAction()`); `GET /api/analytics?range=30d&org=all|none|<tenantId>` (`requireSysadmin.fromRequest`, standard error mapping); `data.analytics.getDashboard(params)` registered in `analyticsClient`.

- [ ] **Step 1: Write the failing tests**

```ts
// permissions.test.ts
describe('isSysadmin', () => {
  it('is true only for sysadmin', () => {
    expect(isSysadmin({ systemRole: 'sysadmin' })).toBe(true);
    expect(isSysadmin({ systemRole: 'user' })).toBe(false);
    expect(isSysadmin(null)).toBe(false);
  });
});

// analytics-buckets.test.ts
describe('fillWeeks', () => {
  it('zero-fills an empty series across the range', () => {
    const out = fillWeeks([], new Date('2026-11-02T12:00:00Z'), new Date('2026-11-20T12:00:00Z'));
    expect(out.map(p => p.week)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
    expect(out.every(p => p.value === 0)).toBe(true);
  });
  it('keeps existing values', () => {
    const out = fillWeeks([{ week: '2026-11-09', value: 4 }], new Date('2026-11-02T12:00:00Z'), new Date('2026-11-16T12:00:00Z'));
    expect(out).toEqual([{ week: '2026-11-02', value: 0 }, { week: '2026-11-09', value: 4 }, { week: '2026-11-16', value: 0 }]);
  });
  it('buckets by Hawaii time, not UTC', () => {
    // Monday 2026-11-09 05:00 UTC is still Sunday 2026-11-08 in Honolulu → week of 2026-11-02
    const out = fillWeeks([], new Date('2026-11-09T05:00:00Z'), new Date('2026-11-09T05:00:00Z'));
    expect(out[0].week).toBe('2026-11-02');
  });
});
describe('rangeStart / percentChange', () => {
  const now = new Date('2026-11-20T00:00:00Z');
  it('computes range starts', () => {
    expect(rangeStart('30d', now)?.toISOString()).toBe('2026-10-21T00:00:00.000Z');
    expect(rangeStart('all', now)).toBeNull();
    expect(previousRangeStart('30d', now)?.toISOString()).toBe('2026-09-21T00:00:00.000Z');
  });
  it('percentChange handles zero baseline', () => {
    expect(percentChange(15, 10)).toBe(50);
    expect(percentChange(5, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `pnpm vitest run src/lib/__tests__/analytics-buckets.test.ts src/lib/__tests__/permissions.test.ts` → FAIL.
- [ ] **Step 3: Implement `isSysadmin` and `buckets.ts`** → tests PASS.
- [ ] **Step 4: Implement `requireSysadmin`, types, `getAnalyticsDashboard`, action, route, client op.**
- [ ] **Step 5: Verify** — `pnpm typecheck && pnpm test` pass; in dev as a sysadmin, `curl` `/api/analytics?range=90d&org=all` with the session cookie → 200 JSON matching `DashboardData`; as a non-sysadmin → 403; signed out → 401.
- [ ] **Step 6: Commit** — `feat: analytics dashboard query behind requireSysadmin`

---

### Task 7: Analytics page, dashboard UI, avatar menu entry

**Files:**
- Create: `src/app/(main)/analytics/page.tsx`
- Create: `src/components/analytics/analytics-dashboard.tsx`, `src/components/analytics/weekly-chart.tsx`, `src/components/analytics/feature-usage-table.tsx`, `src/components/analytics/top-searches.tsx`
- Modify: `src/components/auth/user-menu.tsx` (new item before "Guide", ~line 221)

**Interfaces:**
- Consumes: `data.analytics.getDashboard`, `DashboardData`, `fillWeeks`/`percentChange` (Task 6); `isSysadmin`; `auth()`.

- [ ] **Step 1: Page** — server component: `const session = await auth(); if (!isSysadmin(session?.user)) notFound();` then render `<AnalyticsDashboard />`. `export const metadata = { title: 'Analytics' }`.
- [ ] **Step 2: Avatar menu** — `DropdownMenuItem asChild` → `<Link href="/analytics">` with a lucide `BarChart3` icon and label "Analytics", rendered only when `isSysadmin(user)`. Nowhere else (not header nav, bottom tab bar, hamburger, or tracker views).
- [ ] **Step 3: Dashboard** — load `getDashboard` for the selected range (default `90d`) and org (default all); controls: range select (30 days / 90 days / 1 year / All time), org select (All organizations / No organization / each org). Sections in order, per spec §4: KPI cards; weekly charts (signups, logins, active users, bills tracked, work done with testimonies/contacts/tags/follows as separate series); top searches (zero-result rows highlighted with a chip, not a colored left border); feature usage table (label, count, change vs. previous period via `percentChange`, unique users, anonymous visitors marked "≈"). Notes: "Collecting since {eventsSince}" on event-based sections, or "Not collecting yet" when null; "Logins before {eventsSince} are approximate" under the logins chart. Loading skeleton and an inline error state. Load the `dataviz` skill before writing chart code; use `chart.tsx` and theme tokens. Stacks to one column at phone width with the table scrolling horizontally inside its card.
- [ ] **Step 4: Verify** — `pnpm typecheck && pnpm test && pnpm build` pass. In dev: as sysadmin the avatar menu shows "Analytics" and `/analytics` renders with data; switching range/org refetches; as a non-sysadmin the item is absent and `/analytics` is a 404; signed out → 404; at 375px width there's no horizontal page scroll.
- [ ] **Step 5: Commit** — `feat: sysadmin analytics dashboard in the avatar menu`

---

### Task 8: Final verification

- [ ] **Step 1:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — all pass.
- [ ] **Step 2:** `grep -rn "'use server'" src/db/queries src/services src/lib/auth/session.ts` → no matches.
- [ ] **Step 3:** In dev, run the full QA walk from Tasks 3–7 once end-to-end and confirm no `usage_events` row contains an IP, user agent, or (for `bill_search`) any identity.
