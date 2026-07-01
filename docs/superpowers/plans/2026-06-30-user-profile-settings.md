# User Profile Settings Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a header settings menu that stores two per-user preferences — AI feature opt-in (default off) and kanban detailed-view (default off) — persisted in a new `user_preferences` table.

**Architecture:** Follows the codebase's data-access seam: `db/queries` (source of truth) → server-action arm + API-route/fetch arm → `data.preferences` domain via `defineClient`. Preferences load into `auth-context` on session and are edited from a modal `settings-dialog` opened by a header gear icon. Runtime behavior (gating AI, changing card density) is deferred.

**Tech Stack:** Next.js 15 App Router, TypeScript, Kysely/PostgreSQL, shadcn/ui (Dialog, Switch, Accordion, Label), Vitest.

## Global Constraints

- **Kysely only, no raw SQL** in query code; all DB access lives in `src/db/queries/*`.
- **Transport arms return the already-unwrapped value and throw on error** — NOT `ActionResult`/envelope wrappers. (Match `src/app/actions/access.ts` + `src/lib/data-client/access.client.ts`; the data-client is the one place envelopes are unwrapped, and here the arms simply return raw values.)
- **`'use server'` files export only async functions** — no type exports, no re-exports.
- **`src/lib/` is DB-free.**
- **Auth via guards:** `requireSession.fromAction()` (no args, returns `{ user }`) in actions; `requireSession.fromRequest(request)` in routes. Never hand-roll the cookie→session preamble.
- **User table is `"user"` (quoted, singular), `id` is UUID.**
- **Users always operate on their OWN preferences** — `userId` comes from the session, never a caller param. No tenant scoping.
- **AI opt-in default `false`; kanban_detailed_view default `false`.**
- **AI consent copy:** list only *Bill summaries* and *Testimony assistance*. OMIT bill classification. The hosting/model paragraph is a user-authored PLACEHOLDER — do not assert hosting facts.
- **Tests are pure-logic only** in `src/lib/__tests__/` (no DB, no mocking).
- **Commit style:** prefixes `feat:`/`fix:`/`refactor:`/`docs:`; NO `Co-Authored-By` lines.
- Reference spec: `docs/superpowers/specs/2026-06-30-user-profile-settings-design.md`.

---

### Task 1: Migration + DB types + shared type + defaults helper (with test)

**Files:**
- Create: `src/db/migrations/000022_create_user_preferences_table.up.sql`
- Create: `src/db/migrations/000022_create_user_preferences_table.down.sql`
- Create: `src/types/preferences.ts`
- Create: `src/lib/preferences.ts`
- Create: `src/lib/__tests__/preferences.test.ts`
- Modify: `src/db/types.ts` (add `UserPreferences` interface + `user_preferences` entry on the `DB` interface)

**Interfaces:**
- Produces:
  - `UserPreferences` (client shape) in `src/types/preferences.ts`:
    ```ts
    export interface UserPreferences {
      ai_opt_in: boolean;
      kanban_detailed_view: boolean;
    }
    ```
  - `DEFAULT_PREFERENCES: UserPreferences` and `applyPreferenceDefaults(row): UserPreferences` in `src/lib/preferences.ts`.
  - DB row type `UserPreferences` (Kysely, with timestamps) in `src/db/types.ts` — NOTE this collides in name with the client type but lives in a different module; import the DB one from `@/db/types` and the client one from `@/types/preferences`.

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/preferences.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { applyPreferenceDefaults, DEFAULT_PREFERENCES } from '@/lib/preferences';

