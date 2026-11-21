# User Analytics — Design

**Date:** 2026-11-20 · **Branch:** `feat/user-analytics` · **Status:** first pass

## Intent

Show how Food+ is actually used so the team can tell **which features work and which don't**.
Audience is the Purple Maia team only (`system_role = 'sysadmin'`), not org admins.

Two halves:
1. **Backfilled metrics** from tables that already record activity (history back to day one).
2. **New event collection** in our own Postgres table for usage that saves nothing today
   (page visits, searches, exports, opening a bill).

## Goals

- One sysadmin-only dashboard: signups, logins/active users, bills tracked, "work" done,
  and per-feature usage (count + unique users), filterable by date range and organization.
- Start collecting first-party usage events with negligible impact on page performance.

## Non-goals (first pass)

- Funnels, cohorts/retention curves, session replay, A/B testing.
- Org-admin-facing analytics.
- Event retention/pruning policy (keep everything for now).
- Instrumenting every click — a short, fixed list of key actions only.

## Anti-goals (failure even if it "works")

- **A per-person activity log.** The dashboard shows aggregates (counts, unique users) only —
  no screen lists what a named user did.
- Sending user data to any third party. No IP addresses, no user-agent fingerprinting.
- Tracking ever breaking or slowing the app: tracking is fire-and-forget, errors are swallowed,
  never shown to the user, never block navigation.
- Untrusted clients polluting data: event names are allowlisted, props size-capped,
  tenant attribution verified server-side.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| A | Existing data only | Fast, full history; blind to features that don't write rows. |
| **B** | **Existing data + own `usage_events` table** *(chosen)* | One dashboard, data stays in our DB, no vendor/consent issues; we choose events up front and their history starts at ship. |
| C | Existing data + PostHog/Plausible | Least code, richest tooling; second dashboard, data to a vendor, recurring cost. |

Chosen: **B** — answers "which features get used" in one place we control.

## What exists today (constraints found in recon)

| Metric | Source | Caveat |
|---|---|---|
| Signups | `user.created_at` | — |
| Logins | `sessions.created_at` | **Lossy**: `deleteSession` removes the row on logout, and password reset deletes all a user's sessions. Historical logins are an undercount; label as such. |
| Bills tracked | `user_bills.adopted_at` | Rows can have `tenant_id = NULL` (legacy drift) — attribute to org via `members` when filtering by org, or count them under "no org". |
| Testimonies | `testimonies.created_at`, `submitted_at` | — |
| Legislator contacts logged | `legislator_contacts.contacted_at` | — |
| ~~Tags applied~~ | `bill_tags.created_at` | **Not charted.** Both tag-save paths delete and re-insert a bill's whole tag set, so timestamps refresh on every edit and removed tags vanish from history (found in PR review). Dropped from the dashboard; revisit with a tag event if needed. |
| Org follows | `org_follows.created_at` | — |
| Org status changes | `org_bills.updated_at` | **Latest only, no history** — cannot count changes historically. Logged as an event going forward instead. (`status_updates` is scraped legislature data, not user activity.) |

## Design

### 1. Table: `usage_events` (migration `000038_usage_events`)

```
id          uuid pk default gen_random_uuid()
event       text not null           -- allowlisted name, see §3
user_id     uuid null references "user"(id) on delete set null
tenant_id   uuid null references tenants(id) on delete set null
anon_id     text null               -- random id from localStorage for signed-out visitors
path        text null               -- normalized route pattern, e.g. /bills/[id]
props       jsonb not null default '{}'
created_at  timestamptz not null default now()
indexes: (event, created_at), (created_at), (tenant_id, created_at)
```

Regenerate `src/db/types.ts` after migrating.

### 2. Collection

- **Server-side events** (trustworthy, no client involvement): a `logEvent()` function in
  `src/db/queries/usage-events.ts`, called where the action already happens:
  `login`, `signup`, `status_change` (org status set; props: `from`, `to`, `billId`).
  Wrapped so a logging failure never fails the parent operation.
- **Client events** go through the data-client per project convention:
  `data.analytics.track(event, props)` with both arms registered in `defineClient`.
  - fetch arm: `POST /api/events` using `navigator.sendBeacon` (fallback `fetch(..., { keepalive: true })`).
  - action arm: `trackEvent` in `src/app/actions/analytics.ts`.
  - Both swallow all errors and resolve `void`.
  - Override `analytics.track` to `'fetch'` in `transport.ts` OVERRIDES (beacon survives page unload).
- **Server validation** (route and action share one function): `optionalSession` resolves the user;
  event name checked against a zod enum; props ≤ 2 KB; client-supplied `tenantId` kept only if the
  user is a member of it (else `null`); signed-out events require `anon_id` and get no tenant.
  Rate-limit per user/anon id with the existing `ratelimit-memory`.
