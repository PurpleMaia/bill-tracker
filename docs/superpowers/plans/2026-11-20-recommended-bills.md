# Recommended Bills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recommend bills to each user from interest topics + their own keywords, picked right after the welcome tour and editable in settings, shown as a "Recommended for you" row on Find Bills.

**Architecture:** Interests live as three new columns on `user_preferences` and travel the existing preferences path. Recommendations are computed per request: one Kysely query ORs every term against the existing `bills.search_vector` (phrase FTS) plus whole-term ILIKE, returns per-term match flags, and a pure TS function ranks the matches by timing. No per-user-per-bill storage.

**Tech Stack:** Next.js 15 App Router, TypeScript, Kysely/Postgres, react-query, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-recommended-bills-design.md`

## Global Constraints

- All queries in `src/db/queries/*`; `src/lib/` stays DB-free; deep imports, no barrels.
- Client code calls `data.*`; every data-client op has identical `action`/`fetch` arms returning the same unwrapped value.
- `'use server'` files export only async functions.
- Matching: a term matches if `search_vector @@ phraseto_tsquery('english', term)` OR the whole term is an ILIKE substring of `bill_title`/`description` (LIKE metachars escaped). Never use `tokenizeSearchQuery`.
- Ranking never uses term frequency or `ts_rank`.
- Pool: current session years (`[2026]`), dead bills INCLUDED (sorted last), bills the user tracks in ANY tenant excluded.
- No backfill: every existing account starts with `onboarded_at = NULL`.
- Custom keywords: max 10, each 2–40 chars after trim; lowercase; deduped. Topics: only ids in `RECOMMENDATION_TOPICS`.
- Row shows top 10. No colored left-edge accent strips on cards.
- Tests: pure unit tests in `src/lib/__tests__/` (flat). Before each commit: `pnpm typecheck && pnpm test`; before the PR also `pnpm build`.
- Commit prefixes `feat:`/`fix:`/`refactor:`/`docs:`; no `Co-Authored-By` lines.

## Review Focus

1. A custom keyword containing `%` or `_` (e.g. `100%`) must match literally, not every bill — Task 1 test on `likeContainsPattern`.
2. A multi-word topic term like "school meal" must not match a bill that only says "school" — Task 1 test asserts terms are kept whole; Task 4 SQL uses `phraseto_tsquery` per term (verified in Task 5 step).
3. A user with no `user_preferences` row (rows are created lazily) gets empty interests and `onboarded_at: null`, so the picker still appears — Task 2 test on `applyPreferenceDefaults(null)`.
4. A topic id stored in the DB that was later removed from the catalog is ignored, not a crash or an empty `phraseto_tsquery` — Task 1 test on `buildInterestTerms`.
5. Preferences that fail to load (`preferences === null`) must not open the picker on every page — Task 7 test on `shouldOpenInterestPicker`.

---

### Task 1: Topic catalog and term helpers

**Files:**
- Create: `src/lib/bills/recommendation-topics.ts`, `src/lib/bills/session-years.ts`
- Modify: `src/components/search/bill-search-view.tsx` (import `SESSION_YEARS` instead of the local const)
- Test: `src/lib/__tests__/recommendation-topics.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // session-years.ts
  export const SESSION_YEARS: number[] = [2026];
  // recommendation-topics.ts
  export interface RecommendationTopic { id: string; label: string; terms: string[] }
  export const RECOMMENDATION_TOPICS: RecommendationTopic[];
  export const MAX_KEYWORDS = 10, MIN_KEYWORD_LENGTH = 2, MAX_KEYWORD_LENGTH = 40;
  export function normalizeInterests(input: { topics?: unknown; keywords?: unknown }):
    { topics: string[]; keywords: string[] };
  export interface InterestTerm { label: string; term: string }  // label = topic label, or the keyword itself
  export function buildInterestTerms(topics: string[], keywords: string[]): InterestTerm[];
  export function likeContainsPattern(term: string): string;      // '%' + escaped + '%'
  ```

- [ ] **Step 1: Write failing tests:**
  - `RECOMMENDATION_TOPICS` ids are unique kebab-case; every topic has ≥3 terms; all terms lowercase and non-empty.
  - `normalizeInterests({ topics: ['farm-to-school', 'nope', 'farm-to-school'], keywords: ['  Kalo ', 'kalo', 'a', 'x'.repeat(41), 42] })` → `{ topics: ['farm-to-school'], keywords: ['kalo'] }`.
  - 12 valid keywords → first 10 kept.
  - non-array inputs → `{ topics: [], keywords: [] }`.
  - `buildInterestTerms(['farm-to-school', 'removed-topic'], ['kalo'])` contains `{ label: 'Farm to School', term: 'school meal' }` (term kept whole, not split) and `{ label: 'kalo', term: 'kalo' }`, and nothing for `removed-topic`.
  - `likeContainsPattern('100%_a\\b')` === `'%100\\%\\_a\\\\b%'`.
- [ ] **Step 2: Run** `pnpm test recommendation-topics` → FAIL (module missing).
- [ ] **Step 3: Implement.** Starter catalog (ids/labels from org tags; Task 5 tunes terms):
  - `food-access` Food Access: food insecurity, food bank, food pantry, snap, ebt, wic, double up food bucks, hunger
  - `farmer-support` Farmer Support: farmer, rancher, agricultural loan, agricultural grant, beginning farmer, agricultural workforce, farm labor
  - `local-food-system` Local Food System Development: local food, locally grown, food hub, food processing, value-added, food self-sufficiency, food sustainability
  - `soil-ecosystem` Soil & Ecosystem Health: soil health, regenerative, carbon sequestration, compost, pesticide, invasive species, watershed
  - `land-access` Land Access: agricultural land, important agricultural lands, agricultural lease, agricultural park, land trust, kuleana
  - `farm-to-school` Farm to School: farm to school, school meal, school lunch, school garden, cafeteria, keiki
  - `aquaponics-fishpond` Aquaponics/Fishpond: aquaponics, aquaculture, fishpond, loko i'a, loko iʻa, fisheries, limu
  - `emergency-preparedness` Emergency Preparedness: emergency preparedness, food security, disaster, resilience, food stockpile
  - `water` Water: water, irrigation, water rights, stream, aquifer, ditch

  `normalizeInterests`: arrays only; topics filtered to catalog ids, deduped; keywords trimmed, lowercased, length-filtered, deduped, capped at `MAX_KEYWORDS`. `likeContainsPattern` escapes `\`, `%`, `_` with backslash (Postgres default ILIKE escape).
- [ ] **Step 4: Run** `pnpm test recommendation-topics` → PASS; `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat: recommendation topic catalog and term helpers`.

### Task 2: Interest columns on `user_preferences`

**Files:**
- Create: `src/db/migrations/000038_user_preferences_interests.up.sql`, `.down.sql`
- Modify: `src/db/types.ts` (regenerate via `pnpm codegen`, or hand-add the 3 fields to `UserPreferences` if codegen needs a live DB)
- Modify: `src/types/preferences.ts`, `src/lib/core/preferences.ts`, `src/db/queries/user-preferences.ts`, `src/app/actions/preferences.ts`, `src/app/api/preferences/route.ts`, `src/lib/data-client/preferences.client.ts`, `src/hooks/contexts/auth-context.tsx` (patch type only)
- Test: `src/lib/__tests__/preferences.test.ts`

**Interfaces:**
- Consumes: Task 1 `normalizeInterests`.
- Produces:
  ```ts
  // src/types/preferences.ts
  export interface UserPreferences {
    ai_opt_in: boolean;
    kanban_detailed_view: boolean;
    interest_topics: string[];
    interest_keywords: string[];
    onboarded_at: string | null;   // ISO string
  }
  export interface PreferencesPatch {
    ai_opt_in?: boolean;
    kanban_detailed_view?: boolean;
    interest_topics?: string[];
    interest_keywords?: string[];
    mark_onboarded?: true;         // server stamps now(); client never sends a time
  }
  ```
  `data.preferences.update(patch: PreferencesPatch)` and `useAuth().updatePreferences(patch: PreferencesPatch)`.

- [ ] **Step 1: Migration.** Up: `ALTER TABLE user_preferences ADD COLUMN interest_topics text[] NOT NULL DEFAULT '{}', ADD COLUMN interest_keywords text[] NOT NULL DEFAULT '{}', ADD COLUMN onboarded_at timestamptz;` with a one-line comment that NULL `onboarded_at` means "show the interest picker". Down drops the three columns. Run `pnpm migrate:up`; expected: migration 38 applied.
- [ ] **Step 2: Update the failing tests** in `preferences.test.ts`: the null/undefined/partial cases now expect `interest_topics: []`, `interest_keywords: []`, `onboarded_at: null` in addition to the two booleans; add `it('defaults interests to empty and not onboarded')` asserting exactly those three fields on `applyPreferenceDefaults(null)`.
- [ ] **Step 3: Run** `pnpm test preferences` → FAIL (missing fields).
- [ ] **Step 4: Implement.** Extend `UserPreferences`/`DEFAULT_PREFERENCES`; add `PreferencesPatch`. `getUserPreferences` selects the three columns and converts `onboarded_at` Date → ISO string. `updateUserPreferences(userId, patch: PreferencesPatch)` whitelists as today, passes `interest_topics`/`interest_keywords` through `normalizeInterests` (Task 1), and maps `mark_onboarded: true` → `onboarded_at: new Date()`. The route's PATCH passes the parsed body to `updateUserPreferences` (which owns the whitelist) instead of re-whitelisting. Switch action, fetch arm and auth-context `updatePreferences` to `PreferencesPatch`.
- [ ] **Step 5: Run** `pnpm typecheck && pnpm test` → PASS.
- [ ] **Step 6: Commit** `feat: interest columns on user_preferences`.

### Task 3: Ranking

**Files:**
- Create: `src/lib/bills/recommendation-ranking.ts`
- Modify: `src/types/legislation.ts` (add `RecommendedBill`)
- Test: `src/lib/__tests__/recommendation-ranking.test.ts`

**Interfaces:**
- Consumes: `BillSearchResult`, `parseHearingDatetime(statusText): Date | null` from `@/lib/testimony/hearing-schedule`.
- Produces:
  ```ts
  // types/legislation.ts
  export interface RecommendedBill extends BillSearchResult {
    matched: string[];              // InterestTerm labels, deduped, catalog order then keywords
    next_hearing_at: string | null; // ISO, only if in the future at rank time
  }
  // recommendation-ranking.ts
  export const RECOMMENDATION_LIMIT = 10;
  export function rankRecommendations(
    candidates: Array<BillSearchResult & { matched: string[] }>,
    now: Date,
    limit?: number,             // default RECOMMENDATION_LIMIT
  ): RecommendedBill[];
  ```

- [ ] **Step 1: Write failing tests** (build fixtures with a small `bill()` factory):
  - alive bill with no hearing ranks above a dead bill with an upcoming-looking hearing text.
  - among alive bills, one whose `latest_update.statustext` parses to a future hearing ranks first; two such bills order soonest-first; a past hearing counts as no hearing and yields `next_hearing_at: null`.
  - without hearings, more recent activity (`latest_update.date`, falling back to `updated_at`) ranks first.
  - equal timing: `matched.length` 2 beats 1.
  - a bill whose description repeats "agriculture" 10× gets no advantage (same rank inputs → order decided only by timing/matched count).
  - output is capped at `limit`.
- [ ] **Step 2: Run** `pnpm test recommendation-ranking` → FAIL.
- [ ] **Step 3: Implement** a stable sort with keys in order: `dead` (false first) → has future hearing (true first) → hearing time asc → activity time desc → `matched.length` desc → `bill_number` asc (determinism).
- [ ] **Step 4: Run** → PASS; `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat: rank recommended bills by timing`.

### Task 4: Recommendation query and `data.recommendations`

**Files:**
- Modify: `src/db/queries/bills-read.ts` — extract the batched DISTINCT ON latest-update lookup (~L814-828) into exported `getLatestStatusUpdates(billIds: string[]): Promise<Map<string, StatusUpdate>>` and use it in `searchBills` (behavior unchanged).
- Modify: `src/db/queries/bill-mappers.ts` — extract the row→`BillSearchResult` mapping (~L830-850) into `toBillSearchResult(row, update: StatusUpdate | undefined, isTracked: boolean): BillSearchResult`; `searchBills` uses it.
- Create: `src/db/queries/recommendations.ts`, `src/app/actions/recommendations.ts`, `src/app/api/recommendations/route.ts`, `src/lib/data-client/recommendations.client.ts`
- Modify: `src/lib/data-client/index.ts` (register `recommendations`)

**Interfaces:**
- Consumes: Task 2 `getUserPreferences`; Task 1 `buildInterestTerms`, `likeContainsPattern`, `SESSION_YEARS`; Task 3 `rankRecommendations`.
- Produces:
  ```ts
  // db/queries/recommendations.ts
  export interface RecommendationsResponse { hasInterests: boolean; items: RecommendedBill[] }
  export async function getRecommendedBills(userId: string, now?: Date): Promise<RecommendationsResponse>;
  // data-client
  data.recommendations.get(): Promise<RecommendationsResponse>   // action + fetch (GET /api/recommendations)
  ```

- [ ] **Step 1: Refactor extraction.** Move the two blocks out of `searchBills` into the helpers above. Run `pnpm typecheck && pnpm test` → PASS. Commit `refactor: share latest-update lookup and search-result mapper`.
- [ ] **Step 2: Implement `getRecommendedBills`.** Load prefs; `terms = buildInterestTerms(...)`; if empty return `{ hasInterests: false, items: [] }`. Per term, `matchExpr(t) = sql<boolean>\`(search_vector @@ phraseto_tsquery('english', ${t.term}) OR bill_title ILIKE ${likeContainsPattern(t.term)} OR description ILIKE ${likeContainsPattern(t.term)})\``. Query `bills` where `year = any(SESSION_YEARS)` AND `not exists (select 1 from user_bills ub where ub.bill_id = bills.id and ub.user_id = ${userId})` AND OR of all `matchExpr`; select the `BillSearchResult` columns plus one aliased boolean per term (`m0`, `m1`, …); order by `updated_at desc nulls last`, limit 500 (safety cap). Build `matched` from true flags → labels (dedupe), attach latest updates via `getLatestStatusUpdates`, map with `toBillSearchResult(row, update, false)`, return `{ hasInterests: true, items: rankRecommendations(candidates, now) }`.
- [ ] **Step 3: Transport.** Action `getRecommendationsAction()` uses `requireSession.fromAction()`; route `GET` uses `requireSession.fromRequest` and the standard `error?.statusCode` mapping (copy `api/preferences/route.ts` shape); fetch arm `GET /api/recommendations`; `defineClient('recommendations', { get: {...} })`; add to `data`.
- [ ] **Step 4: Verify** `pnpm typecheck && pnpm test && pnpm build` → all PASS (build catches `'use server'` export violations).
- [ ] **Step 5: Commit** `feat: recommendations query and data client`.

### Task 5: Tune keyword lists against real bills

**Files:**
- Create (scratch, not committed): a script in the session scratchpad that, for each topic, runs the Task 4 match expression against `bills` for years 2025 and 2026 and prints hit count + 10 sample titles.
- Modify: `src/lib/bills/recommendation-topics.ts` (term lists only)

- [ ] **Step 1: Run the script** against the local DB (`postgres://localhost:5432/civtrack_local3`). Record per-topic hit counts.
- [ ] **Step 2: Tune.** Each topic should return a plausible set (rough target 10–150 bills/year; sample titles on-topic). Drop terms that flood with off-topic hits (e.g. a bare "water" or "disaster" if it pulls unrelated bills — prefer phrases); add terms for misses. Also confirm "school meal" doesn't match a bill that only says "school".
- [ ] **Step 3: Run** `pnpm test recommendation-topics` → PASS (catalog invariants still hold).
- [ ] **Step 4: Commit** `feat: tune recommendation keyword lists`, with per-topic hit counts in the commit body.

### Task 6: Interests editor + settings section

**Files:**
- Create: `src/components/recommendations/interests-editor.tsx`
- Modify: `src/components/settings/settings-dialog.tsx` (`PreferencesPanel` gets an "Interests" section)

**Interfaces:**
- Consumes: `RECOMMENDATION_TOPICS`, `normalizeInterests`, `MAX_KEYWORDS`, `MIN_KEYWORD_LENGTH`, `MAX_KEYWORD_LENGTH`; `useAuth().preferences` / `updatePreferences(patch: PreferencesPatch)`.
- Produces:
  ```ts
  export interface InterestsValue { topics: string[]; keywords: string[] }
  export function InterestsEditor(props: { value: InterestsValue; onChange: (v: InterestsValue) => void; disabled?: boolean }): JSX.Element;
  ```

- [ ] **Step 1: Build `InterestsEditor`.** Controlled: topic chips (toggle buttons, `aria-pressed`) + keyword input that adds on Enter/comma, shows removable keyword pills, and disables adding at `MAX_KEYWORDS` with a helper line ("Up to 10 keywords"). Run input through `normalizeInterests` before `onChange`.
- [ ] **Step 2: Settings section.** In `PreferencesPanel`, an "Interests" section seeded from `preferences`, local draft state, Save button calling `updatePreferences({ interest_topics, interest_keywords })` (disabled when unchanged), toast on success/failure matching the panel's existing pattern.
- [ ] **Step 3: Verify in the app** (`pnpm dev`, port 9002): sign in, open Settings → Preferences, pick 2 topics + a keyword, Save, reload — selections persist. Then `pnpm typecheck` → PASS.
- [ ] **Step 4: Commit** `feat: edit interests in settings`.

### Task 7: Interest picker after the welcome tour

**Files:**
- Modify: `src/lib/tour/welcome-tour.ts` (add `TOUR_END_EVENT = 'billtracker:end-tour'`, move `hasSeenTour()` here from the component and export it)
- Modify: `src/components/tour/welcome-tour.tsx` (`close()` dispatches `TOUR_END_EVENT`; import `hasSeenTour`)
- Create: `src/lib/recommendations/interest-picker.ts`, `src/components/recommendations/interest-picker-dialog.tsx`
- Modify: `src/app/(main)/layout.tsx` (mount `<InterestPickerDialog />` after `<WelcomeTour />`)
- Test: `src/lib/__tests__/interest-picker.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // lib/recommendations/interest-picker.ts
  export function shouldOpenInterestPicker(s: {
    signedIn: boolean;
    preferences: { onboarded_at: string | null } | null;
    tourRunning: boolean;
  }): boolean;
  // component: InterestPickerDialog({ open?, onOpenChange? }) — uncontrolled auto mode when props omitted,
  // controlled "edit" mode when passed (used by Task 8's Edit interests).
  ```

- [ ] **Step 1: Write failing tests:** true only when `signedIn && preferences !== null && preferences.onboarded_at === null && !tourRunning`; false for each single condition flipped (incl. `preferences: null`).
- [ ] **Step 2: Run** `pnpm test interest-picker` → FAIL.
- [ ] **Step 3: Implement** the pure fn; tour event + `hasSeenTour` move.
- [ ] **Step 4: Implement the dialog.** Auto mode: `tourRunning` initial = `shouldAutoStartTour(pathname, hasSeenTour())`; set true on `TOUR_START_EVENT`, false on `TOUR_END_EVENT`; open when `shouldOpenInterestPicker` is true. Title "What do you care about?", `InterestsEditor`, buttons "Skip" → `updatePreferences({ mark_onboarded: true })` and "Save" → `updatePreferences({ interest_topics, interest_keywords, mark_onboarded: true })`. Closing via Esc/overlay counts as Skip (so it never reappears). Edit mode: seeded from preferences, Save writes interests only.
- [ ] **Step 5: Run** `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 6: Verify in the app:** clear `localStorage` key `billtracker:welcome-tour-v1`, sign in as a user with `onboarded_at` NULL, open `/find-bills` → tour runs, picker opens only after the tour closes; Skip → reload → no picker. Repeat with a fresh-tour signed-out visit then sign in → picker on next load.
- [ ] **Step 7: Commit** `feat: interest picker after welcome tour`.

### Task 8: "Recommended for you" row on Find Bills

**Files:**
- Create: `src/components/recommendations/recommended-bills-row.tsx`
- Modify: `src/components/search/bill-search-card.tsx` (optional `footer?: React.ReactNode` rendered under the activity line)
- Modify: `src/components/search/track-button.tsx` (also invalidate `['recommendations']`)
- Modify: `src/components/search/bill-search-view.tsx` (render the row above the search controls; pass its `handleCardClick`)

**Interfaces:**
- Consumes: `data.recommendations.get()` (react-query key `['recommendations']`), `RecommendedBill`, `InterestPickerDialog` in edit mode.
- Produces: `RecommendedBillsRow({ onCardClick: (billId: string) => void })`.

- [ ] **Step 1: Card slot + track invalidation.** Add `footer` prop; TrackButton's success path invalidates `['recommendations']` alongside `['bills','search']` so a tracked bill drops out of the row.
- [ ] **Step 2: Row states.** Signed out → compact "Sign in to get recommendations" with a link to `/login`. `hasInterests: false` → "Pick a few interests to see bills for you" + button opening the picker in edit mode. Loading → skeletons. `items.length === 0` → "No current bills match your interests yet" + "Edit interests". Otherwise header "Recommended for you" with "Edit interests", then `BillSearchCard`s (`query=""`) each with footer `matched: <labels joined by " · ">` plus `· hearing <weekday>` when `next_hearing_at` is set. Dead bills keep the card's existing dead treatment.
- [ ] **Step 3: Verify in the app:** user with interests sees ≤10 cards with reasons; Track a card → it disappears from the row; Edit interests → save → row refreshes (invalidate `['recommendations']` on save); signed-out and no-interest states render; check 375px width has no horizontal scroll.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm test && pnpm build` → all PASS.
- [ ] **Step 5: Commit** `feat: recommended bills row on Find Bills`.

### Task 9: PR

- [ ] **Step 1:** `pnpm typecheck && pnpm test && pnpm build` → all PASS.
- [ ] **Step 2:** Push and open the PR with `--base dev`. Description: Summary, then QA steps per CLAUDE.md — setup (`pnpm migrate:up`; a fresh account and an existing one, both start non-onboarded), tour→picker sequence, settings edit, Find Bills row (with interests, without, signed out), tracking removes from row, mobile width, edge cases (keyword `100%`, removed topic id).
- [ ] **Step 3:** Run the Codex review loop from CLAUDE.md until clean.
