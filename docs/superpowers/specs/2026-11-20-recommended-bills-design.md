# Recommended Bills — Design

Date: 2026-11-20
Branch: `feat/recommended-bills`

## Intent

New users don't know which bills to track. Recommendations based on interests they
pick at onboarding give them a starting set, and a persistent "Recommended for you"
row keeps them aware of bills moving through the legislature (engagement, not just
day-one setup).

Audience: **any new user** (public or org member). Recommendations are per-user,
driven by the user's own interests — not by org mission statements (possible later).

## Goals

- Right after the welcome tour, a signed-in new user gets an optional "What do you
  care about?" step: drafted topic chips + their own free-text keywords. Skippable.
- Interests (topics + own keywords) are saved to the user's profile and editable
  there at any time.
- A "Recommended for you" row at the top of Find Bills (`/find-bills`) showing
  matching bills, each with a reason ("matched: Farm to School") and a Track button.
- Efficient: no per-user-per-bill storage, nothing to keep in sync.

## Non-goals

- AI/LLM topic classification or embeddings (approaches B and C, rejected below).
- Org mission-statement recommendations.
- Reusing `bills.food_related`. It is deprecated and is a per-bill column, so it
  cannot express "relevant to this user". Leave it alone; no filtering on it.
- Email/push notifications of new recommended bills.

## Anti-goals

- **Ranking by keyword frequency.** A bill repeating "agriculture" ten times is not
  more relevant. Matching is yes/no per topic; repetition never adds score.
- A new interests table, or a per-user "relevant" flag table (`user_bill_matches` or similar) — redundant with
  a query-time match and a sync burden.
- An empty list off-season because dead bills were filtered out.

## Approaches considered

- **A. Topic chips + keyword matching (chosen).** Topics map to curated keyword
  lists in code; user picks topics and may add own keywords; matched with Postgres
  full-text search at query time. No AI, fast, predictable. Trade-off: misses
  synonyms not in the lists, so keyword-list quality is the whole game.
- B. AI assigns topics to bills in a batch job; users pick topics; recommendations
  are a join. Better synonym handling and explainability, but adds an LLM pipeline.
- C. Embeddings + similarity. Best for free text, but needs pgvector (not installed)
  and an embedding model, and can't explain matches.

Jaden picked A.

## Architecture

### 1. Topics in code — `src/lib/bills/recommendation-topics.ts` (pure, DB-free)

```ts
export interface RecommendationTopic {
  id: string;          // stable slug stored in user_preferences.interest_topics
  label: string;       // chip text
  terms: string[];     // keywords/phrases; multi-word = phrase
}
export const RECOMMENDATION_TOPICS: RecommendationTopic[] = [ ... ];
```

Seeded from the tags orgs already use: Food Access, Farmer Support, Local Food
System Development, Soil & Ecosystem Health, Land Access, Farm to School,
Aquaponics/Fishpond, Emergency Preparedness, Water. Each gets a hand-written term
list (e.g. Farm to School: "school meal", "school lunch", "cafeteria", "keiki",
"farm to school"). Include Hawaiian terms where relevant (loʻi, loko iʻa, ʻāina,
kalo) — mind ʻokina/macron variants in bill text.

Pure helpers here (unit-tested): validate/normalize user keywords (trim, lowercase,
dedupe, length/count caps), and build the term list for a user (topic terms +
custom keywords).

### 2. Storage — extend `user_preferences` (no new table)

Jaden's decision: store interests on the existing per-user `user_preferences` table
rather than a new table. Migration `000039_user_preferences_interests`:

```sql
ALTER TABLE user_preferences
  ADD COLUMN interest_topics   text[] NOT NULL DEFAULT '{}',
  ADD COLUMN interest_keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN onboarded_at      timestamptz;   -- set on save OR skip; drives "show picker?"
```

