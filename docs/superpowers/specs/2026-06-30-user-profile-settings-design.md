# User Profile Settings Menu — Design

**Date:** 2026-06-30
**Branch:** `feat/ai-opt-in`
**Status:** Approved

## Goal

Give logged-in users a settings menu, reachable from a settings icon in the header,
that stores two per-user preferences:

1. **AI opt-in** — whether the user opts into AI-assisted features (bill summaries,
   testimony assistance). Default **OFF** (true opt-in). Must present clear verbiage
   about what the AI does and how models are hosted.
2. **Kanban detailed view** — whether the kanban board shows detailed cards.
   Default **OFF** (simplified cards are the current/default look; ON = detailed).

## Scope

**In scope**
- `user_preferences` table + migration (up/down).
- `db/queries/user-preferences.ts` — source-of-truth queries.
- Data-client wiring: action arm, API route + fetch arm, `data.preferences` domain.
- Auth-context: load `preferences` on session, expose `updatePreferences`.
- Header: standalone settings gear icon (desktop) + entry in the mobile hamburger menu.
- `settings-dialog.tsx` — modal with two toggles + inline AI consent copy.
- One pure-logic unit test for the defaults helper.

**Out of scope (follow-up work)**
- Actually gating AI feature entry points on `ai_opt_in` (hiding/disabling AI actions).
- Actually changing kanban card density based on `kanban_detailed_view`.

This build **stores and persists** both settings and provides the full menu UI. Wiring the
settings into runtime behavior is deliberately deferred.

## Decisions (from brainstorming)

- **Storage:** dedicated `user_preferences` table (not columns on `user`, not localStorage).
- **AI default:** OFF (opt-in).
- **Detailed-view default:** OFF (simplified is the current default look).
- **AI consent presentation:** inline expandable details inside the settings dialog.
- **Menu form:** modal dialog (consistent with `InviteUserDialog` etc.).
- **Icon placement:** standalone gear icon in the header, left of the avatar; mirrored in
  the mobile hamburger menu.
- **Wire-up scope:** store now, wire runtime behavior later.
- **Extra settings:** none for now — table + dialog designed to extend easily.

## 1. Data model

New migration `000022_create_user_preferences_table` (`.up.sql` / `.down.sql`).

```sql
-- up
CREATE TABLE user_preferences (
  user_id              UUID PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  ai_opt_in            BOOLEAN NOT NULL DEFAULT false,
  kanban_detailed_view BOOLEAN NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
```

```sql
-- down
DROP TABLE IF EXISTS user_preferences;
```

- One row per user, PK = FK to `"user"(id)` (quoted, singular — matches existing migrations),
  UUID, `ON DELETE CASCADE`.
- **Rows created lazily** via upsert on first save. No backfill of existing users.
- A **missing row means defaults** (AI off, simplified view). The read path applies defaults.
- After migrating, regenerate `src/db/types.ts` so `UserPreferences` + the `DB` interface
  include the new table (follow the project's existing type-generation process; if generation
  is manual, add the interface by hand to match the pattern of `UserBillPreferences`).

## 2. Data access layer

Follows the CLAUDE.md pattern: `db/queries` (source of truth) → action arm → fetch arm →
`data.*` domain. Users always operate on **their own** preferences; `userId` comes from the
session, never a caller param. No tenant scoping, no per-op transport override.

### 2.1 `src/db/queries/user-preferences.ts`
- `getUserPreferences(userId: string): Promise<UserPreferences>` — selects the row; if none,
  returns the defaults object (via the pure helper in §5). Always returns a fully-populated
  object.
- `updateUserPreferences(userId: string, patch: Partial<UserPreferencesPatch>): Promise<UserPreferences>`
  — `INSERT ... ON CONFLICT (user_id) DO UPDATE SET <patched fields>, updated_at = now()`
  RETURNING the full row. `patch` may contain `ai_opt_in` and/or `kanban_detailed_view`.

A shared type module (plain, non-`'use server'`) — e.g. `src/types/preferences.ts` — exports the
client-facing `UserPreferences` shape:
```ts
export interface UserPreferences {
  ai_opt_in: boolean;
  kanban_detailed_view: boolean;
}
```
(Timestamps stay server-side; the client shape carries only the two booleans.)

### 2.2 Action arm — `src/app/actions/preferences.ts`
- `'use server'`; exports only async functions.
- `getPreferences(): Promise<ActionResult<UserPreferences>>` — `requireSession.fromAction()`,
  calls `getUserPreferences(session.user.id)`.
- `updatePreferences(patch): Promise<ActionResult<UserPreferences>>` — `requireSession.fromAction()`,
  calls `updateUserPreferences(session.user.id, patch)`.
- Guard errors wrapped in `ActionResult` per existing convention.

### 2.3 Route + fetch arm
- `src/app/api/preferences/route.ts`:
  - `GET` — `requireSession.fromRequest(request)`, returns the prefs envelope.
  - `PATCH` — `requireSession.fromRequest(request)`, body = patch, returns updated prefs.
- `src/lib/data-client/preferences.client.ts` — fetch wrappers hitting the route with
  **relative URLs** (client-side only), returning the already-unwrapped `UserPreferences`.

### 2.4 Domain registration
- New `data.preferences` domain via `defineClient`, ops `{ get, update }`, each pairing the
  `{ action, fetch }` arms (identical params + identical unwrapped return, per the contract).