- **Page views:** a `<PageViewTracker />` client component using `usePathname`, mounted in the
  `(main)` layout and in the `learn` and `bills/[id]` pages. Normalizes the path via a pure
  `normalizePath()` (ids/slugs → `[id]`/`[slug]`) and fires `page_view` once per route change.

### 3. Event allowlist (first pass)

| Event | Fired from | Props |
|---|---|---|
| `page_view` | PageViewTracker | `section` (tracker, find-bills, take-action, community, guide, learn, bill) |
| `bill_opened` | bill detail drawer/page open | `billId`, `from` (kanban/spreadsheet/calendar/find-bills/…) |
| `bill_search` | Find Bills / tracker search (debounced, on settle) | `query` (trimmed, ≤100 chars), `resultCount`. **Stored with `user_id`, `anon_id` and `tenant_id` all NULL** (server strips them) so search text can't be tied to a person. Dashboard shows a "top searches" list. |
| `testimony_exported` | testimony export step | `format` (pdf/docx) |
| `csv_exported` | export-csv dialog | `rowCount` |
| `tracker_view_changed` | tracker view switch | `view` (kanban/spreadsheet/calendar) |
| `tour_finished` | WelcomeTour | `completed` (bool) |
| `login`, `signup`, `status_change` | server-side only (rejected from clients) | see §2 |

Adding an event later = add to the enum + one `track()` call.

### 4. Dashboard

- **Access (Jaden's decision):** reached **only** from the avatar menu
  (`src/components/auth/user-menu.tsx`): an "Analytics" item next to "Guide", rendered only
  when `user.systemRole === 'sysadmin'`. Not a tracker view, not in header nav or bottom tab bar.
  It links to its own page, `src/app/(main)/analytics/page.tsx`; the page checks sysadmin
  server-side and returns `notFound()` for everyone else (so the URL doesn't reveal itself).
  Data endpoints are gated by a new `requireSysadmin` guard in `@/lib/auth/auth-guards`
  (same `.fromRequest`/`.fromAction` shape as the other four).
  `/analytics` itself is excluded from `page_view` tracking.
- **Data:** `data.analytics.getDashboard({ range, tenantId? })` → one query module
  `src/db/queries/analytics.ts` returning all series in one payload. Range: 30d / 90d / 1y / all.
  Org filter: all orgs, a specific org, or "no org" (public users).
- **Layout** (shadcn `card` + existing `chart.tsx`/recharts):
  1. KPI row: total users · active users last 7d / 30d · bills currently tracked · testimonies.
  2. Weekly line/bar charts: signups · active users · bills tracked · work done
     (testimonies, contacts logged, follows as separate series).
  3. **Top searches:** most frequent `bill_search` queries in range (normalized lowercase), with
     count and average result count — zero-result searches highlighted.
  4. **Feature usage table:** for each section/event in range — count, unique users, trend vs.
     previous period. This is the main "what works" view.
- "Active users" = distinct users with a `usage_events` row or a session created that week.
  Event-based metrics show a "collecting since <first event date>" note; login history shows
  an "undercounts before <ship date>" note.
- Desktop-first; must remain usable (stacked cards, scrollable table) at phone width.

### 4a. Metric definitions (author's calls, from builder review)

- **Org filter:** *activity* is attributed to the org it happened in (`usage_events.tenant_id`,
  `testimonies.tenant_id`, `legislator_contacts.tenant_id`, `org_follows.tenant_id`,
  `user_bills.tenant_id` falling back to the user's membership when NULL). *People* metrics
  (signups, active users) count a user under **every** org they currently belong to, so per-org
  numbers don't sum to the total. **"No org"** = users with no membership, plus events with a
  null tenant.
- **Signed-in vs. anonymous:** "unique users" counts `user_id` only. The feature table gets a
  separate **"anonymous visitors"** column (distinct `anon_id`), labelled approximate (per device).
- **`login` event:** fires on an explicit password login and on Google OAuth sign-in — not on
  registration (that's `signup`) or password reset. Backfilled login history is labelled
  **"approximate"** (session rows also come from signup/reset/OAuth and are deleted on logout).

- **Team usage is included** (Jaden's decision): no exclusion of sysadmins, the Food+ tenant,
  or test accounts.
- **Search counts:** `bill_search` has no user, so it contributes to event counts and top
  searches but not to unique-user or per-org numbers.

### 5. Tests (pure, in `src/lib/__tests__/`)

- `normalizePath` (ids, slugs, query strings, trailing slashes).
- Event validation schema (allowlist, server-only events rejected, props size cap).
- Weekly bucketing / period-over-period trend helpers (put in `src/lib/analytics/`).

## Left to the builder

- Exact chart types/colors (follow `dataviz` guidance and existing theme tokens).
- Where precisely to hook `bill_opened` and the debounce for `bill_search`.
- Query shape/perf in `analytics.ts` (SQL `date_trunc('week', …)` via Kysely `sql` helpers is fine).
- Whether to also expose the API-route arm for `getDashboard` beyond what `defineClient` requires.