**No backfill (Jaden's decision):** every existing account starts non-onboarded and
sees the picker on its next visit. `user_preferences` rows are created lazily by the
upsert in `db/queries/user-preferences.ts`; a user with no row is treated as
"no interests, not onboarded" (extend `getUserPreferences`' defaults accordingly).

Extend `src/types/preferences.ts` (`UserPreferences`) with `interest_topics`,
`interest_keywords`, `onboarded_at`, and reuse the existing read/write path:
`getUserPreferences` / `updateUserPreferences`, `data.preferences`, and
`useAuth().preferences` / `updatePreferences`. No new data-client domain for
interests. Regenerate `src/db/types.ts`.

Keyword caps (my call): at most 10 custom keywords, each 2–40 characters; topics
validated against `RECOMMENDATION_TOPICS` ids server-side (zod).

### 3. Matching — one query, `src/db/queries/recommendations.ts`

Reuse the existing `bills.search_vector` (migration 000031, GIN-indexed: number A,
title B, description C; not in `db/types.ts`, so reference it via `sql` templates).
Matching mirrors Find Bills' FTS-plus-substring idea, **but per whole term**: a term
matches if `search_vector @@ phraseto_tsquery('english', term)` OR the whole term is a
case-insensitive substring of `bill_title`/`description` (LIKE metacharacters
escaped). Do NOT reuse `tokenizeSearchQuery` — it splits terms into single words, so
"school meal" would match any bill containing "school". The substring fallback exists
because the english stemmer is inconsistent across word families (see the comment
in `bills-read.ts`).

Query shape:
- Pool: current-session bills, **including dead bills**. Session years come from
  `SESSION_YEARS` (currently hardcoded `[2026]` in `bill-search-view.tsx`) — move it
  to a shared lib constant and use it in both places.
- Exclude bills the user already tracks in **any** tenant (`user_bills.user_id =
  userId`, no tenant filter — also sidesteps the NULL-tenant drift). Recommendations
  are per-user, so "you track this somewhere" is enough (my call).
- Return the `BillSearchResult` shape `BillSearchCard` expects (`is_tracked` false),
  plus `matchedTopics: string[]`.
- `WHERE` = OR over every term of every selected topic + custom keywords.
- `SELECT` one boolean per selected topic (and one for "your keywords") → which
  topics matched. Distinct-topic count = number of true flags.
- Measured locally: ~3 ms execution for a two-topic query over 2026 bills.

### 4. Ranking (in TS, after the query)

The matched set is small, so rank in application code (hearing dates are parsed
from `current_status_string` via `parseHearingDatetime` in
`lib/testimony/hearing-schedule.ts`, which is TS):

1. Alive bills before dead bills.
2. Upcoming hearing (soonest first).
3. Recent movement (`updated_at` desc).
4. Tie-break: more distinct topics matched first.

Never rank by term frequency or `ts_rank`. Put the ranking in a pure function in
`src/lib/bills/` so it is unit-tested. Return the top N (e.g. 10) with a "see all"
that opens Find Bills with those terms (builder's call on exact mechanism).

### 5. Transport — data-client pattern

- `db/queries/recommendations.ts`: `getRecommendedBills(userId)` — reads the
  user's interests from `user_preferences` and runs the match.
- Action arm `app/actions/recommendations.ts` + API route under
  `app/api/recommendations/` + `lib/data-client/recommendations.client.ts`,
  registered as `data.recommendations`. Guarded with `requireSession`.
- Saving interests / marking onboarded go through the existing preferences
  update path (see §2).

### 6. UI

- **Interest picker** (dialog): chips for the drafted topics + tag-style input for
  the user's own keywords. **Sequenced after the welcome tour** (Jaden's decision).
  `WelcomeTour` (`components/tour/welcome-tour.tsx`, mounted in
  `app/(main)/layout.tsx`) is localStorage-gated and also runs for signed-out
  visitors. Rule: open the picker when signed in, `preferences.onboarded_at` is
  null, and the tour is not currently running. Have the tour's `close()` dispatch a
  "tour finished" window event (alongside the existing `TOUR_START_EVENT`) so the
  picker opens the moment the tour ends; on later page loads the tour isn't
  running, so a user who toured while signed out gets the picker after signing in.
  "Skip" sets `onboarded_at` with empty interests.
- **Settings: Interests section** in the existing settings dialog's Preferences
  tab (`PreferencesPanel` in `components/settings/settings-dialog.tsx`) — same
  chips + own-keywords editor, saved via `updatePreferences` (Jaden's decision:
  users write their own keywords and edit them in their user settings). The Recommended row's
  "Edit interests" opens this section.
- **Recommended row** on `/find-bills` (`components/search/bill-search-view.tsx`),
  reusing `bill-search-card.tsx` and `track-button.tsx`. `BillSearchCard` needs a new
  optional slot for the "matched: …" line. Dead bills keep the existing dead badge.
  Tracking a bill removes it from the row: `TrackButton` currently only invalidates
  `['bills','search']`, so also invalidate the recommendations query key (or add an
  `onTracked` callback).
- Signed-out users: a compact "Sign in to get recommendations" prompt (my call).
- Signed-in with no interests: compact prompt to pick interests instead of the row.
- Follow existing card conventions (no colored left-edge accent strips).

```
Find Bills
┌ Recommended for you ─────────────── Edit interests ┐
│ HB 1234  Farm to school lunch pilot   [+ Track]     │
│   matched: Farm to School · hearing Tue             │
│ SB 567   Fishpond restoration grants  [+ Track]     │
│   matched: Aquaponics/Fishpond · new this week      │
└─────────────────────────────────────────────────────┘
```

## Constraints

- Kysely only; queries live in `src/db/queries/`; `src/lib/` stays DB-free.
- Data-client contract: action and fetch arms take identical params and return the
  same unwrapped value.
- Tests: pure unit tests only (`src/lib/__tests__/`) — keyword normalization,
  term-list building, ranking.

## Validation before shipping

Keyword lists decide whether this works. Before shipping, run each topic's terms
against 2025 and 2026 bills and eyeball hits and misses; tune lists until each topic
returns a plausible set. (A first sample of school-meal + fishpond terms matched
only one non-dead 2026 bill — partly because the session is over, partly because the
lists need work.)

## Left to the builder

- Drafting the keyword lists per topic (validated as above). Users' own keywords
  cover anything the drafted lists miss.
- How "current session year" is determined (e.g. max `bills.year`, or session config).
- Exact copy.
- Top-N size (suggest 10). "See all" opening `/find-bills?q=…` is a reasonable
  default, but Find Bills ORs single words, so it returns broader results than the
  row — acceptable, or skip "see all" in v1.
- Caching (not needed at current scale).