- Register in `@/lib/data-client` alongside `bills`, `proposals`, `access`.

## 3. Auth context integration

`src/hooks/contexts/auth-context.tsx`:
- Extend `AuthContextType` with:
  - `preferences: UserPreferences | null`
  - `updatePreferences: (patch: Partial<UserPreferences>) => Promise<void>`
- On session resolve (`checkSession`, after `user` is set): call `data.preferences.get()` and
  store the result. On logout / no user: set `preferences` to `null`.
- `updatePreferences(patch)`: call `data.preferences.update(patch)`, then set context state to
  the returned prefs (optimistic UI; on error, surface a toast and leave prior state).
- Public/logged-out users get `preferences: null`.

Any component reads `const { preferences, updatePreferences } = useAuth()`. No prop drilling.

## 4. UI

### 4.1 Header — settings gear
`src/components/main/header.tsx`:
- Add a standalone gear icon button (`Settings` from `lucide-react`) in the desktop
  right-hand cluster, **left of `<AuthHeader />`** (around lines 76–86).
- Rendered only when `user` is present.
- Styling matches the existing white/10 ghost treatment used for header controls.
- Clicking opens the settings dialog (local `open` state in the header, or a small
  wrapper component owning the state).

`src/components/main/mobile-hamburger-menu.tsx`:
- Add a "Settings" entry that opens the same dialog, so mobile users can reach it.

### 4.2 Settings dialog — `src/components/settings/settings-dialog.tsx`
- New `settings/` component directory (matches the "grouped by area" convention).
- shadcn `Dialog`, controlled `open` / `onOpenChange` from the caller (consistent with
  `InviteUserDialog`).
- Title: **"Settings"**.
- **AI Features section:**
  - `Switch` labeled "Enable AI features", bound to `preferences.ai_opt_in`.
  - One-line summary beneath the switch.
  - Inline expandable (shadcn `Collapsible` or `Accordion`): "What does AI do & how are
    models hosted?" containing the consent copy (§5).
- **Board Display section:**
  - `Switch` labeled "Detailed kanban cards", bound to `preferences.kanban_detailed_view`.
  - One-line description: "Show more detail on each bill card. Off = simplified cards."
- Each switch's `onCheckedChange` calls `updatePreferences({ ... })` immediately
  (optimistic; toast on failure). **No explicit Save button** — toggles persist on change.
- When `preferences` is `null` (still loading), show the switches in a disabled/loading state.

## 5. AI consent copy

Listed features under the personal opt-in: **Bill summaries** and **Testimony assistance**
only. **Bill classification is intentionally omitted** — it currently runs at system/org
level regardless of this personal toggle, and this build does not wire the toggle to it.

The hosting / model-training paragraph is **user-authored**. In the component, mark it with:
```
{/* PLACEHOLDER: user-provided copy about the specific models used and how they are hosted */}
```
Suggested default (overwrite with your own verbiage):

> **How Food+ uses AI**
>
> When enabled, AI helps you work faster on food-related legislation:
> - **Bill summaries** — plain-language summaries of long or complex bills.
> - **Testimony assistance** — drafting help and suggestions for written testimony.
>
> **How our models are hosted**
>
> _[PLACEHOLDER — user to provide: which models are used and how they are hosted.]_
>
> AI output can be inaccurate — always review before relying on it or submitting testimony.
> You can turn this off at any time.

## 6. Defaults helper (the one pure unit)

`src/lib/preferences.ts`:
```ts
export const DEFAULT_PREFERENCES: UserPreferences = {
  ai_opt_in: false,
  kanban_detailed_view: false,
};

export function applyPreferenceDefaults(
  row: Partial<UserPreferences> | null | undefined
): UserPreferences {
  return { ...DEFAULT_PREFERENCES, ...(row ?? {}) };
}
```
Used by `getUserPreferences` (missing row → defaults) and safe to reuse client-side.

## 7. Testing & verification

- **Unit test** `src/lib/__tests__/preferences.test.ts` (pure, no DB):
  - `applyPreferenceDefaults(null)` → both `false`.
  - `applyPreferenceDefaults({ ai_opt_in: true })` → `ai_opt_in: true`, `kanban_detailed_view: false`.
  - full row passes through unchanged.
- **No DB/action tests** (consistent with the codebase — none exist for other domains).
- **Verification commands (all must pass):**
  - `npm run typecheck`
  - `npm run build` (catches `'use server'` export violations)
  - `npm test`
  - Manual smoke: `npm run migrate:up` then `npm run migrate:down` round-trips cleanly.

## File manifest

New:
- `src/db/migrations/000022_create_user_preferences_table.up.sql`
- `src/db/migrations/000022_create_user_preferences_table.down.sql`
- `src/db/queries/user-preferences.ts`
- `src/types/preferences.ts`
- `src/lib/preferences.ts`
- `src/app/actions/preferences.ts`
- `src/app/api/preferences/route.ts`
- `src/lib/data-client/preferences.client.ts`
- `src/components/settings/settings-dialog.tsx`
- `src/lib/__tests__/preferences.test.ts`

Modified:
- `src/db/types.ts` (add `UserPreferences` + `DB` entry)
- `src/lib/data-client/index.ts` (register `data.preferences`)
- `src/hooks/contexts/auth-context.tsx` (load + expose preferences)
- `src/components/main/header.tsx` (gear icon)
- `src/components/main/mobile-hamburger-menu.tsx` (settings entry)