describe('applyPreferenceDefaults', () => {
  it('returns all-false defaults for null', () => {
    expect(applyPreferenceDefaults(null)).toEqual({
      ai_opt_in: false,
      kanban_detailed_view: false,
    });
  });

  it('returns defaults for undefined', () => {
    expect(applyPreferenceDefaults(undefined)).toEqual(DEFAULT_PREFERENCES);
  });

  it('fills missing fields from a partial row', () => {
    expect(applyPreferenceDefaults({ ai_opt_in: true })).toEqual({
      ai_opt_in: true,
      kanban_detailed_view: false,
    });
  });

  it('passes a full row through unchanged', () => {
    const full = { ai_opt_in: true, kanban_detailed_view: true };
    expect(applyPreferenceDefaults(full)).toEqual(full);
  });

  it('does not mutate the input', () => {
    const input = { ai_opt_in: true };
    applyPreferenceDefaults(input);
    expect(input).toEqual({ ai_opt_in: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- preferences`
Expected: FAIL — cannot resolve `@/lib/preferences`.

- [ ] **Step 3: Create the shared client type**

`src/types/preferences.ts`:
```ts
export interface UserPreferences {
  ai_opt_in: boolean;
  kanban_detailed_view: boolean;
}
```

- [ ] **Step 4: Create the defaults helper**

`src/lib/preferences.ts`:
```ts
import type { UserPreferences } from '@/types/preferences';

export const DEFAULT_PREFERENCES: UserPreferences = {
  ai_opt_in: false,
  kanban_detailed_view: false,
};

/** Fills any missing preference fields with defaults. Never mutates input. */
export function applyPreferenceDefaults(
  row: Partial<UserPreferences> | null | undefined,
): UserPreferences {
  return { ...DEFAULT_PREFERENCES, ...(row ?? {}) };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- preferences`
Expected: PASS (5 tests).

- [ ] **Step 6: Write the migration files**

`src/db/migrations/000022_create_user_preferences_table.up.sql`:
```sql
CREATE TABLE user_preferences (
  user_id              UUID PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  ai_opt_in            BOOLEAN NOT NULL DEFAULT false,
  kanban_detailed_view BOOLEAN NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
```

`src/db/migrations/000022_create_user_preferences_table.down.sql`:
```sql
DROP TABLE IF EXISTS user_preferences;
```

- [ ] **Step 7: Add the Kysely DB type**

In `src/db/types.ts`, add this interface near `UserBillPreferences` (mirror its style — use `Generated<>` for defaulted/timestamp columns; check the file's existing imports for `Generated` and `Timestamp`):
```ts
export interface UserPreferences {
  user_id: string;
  ai_opt_in: Generated<boolean>;
  kanban_detailed_view: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}
```
And add to the `DB` interface (alphabetically consistent with siblings like `user_bill_preferences`, `user_bills`):
```ts
  user_preferences: UserPreferences;
```

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 9: Verify migration round-trips**

Run: `npm run migrate:up`
Expected: applies `000022` cleanly.
Run: `npm run migrate:down`
Expected: rolls back cleanly.
Run: `npm run migrate:up`
Expected: re-applies cleanly (leave it applied).

> If the local DB is unavailable, note that in the report as unverified rather than skipping silently.

- [ ] **Step 10: Commit**

```bash
git add src/db/migrations/000022_create_user_preferences_table.up.sql src/db/migrations/000022_create_user_preferences_table.down.sql src/types/preferences.ts src/lib/preferences.ts src/lib/__tests__/preferences.test.ts src/db/types.ts
git commit -m "feat: add user_preferences table, types, and defaults helper"
```

---

### Task 2: Query layer

**Files:**
- Create: `src/db/queries/user-preferences.ts`

**Interfaces:**
- Consumes: `db` from `@/db/kysely/client`; `applyPreferenceDefaults` from `@/lib/preferences`; `UserPreferences` (client shape) from `@/types/preferences`.
- Produces:
  - `getUserPreferences(userId: string): Promise<UserPreferences>`
  - `updateUserPreferences(userId: string, patch: Partial<UserPreferences>): Promise<UserPreferences>`

- [ ] **Step 1: Write the query file**

`src/db/queries/user-preferences.ts`:
```ts
'use server';

import { db } from '@/db/kysely/client';
import { applyPreferenceDefaults } from '@/lib/preferences';
import type { UserPreferences } from '@/types/preferences';

/**
 * Returns the user's preferences, applying defaults when no row exists.
 * Always returns a fully-populated object.
 */
export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const row = await db
    .selectFrom('user_preferences')
    .select(['ai_opt_in', 'kanban_detailed_view'])
    .where('user_id', '=', userId)
    .executeTakeFirst();

  return applyPreferenceDefaults(row ?? null);
}

/**
 * Upserts the user's preferences with the given patch and returns the full,
 * defaults-applied preferences. Only known boolean fields are written.
 */
export async function updateUserPreferences(
  userId: string,
  patch: Partial<UserPreferences>,
): Promise<UserPreferences> {
  // Whitelist the writable fields so callers can't inject arbitrary columns.
  const writable: Partial<UserPreferences> = {};
  if (typeof patch.ai_opt_in === 'boolean') writable.ai_opt_in = patch.ai_opt_in;
  if (typeof patch.kanban_detailed_view === 'boolean') {
    writable.kanban_detailed_view = patch.kanban_detailed_view;
  }

  await db
    .insertInto('user_preferences')
    .values({
      user_id: userId,
      ...writable,
      updated_at: new Date(),
    })
    .onConflict((oc) =>
      oc.column('user_id').doUpdateSet({
        ...writable,
        updated_at: new Date(),
      }),
    )
    .execute();

  return getUserPreferences(userId);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (If Kysely complains that `values` requires all non-generated columns, confirm `user_id` is present — it is; the other columns have DB defaults / are `Generated<>`.)

- [ ] **Step 3: Commit**

```bash
git add src/db/queries/user-preferences.ts
git commit -m "feat: add user-preferences query layer"
```

---

### Task 3: Action arm + API route + fetch arm + domain registration

**Files:**
- Create: `src/app/actions/preferences.ts`
- Create: `src/app/api/preferences/route.ts`
- Create: `src/lib/data-client/preferences.client.ts`
- Modify: `src/lib/data-client/index.ts`

**Interfaces:**
- Consumes: `getUserPreferences`, `updateUserPreferences` from `@/db/queries/user-preferences`; `requireSession` from `@/lib/auth-guards`; `defineClient` from `./define-client`; `UserPreferences` from `@/types/preferences`.
- Produces:
  - Actions `getPreferencesAction()`, `updatePreferencesAction(patch)` — return raw `UserPreferences`, throw on error.
  - `preferencesClient` with ops `get()` and `update(patch)` returning `UserPreferences`.
  - `data.preferences` registered on the exported `data` object.

- [ ] **Step 1: Write the action arm**

`src/app/actions/preferences.ts`:
```ts
'use server';

import { requireSession } from '@/lib/auth-guards';
import {
  getUserPreferences,
  updateUserPreferences,
} from '@/db/queries/user-preferences';
import type { UserPreferences } from '@/types/preferences';

/** Server-action arm for data.preferences.get. Returns the caller's own prefs. */
export async function getPreferencesAction(): Promise<UserPreferences> {
  const { user } = await requireSession.fromAction();
  return getUserPreferences(user.id);
}

/** Server-action arm for data.preferences.update. Patches the caller's own prefs. */
export async function updatePreferencesAction(
  patch: Partial<UserPreferences>,
): Promise<UserPreferences> {
  const { user } = await requireSession.fromAction();
  return updateUserPreferences(user.id, patch);
}
```

- [ ] **Step 2: Write the API route**

`src/app/api/preferences/route.ts` (mirror the error handling in `src/app/api/access/request-admin/route.ts` — guard throws map via `error?.statusCode`):
```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth-guards';
import {
  getUserPreferences,
  updateUserPreferences,
} from '@/db/queries/user-preferences';

// Fetch arm for data.preferences.get — returns the logged-in user's prefs.
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireSession.fromRequest(request);
    const prefs = await getUserPreferences(user.id);
    return NextResponse.json(prefs);
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Get preferences error:', error);
    return NextResponse.json({ error: 'Failed to load preferences' }, { status: 500 });
  }
}

// Fetch arm for data.preferences.update — patches the logged-in user's prefs.
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireSession.fromRequest(request);
    const body = await request.json().catch(() => ({}));
    const patch: { ai_opt_in?: boolean; kanban_detailed_view?: boolean } = {};
    if (typeof body.ai_opt_in === 'boolean') patch.ai_opt_in = body.ai_opt_in;
    if (typeof body.kanban_detailed_view === 'boolean') {
      patch.kanban_detailed_view = body.kanban_detailed_view;
    }
    const prefs = await updateUserPreferences(user.id, patch);
    return NextResponse.json(prefs);
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Update preferences error:', error);
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Write the fetch arm + client**

`src/lib/data-client/preferences.client.ts` (mirror `access.client.ts`):
```ts
import { defineClient } from './define-client';
import {
  getPreferencesAction,
  updatePreferencesAction,
} from '@/app/actions/preferences';
import type { UserPreferences } from '@/types/preferences';

// ---- fetch arm (hits /api/preferences) ----

async function getPreferencesFetch(): Promise<UserPreferences> {
  const res = await fetch('/api/preferences');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load preferences');
  }
  return res.json();
}

async function updatePreferencesFetch(
  patch: Partial<UserPreferences>,
): Promise<UserPreferences> {
  const res = await fetch('/api/preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update preferences');
  }
  return res.json();
}

export const preferencesClient = defineClient('preferences', {
  get: { action: getPreferencesAction, fetch: getPreferencesFetch },
  update: { action: updatePreferencesAction, fetch: updatePreferencesFetch },
});
```

- [ ] **Step 4: Register the domain**

In `src/lib/data-client/index.ts`, add the import and the `preferences` entry:
```ts
import { preferencesClient } from './preferences.client';
```
and inside the `data` object:
```ts
  preferences: preferencesClient,
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS. `defineClient` structurally requires the fetch arm to match the action arm's signature — a mismatch surfaces here.

- [ ] **Step 6: Build (catches `'use server'` export violations)**

Run: `npm run build`
Expected: succeeds. If it complains that `preferences.ts` exports a non-async value, ensure it exports only the two async functions.

- [ ] **Step 7: Commit**

```bash
git add src/app/actions/preferences.ts src/app/api/preferences/route.ts src/lib/data-client/preferences.client.ts src/lib/data-client/index.ts
git commit -m "feat: wire data.preferences action + fetch transports"
```

---

### Task 4: Auth-context integration

**Files:**
- Modify: `src/hooks/contexts/auth-context.tsx`

**Interfaces:**
- Consumes: `data` from `@/lib/data-client`; `UserPreferences` from `@/types/preferences`.
- Produces (on the `useAuth()` context): `preferences: UserPreferences | null`, `updatePreferences(patch: Partial<UserPreferences>): Promise<void>`.

- [ ] **Step 1: Add imports and type fields**

At the top of `src/hooks/contexts/auth-context.tsx`, add:
```ts
import { data } from '@/lib/data-client';
import type { UserPreferences } from '@/types/preferences';
```
In `interface AuthContextType`, add after the auth actions block:
```ts
  // User preferences
  preferences: UserPreferences | null;
  updatePreferences: (patch: Partial<UserPreferences>) => Promise<void>;
```

- [ ] **Step 2: Add state**

Inside `AuthProvider`, near the other `useState` calls:
```ts
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
```

- [ ] **Step 3: Load preferences on session resolve**

In `checkSession`, inside the `if (data.user) { ... }` branch (after `setUser(data.user)` and the membership calls), load prefs; clear them everywhere the user is cleared. Note the local variable in `checkSession` is named `data` (the JSON response) — this SHADOWS the imported `data` client. Rename the import usage by importing the client under an alias to avoid the collision:

Change the import in Step 1 to:
```ts
import { data as dataClient } from '@/lib/data-client';
```
Then in the `if (data.user)` success branch add:
```ts
          try {
            const prefs = await dataClient.preferences.get();
            setPreferences(prefs);
          } catch (e) {
            console.error('Failed to load preferences:', e);
            setPreferences(null);
          }
```
In every branch that calls `setUser(null)` (the `else`, the outer `else`, and the `catch`), also add:
```ts
        setPreferences(null);
```

- [ ] **Step 4: Load preferences on login; clear on logout**

In `login`, inside the `if (response.ok)` branch after `initializeTenant(membershipList);`, add the same prefs-load block:
```ts
        try {
          const prefs = await dataClient.preferences.get();
          setPreferences(prefs);
        } catch (e) {
          console.error('Failed to load preferences:', e);
          setPreferences(null);
        }
```
In `logout`, after `setActiveTenantState(null);`, add:
```ts
      setPreferences(null);
```

- [ ] **Step 5: Add the updatePreferences action**

Add this callback in `AuthProvider` (before the `return`):
```ts
  const updatePreferences = useCallback(async (patch: Partial<UserPreferences>) => {
    const updated = await dataClient.preferences.update(patch);
    setPreferences(updated);
  }, []);
```

- [ ] **Step 6: Expose in the provider value**

In the `<AuthContext.Provider value={{ ... }}>` object, add:
```ts
      preferences,
      updatePreferences,
```

- [ ] **Step 7: Typecheck + build**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm run build`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/contexts/auth-context.tsx
git commit -m "feat: load and expose user preferences in auth context"
```

---

### Task 5: Settings dialog component

**Files:**
- Create: `src/components/settings/settings-dialog.tsx`

**Interfaces:**
- Consumes: `useAuth()` (`preferences`, `updatePreferences`); shadcn `Dialog`, `Switch`, `Label`, `Accordion` from `@/components/ui/*`; `toast` from `@/hooks/use-toast`.
- Produces: `<SettingsDialog open onOpenChange />` — controlled dialog. Props:
  ```ts
  interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }
  ```

- [ ] **Step 1: Inspect the shadcn primitives**

Before writing, open `src/components/ui/dialog.tsx`, `switch.tsx`, `accordion.tsx`, and `label.tsx` to confirm the exact exported names and required props (e.g. Accordion needs `type="single" collapsible`; each item needs a `value`). Use exactly what those files export.

- [ ] **Step 2: Write the component**

`src/components/settings/settings-dialog.tsx`:
```tsx
'use client';

import { useAuth } from '@/hooks/contexts/auth-context';
import { toast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import type { UserPreferences } from '@/types/preferences';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { preferences, updatePreferences } = useAuth();
  const loading = preferences === null;

  const handleToggle = async (patch: Partial<UserPreferences>) => {
    try {
      await updatePreferences(patch);
    } catch (e) {
      console.error('Failed to update preferences:', e);
      toast({
        title: 'Could not save setting',
        description: 'Please try again.',
        variant: 'destructive',
        duration: 5000,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Manage your personal preferences.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6 py-2">
          {/* AI Features */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="ai-opt-in" className="text-sm font-medium">
                Enable AI features
              </Label>
              <Switch
                id="ai-opt-in"
                disabled={loading}
                checked={preferences?.ai_opt_in ?? false}
                onCheckedChange={(checked) => handleToggle({ ai_opt_in: checked })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Turn on AI-assisted summaries and testimony help. Off by default.
            </p>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="ai-info" className="border-b-0">
                <AccordionTrigger className="text-xs py-2">
                  What does AI do &amp; how are models hosted?
                </AccordionTrigger>
                <AccordionContent className="text-xs text-muted-foreground space-y-2">
                  <p className="font-medium text-foreground">When enabled, AI helps you:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>
                      <span className="font-medium">Bill summaries</span> — plain-language
                      summaries of long or complex bills.
                    </li>
                    <li>
                      <span className="font-medium">Testimony assistance</span> — drafting
                      help and suggestions for written testimony.
                    </li>
                  </ul>
                  {/* PLACEHOLDER: user-provided copy about the specific models used and how they are hosted. */}
                  <p className="font-medium text-foreground pt-1">How our models are hosted</p>
                  <p>
                    [PLACEHOLDER — replace with your own description of which models are
                    used and how they are hosted.]
                  </p>
                  <p>
                    AI output can be inaccurate — always review before relying on it or
                    submitting testimony. You can turn this off at any time.
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </section>

          {/* Board Display */}
          <section className="flex flex-col gap-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="detailed-view" className="text-sm font-medium">
                Detailed kanban cards
              </Label>
              <Switch
                id="detailed-view"
                disabled={loading}
                checked={preferences?.kanban_detailed_view ?? false}
                onCheckedChange={(checked) =>
                  handleToggle({ kanban_detailed_view: checked })
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Show more detail on each bill card. Off = simplified cards.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm run build`
Expected: succeeds. If any shadcn import name is wrong (Step 1), fix to match the actual exports.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/settings-dialog.tsx
git commit -m "feat: add settings dialog with AI opt-in and detailed-view toggles"
```

---

### Task 6: Header gear icon + mobile menu entry

**Files:**
- Modify: `src/components/main/header.tsx`
- Modify: `src/components/main/mobile-hamburger-menu.tsx`

**Interfaces:**
- Consumes: `SettingsDialog` from `@/components/settings/settings-dialog`; `Settings` icon from `lucide-react`; existing `useAuth()` (`user`).

- [ ] **Step 1: Add the gear to the desktop header**

In `src/components/main/header.tsx`:
- Add `Settings` to the `lucide-react` import (line 4): `import { KanbanSquareIcon, Search, Settings, Table, Users2Icon } from 'lucide-react';`
- Add local state + import `useState` and the dialog:
  ```ts
  import { useState } from 'react';
  import { SettingsDialog } from '@/components/settings/settings-dialog';
  ```
  ```ts
  const [settingsOpen, setSettingsOpen] = useState(false);
  ```
- In the desktop right-hand cluster (the `hidden md:flex ... ml-auto` div, ~lines 76-86), add a gear button just before `<AuthHeader />`, rendered only when `user` is present:
  ```tsx
          {user && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Open settings"
              className="flex items-center justify-center rounded-md p-2 text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            >
              <Settings className="h-5 w-5" />
            </button>
          )}
  ```
- Render the dialog once, just before the closing `</>` of the component's return (after `</header>`):
  ```tsx
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
  ```

- [ ] **Step 2: Add a Settings entry to the mobile menu**

In `src/components/main/mobile-hamburger-menu.tsx`:
- Add to the `lucide-react` import: `Settings`.
- Add: `import { useState } from 'react';` and `import { SettingsDialog } from '@/components/settings/settings-dialog';`
- Add state: `const [settingsOpen, setSettingsOpen] = useState(false);`
- In the `{!isPublic && (...)}` region (near the Export CSV block, ~lines 86-95), add a settings button that opens the dialog:
  ```tsx
          {!isPublic && (
            <div className="border-t pt-3">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings className="h-4 w-4" /> Settings
              </Button>
            </div>
          )}
  ```
- Render the dialog once inside the component's returned JSX (place it as a sibling of the `<Popover>` — wrap the existing return in a fragment if needed):
  ```tsx
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
  ```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Full test suite**

Run: `npm test`
Expected: all tests pass (including `preferences` from Task 1).

- [ ] **Step 5: Commit**

```bash
git add src/components/main/header.tsx src/components/main/mobile-hamburger-menu.tsx
git commit -m "feat: add settings gear to header and mobile menu"
```

---

## Notes for the executor

- The name `UserPreferences` intentionally exists in two modules: the Kysely DB row type (`@/db/types`, with timestamps + `Generated<>`) and the client shape (`@/types/preferences`, two booleans). Import from the correct module per file. Query code returns the client shape.
- Do NOT wire runtime behavior (AI gating, card density) — that is out of scope for this plan.
- The AI hosting paragraph is a deliberate PLACEHOLDER; leave it as-is for the user to fill.
