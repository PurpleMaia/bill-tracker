# Kanban Search Bar + Header Layout Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the server-round-trip bill search with an instant client-side ranked/fuzzy search, move the search bar into the kanban header, and refactor the app header into three zones (title left, contextual sub-nav center, plain nav links right).

**Architecture:** A pure, generic search module in `src/lib/bill-search.ts` (tiered scoring + bounded Levenshtein) is consumed synchronously via `useMemo` by both the kanban board and spreadsheet. The app header centers a pathname-switched `HeaderSubNav` (hosting `ViewToggle` on `/`) and right-aligns `HeaderNav` restyled as underlined text links.

**Tech Stack:** Next.js 15 App Router, TypeScript, shadcn/ui, Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-07-02-kanban-search-bar-design.md`
**Branch:** `feat/kanban-search-bar` (based on `feat/header-nav-tabs`)

## Global Constraints

- `src/lib/` stays DB-free; the search module is pure and synchronous.
- Never `git add -A` or `git add .` — the working tree has an unrelated user edit to `scripts/migrations/migrate.sh` that must NOT be committed. Add files by exact path only.
- The server-side `searchBills` in `src/db/queries/bills-read.ts` is deleted (it's a query function, not an API route).
- Fuzzy bounds: edit distance ≤ 1 for query tokens of 5–8 letters, ≤ 2 for 9+, none for ≤ 4 letters.
- Shortened nav labels: `Search`, `Your Bills`, `Testimonies`, `Active Boards`.
- Commit prefixes `feat:`/`refactor:`; NO `Co-Authored-By` lines.
- Verification: `npm test`, `npm run typecheck`, `npm run build` after each task touching multiple files.

---

### Task 1: Pure search module `bill-search.ts` (TDD)

**Files:**
- Create: `src/lib/bill-search.ts`
- Test: `src/lib/__tests__/bill-search.test.ts`

**Interfaces:**
- Produces: `searchBillsLocal<T extends SearchableBill>(bills: T[], query: string): T[]` where `SearchableBill = { id: string; bill_number: string; bill_title: string; description: string }`. Returns matches ordered best-first; empty/whitespace query returns the input array unchanged. Tasks 2–3 call it with `Bill[]`.

- [ ] **Step 1: Write the failing tests**

`src/lib/__tests__/bill-search.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { searchBillsLocal, type SearchableBill } from '../bill-search';

function bill(over: Partial<SearchableBill> & { id: string }): SearchableBill {
  return { bill_number: 'XX0', bill_title: '', description: '', ...over };
}

describe('searchBillsLocal', () => {
  it('returns the input array unchanged for empty and whitespace queries', () => {
    const bills = [bill({ id: 'a' }), bill({ id: 'b' })];
    expect(searchBillsLocal(bills, '')).toEqual(bills);
    expect(searchBillsLocal(bills, '   ')).toEqual(bills);
  });

  it('matches bill numbers case-insensitively', () => {
    const bills = [bill({ id: 'a', bill_number: 'SB123' })];
    expect(searchBillsLocal(bills, 'sb123')).toHaveLength(1);
    expect(searchBillsLocal(bills, 'SB123')).toHaveLength(1);
  });

  it('normalizes spaces and hyphens in bill-number queries', () => {
    const bills = [bill({ id: 'a', bill_number: 'SB123' }), bill({ id: 'b', bill_number: 'HB99' })];
    expect(searchBillsLocal(bills, 'sb 123').map(b => b.id)).toEqual(['a']);
    expect(searchBillsLocal(bills, 'sb-123').map(b => b.id)).toEqual(['a']);
  });

  it('ranks number matches above title matches above description matches', () => {
    const bills = [
      bill({ id: 'desc', description: 'relates to 123 farms' }),
      bill({ id: 'title', bill_title: 'Act 123 revision' }),
      bill({ id: 'num', bill_number: 'SB123' }),
    ];
    expect(searchBillsLocal(bills, '123').map(b => b.id)).toEqual(['num', 'title', 'desc']);
  });

  it('requires every token to match (AND semantics)', () => {
    const bills = [
      bill({ id: 'both', bill_title: 'water rights protection' }),
      bill({ id: 'water-only', bill_title: 'water quality' }),
    ];
    expect(searchBillsLocal(bills, 'water rights').map(b => b.id)).toEqual(['both']);
  });

  it('tolerates one typo for tokens of 5-8 letters', () => {
    const bills = [bill({ id: 'a', bill_title: 'clean water act' })];
    expect(searchBillsLocal(bills, 'watter')).toHaveLength(1); // 1 edit from "water"
  });

  it('tolerates two typos for tokens of 9+ letters', () => {
    const bills = [bill({ id: 'a', bill_title: 'agriculture funding' })];
    expect(searchBillsLocal(bills, 'agricultre')).toHaveLength(1);  // 1 edit
    expect(searchBillsLocal(bills, 'agrecultre')).toHaveLength(1);  // 2 edits
  });

  it('gives no fuzz to tokens of 4 letters or fewer', () => {
    const bills = [bill({ id: 'a', bill_title: 'water bill' })];
    expect(searchBillsLocal(bills, 'watr')).toHaveLength(0);
  });

  it('ignores punctuation attached to words when fuzzy matching', () => {
    const bills = [bill({ id: 'a', description: 'funding for agriculture, farms and food' })];
    expect(searchBillsLocal(bills, 'agricultre')).toHaveLength(1);
  });

  it('excludes bills where any token fails to match', () => {
    const bills = [bill({ id: 'a', bill_title: 'water quality' })];
    expect(searchBillsLocal(bills, 'water zoning')).toHaveLength(0);
  });

  it('keeps input order for equally-scored bills (stable)', () => {
    const bills = [
      bill({ id: 'first', bill_title: 'water one' }),
      bill({ id: 'second', bill_title: 'water two' }),
    ];
    expect(searchBillsLocal(bills, 'water').map(b => b.id)).toEqual(['first', 'second']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/bill-search.test.ts`
Expected: FAIL — cannot resolve `../bill-search`.

- [ ] **Step 3: Implement the module**

`src/lib/bill-search.ts`:

```ts
/**
 * Pure client-side bill search: tiered relevance scoring with bounded
 * typo tolerance. No DB access — safe for src/lib per project convention.
 */

export interface SearchableBill {
  id: string;
  bill_number: string;
  bill_title: string;
  description: string;
}

// Score tiers, high to low. A bill's score for a token is its best tier;
// a bill's total is the sum over tokens. Any zero-scoring token excludes the bill.
const NUMBER_EXACT = 100;
const NUMBER_PREFIX = 80;
const NUMBER_SUBSTRING = 60;
const TITLE_SUBSTRING = 40;
const DESCRIPTION_SUBSTRING = 20;
const TITLE_FUZZY = 10;
const DESCRIPTION_FUZZY = 5;

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Collapse spaces/hyphens so "sb 123" and "sb-123" compare against "SB123". */
function compact(s: string): string {
  return s.toLowerCase().replace(/[\s-]+/g, '');
}

function maxEditsFor(token: string): number {
  if (token.length >= 9) return 2;
  if (token.length >= 5) return 1;
  return 0;
}

/** Bounded Levenshtein: true if edit distance(a, b) <= maxEdits. Early-exits per row. */
function withinEditDistance(a: string, b: string, maxEdits: number): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > maxEdits) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxEdits) return false;
    prev = curr;
  }
  return prev[b.length] <= maxEdits;
}

function fuzzyWordMatch(text: string, token: string, maxEdits: number): boolean {
  return text
    .split(' ')
    .some(word => withinEditDistance(word.replace(/[^a-z0-9]/g, ''), token, maxEdits));
}

function scoreToken(bill: SearchableBill, token: string): number {
  const compactToken = compact(token);
  const number = compact(bill.bill_number);
  const id = compact(bill.id);

  if (number === compactToken || id === compactToken) return NUMBER_EXACT;
  if (number.startsWith(compactToken) || id.startsWith(compactToken)) return NUMBER_PREFIX;
  if (number.includes(compactToken) || id.includes(compactToken)) return NUMBER_SUBSTRING;

  const title = normalize(bill.bill_title);
  if (title.includes(token)) return TITLE_SUBSTRING;

  const description = normalize(bill.description);
  if (description.includes(token)) return DESCRIPTION_SUBSTRING;

  const maxEdits = maxEditsFor(token);
  if (maxEdits > 0) {
    if (fuzzyWordMatch(title, token, maxEdits)) return TITLE_FUZZY;
    if (fuzzyWordMatch(description, token, maxEdits)) return DESCRIPTION_FUZZY;
  }
  return 0;
}

/**
 * Filter and rank bills against a query. Every whitespace-separated token
 * must match somewhere (AND); results are ordered best-match-first with
 * ties keeping input order. Empty/whitespace queries return the input array.
 */
export function searchBillsLocal<T extends SearchableBill>(bills: T[], query: string): T[] {
  const normalized = normalize(query);
  if (!normalized) return bills;
  const tokens = normalized.split(' ');

  const scored: Array<{ bill: T; score: number }> = [];
  for (const bill of bills) {
    let total = 0;
    for (const token of tokens) {
      const s = scoreToken(bill, token);
      if (s === 0) { total = 0; break; }
      total += s;
    }
    if (total > 0) scored.push({ bill, score: total });
  }
  // Array.prototype.sort is stable — equal scores keep input order.
  return scored.sort((a, b) => b.score - a.score).map(s => s.bill);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/bill-search.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/bill-search.ts src/lib/__tests__/bill-search.test.ts
git commit -m "feat: add pure client-side bill search with ranking and typo tolerance"
```

---

### Task 2: Kanban board — synchronous search, drop the server round-trip

**Files:**
- Modify: `src/components/kanban/kanban-board.tsx`
- Modify: `src/db/queries/bills-read.ts` (delete `searchBills`)

**Interfaces:**
- Consumes: `searchBillsLocal` (Task 1).
- Produces: `filteredBills: Bill[] | null` is now a `useMemo` (null = no active search) — same shape downstream consumers already use.

- [ ] **Step 1: Swap the import**

In `src/components/kanban/kanban-board.tsx`, replace:

```tsx
import { searchBills } from '@/db/queries/bills-read';
```

with:

```tsx
import { searchBillsLocal } from '@/lib/bill-search';
```

- [ ] **Step 2: Replace the filteredBills state with a memo**

Replace:

```tsx
  const [filteredBills, setFilteredBills] = useState<Bill[] | null>();
```

with:

```tsx
  const filteredBills = useMemo<Bill[] | null>(
    () => (searchQuery.trim() ? searchBillsLocal(bills, searchQuery) : null),
    [bills, searchQuery]
  );
```

- [ ] **Step 3: Delete the debounced search effect**

Delete this entire block (currently lines ~188–215, under `// Debounced search effect`):

```tsx
  // Debounced search effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredBills(null);
      //setHighlightedBillId(null);
      return;
    }

    setError(null);
    const handler = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchBills(bills, searchQuery);
        setFilteredBills(results);
      } catch (err) {
        console.error('Error searching bills:', err);
        setError('Failed to search bills.');
        setFilteredBills(null);
        //setHighlightedBillId(null);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery, setLoading, bills]);
```

- [ ] **Step 4: Delete the manual filteredBills patch in the drag handler**

In the optimistic-commit section of the drop handler, delete:

```tsx
        if (filteredBills && searchQuery.trim()) {
          const newFilteredBills = Array.from(filteredBills);
          const filteredBillIndex = newFilteredBills.findIndex((b) => b.id === draggableId);
          if (filteredBillIndex > -1) {
            newFilteredBills.splice(filteredBillIndex, 1, updatedBill);
            setFilteredBills(newFilteredBills);
          }
        }
```

(The memo re-derives from `bills` automatically after `setBills(newBills)`.)

Then in that callback's dependency array, change:

```tsx
    [bills, readOnly, user, activeTenant, proposeStatusChange, toast, filteredBills, searchQuery, setBills, stopAutoPan]
```

to:

```tsx
    [bills, readOnly, user, activeTenant, proposeStatusChange, toast, setBills, stopAutoPan]
```

- [ ] **Step 5: Remove the now-unused setLoading alias if dead**

Run: `grep -n "setLoading" src/components/kanban/kanban-board.tsx`
Expected: only the destructuring line `setLoadingBills: setLoading,` remains. If so, delete that line from the `useBills()` destructure. (If other call sites remain, leave it.)

- [ ] **Step 6: Delete the server-side searchBills**

In `src/db/queries/bills-read.ts`, delete the whole function and its doc comment (under `// BILL SEARCH FUNCTIONS`):

```ts
/**
 * Asynchronously searches for bills based on a query (ID, bill_title, or description).
 *
 * @param query The search query.
 * @returns A promise that resolves to an array of matching Bill objects.
 */
export async function searchBills(bills: Bill[], query: string): Promise<Bill[]> {

  if (!query) {
    return bills; // Return all sorted bills if query is empty
  }
  const lowerCaseQuery = query.toLowerCase();

  return bills.filter(bill =>
    bill.id.toLowerCase().includes(lowerCaseQuery) ||
    bill.bill_number.toLowerCase().includes(lowerCaseQuery) ||
    bill.bill_title.toLowerCase().includes(lowerCaseQuery) ||
    bill.description.toLowerCase().includes(lowerCaseQuery)
  );
}
```

Run: `grep -rn "searchBills\b" src --include="*.ts" --include="*.tsx" | grep -v bill-search | grep -v __tests__`
Expected: no remaining references.

- [ ] **Step 7: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/kanban/kanban-board.tsx src/db/queries/bills-read.ts
git commit -m "refactor: replace server-action bill search with synchronous client-side ranking"
```

---

### Task 3: Spreadsheet uses the same search

**Files:**
- Modify: `src/components/kanban/kanban-spreadsheet.tsx`

**Interfaces:**
- Consumes: `searchBillsLocal` (Task 1).

- [ ] **Step 1: Swap the inline filter**

Add the import:

```tsx
import { searchBillsLocal } from '@/lib/bill-search';
```

In the `displayBills` memo, replace:

```tsx
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(bill =>
        bill.bill_number.toLowerCase().includes(q) ||
        bill.bill_title.toLowerCase().includes(q) ||
        bill.description.toLowerCase().includes(q)
      );
    }
```

with:

```tsx
    // Search filter (shared ranked search — src/lib/bill-search.ts)
    if (searchQuery.trim()) {
      items = searchBillsLocal(items, searchQuery);
    }
```

(The spreadsheet's own `sortKey` sorting still runs afterwards, unchanged.)

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm test`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/kanban/kanban-spreadsheet.tsx
git commit -m "refactor: spreadsheet search uses shared ranked bill search"
```

---

### Task 4: Header three-zone refactor

**Files:**
- Modify: `src/components/main/header-nav.tsx` (plain-link restyle + short labels)
- Create: `src/components/main/header-subnav.tsx`
- Modify: `src/components/main/header.tsx` (search input out, three zones in)
- Modify: `src/app/(main)/page.tsx` (drop the ViewToggle toolbar row)

**Interfaces:**
- Consumes: `ViewToggle` (existing), `NAV_ITEMS`/`isNavItemActive` (existing, labels change).
- Produces: `HeaderSubNav` (no props); `NAV_ITEMS` labels become `Search` / `Your Bills` / `Testimonies` / `Active Boards` (hamburger picks these up automatically).

- [ ] **Step 1: Confirm the olive color exists in the Tailwind theme**

Run: `grep -rn "olive" tailwind.config.* src/app/globals.css | head -5`
Expected: a theme color definition (the header already uses `border-olive`). If it were missing, `decoration-olive` below would silently not render — it must be present.

- [ ] **Step 2: Restyle HeaderNav as plain links with short labels**

Replace the ENTIRE content of `src/components/main/header-nav.tsx` with:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, KanbanSquareIcon, LayoutGrid, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export const NAV_ITEMS = [
  { href: '/search', label: 'Search', icon: Search },
  { href: '/', label: 'Your Bills', icon: KanbanSquareIcon },
  { href: '/testimonies', label: 'Testimonies', icon: FileText },
  { href: '/boards', label: 'Active Boards', icon: LayoutGrid },
] as const;

export function isNavItemActive(href: string, pathname: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-5">
      {NAV_ITEMS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            'whitespace-nowrap text-sm font-medium underline-offset-8 transition-colors duration-150',
            isNavItemActive(href, pathname)
              ? 'text-white underline decoration-olive decoration-2'
              : 'text-primary-foreground/70 hover:text-white'
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
```

(Icons stay in `NAV_ITEMS` for the mobile hamburger, which renders them; desktop links are text-only.)

- [ ] **Step 3: Create HeaderSubNav**

`src/components/main/header-subnav.tsx`:

```tsx
'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/contexts/auth-context';
import { ViewToggle } from './view-toggle';

/**
 * Contextual sub-navigation for the header's center slot.
 * '/' hosts the board view toggle (logged-in only — hidden over the login
 * wall). /search, /testimonies, /boards render nothing yet; their sub-navs
 * land here later.
 */
export function HeaderSubNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  if (pathname === '/' && user) {
    return <ViewToggle />;
  }

  return null;
}
```

- [ ] **Step 4: Rework header.tsx**

Replace the ENTIRE content of `src/components/main/header.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { Settings } from 'lucide-react';
import { useAuth } from '@/hooks/contexts/auth-context';
import { AuthHeader } from '../auth/auth-header';
import { HeaderNav } from './header-nav';
import { HeaderSubNav } from './header-subnav';
import { MobileHamburgerMenu } from './mobile-hamburger-menu';
import { SettingsDialog } from '@/components/settings/settings-dialog';

export function Header() {
  const { user, activeTenant, memberships, setActiveTenant } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center px-3 md:px-8 py-3 md:py-4 border-b-[3px] border-olive bg-primary text-primary-foreground">
        {/* Title — always visible */}
        <div className="flex-shrink-0 flex items-center gap-3">
          <h1 className="text-lg md:text-xl font-semibold text-primary-foreground">
            {activeTenant?.name ?? 'Food+'} Bill Tracker
          </h1>
          {/* Tenant selector — desktop only */}
          {memberships.length > 1 && (
            <select
              value={activeTenant?.tenantId ?? ''}
              onChange={(e) => setActiveTenant(e.target.value)}
              className="hidden md:block text-sm bg-white/10 border border-white/20 text-white rounded-md px-2 py-1"
            >
              {memberships.map((m) => (
                <option key={m.tenantId} value={m.tenantId} className="text-black">
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Contextual sub-nav — desktop only, absolutely centered */}
        <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 justify-center w-fit">
          <HeaderSubNav />
        </div>

        {/* Nav links, settings, auth — desktop only */}
        <div className="hidden md:flex items-center gap-4 flex-shrink-0 ml-auto">
          <HeaderNav />
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
          <AuthHeader />
        </div>

        {/* Hamburger menu — mobile only */}
        <div className="md:hidden ml-auto">
          <MobileHamburgerMenu />
        </div>
      </header>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
```

(Gone: the search `Input` + `handleSearchChange` + `Search` icon import + the `useKanbanBoard` import — the header no longer touches board state.)

- [ ] **Step 5: Drop the ViewToggle toolbar row from the Your Bills page**

In `src/app/(main)/page.tsx`:
1. Delete the import: `import { ViewToggle } from '@/components/main/view-toggle';`
2. Delete this block from the return:

```tsx
      <div className="hidden md:flex justify-center pt-4">
        <ViewToggle />
      </div>
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run build`
Expected: pass. (`ViewToggle` is still imported by `header-subnav.tsx`, so no dead-code warning.)

- [ ] **Step 7: Commit**

```bash
git add src/components/main/header-nav.tsx src/components/main/header-subnav.tsx src/components/main/header.tsx "src/app/(main)/page.tsx"
git commit -m "feat: three-zone header with contextual sub-nav center and plain nav links right"
```

---

### Task 5: Search input in the kanban header (desktop + controlled mobile)

**Files:**
- Modify: `src/components/kanban/kanban-header.tsx`

**Interfaces:**
- Consumes: `searchQuery` / `setSearchQuery` from `useKanbanBoard()` (existing context fields).

- [ ] **Step 1: Make searchQuery available and control the mobile input**

In `src/components/kanban/kanban-header.tsx`, change the `useKanbanBoard()` destructure to include `searchQuery`:

```tsx
  const { view, selectedTagIds, setSelectedTagIds, selectedYears, setSelectedYears, deadFilter, setDeadFilter, searchQuery, setSearchQuery } = useKanbanBoard();
```

Then add `value={searchQuery}` to the existing mobile input:

```tsx
          <Input
            type="search"
            placeholder="Search bills..."
            className="pl-9"
            value={searchQuery}
            onChange={handleSearchChange}
            aria-label="Search bills"
          />
```

- [ ] **Step 2: Add the centered desktop search input**

In the desktop row (`<div className="hidden md:flex items-center justify-between">`), insert between the left switches `<div className="ml-6">…</div>` and the right controls `<div className="flex items-center space-x-2 mr-4 py-2">…</div>`:

```tsx
        {/* Search — centered between switches and controls */}
        <div className="relative flex-1 max-w-md mx-6">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search bills..."
            className="pl-9"
            value={searchQuery}
            onChange={handleSearchChange}
            aria-label="Search bills"
          />
        </div>
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run build`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/kanban/kanban-header.tsx
git commit -m "feat: move bill search into kanban header, controlled on desktop and mobile"
```

---

### Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full suite**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass; test count grows by the new bill-search tests.

- [ ] **Step 2: Manual smoke check (running app)**

Serve the production build and verify:
- Header: nav links sit on the right as plain text (short labels, no background); active page has an olive underline; settings + login/user menu after the links.
- On `/` logged out: login wall, EMPTY header center (no view toggle).
- On `/search`, `/testimonies`, `/boards`: empty header center; placeholder content starts right below the header (no toolbar gap).
- On `/` logged in: view toggle appears centered in the header; the board starts immediately below the kanban header (no extra toolbar row); typing in the kanban-header search filters cards instantly with no spinner, ranked matches first, board auto-scrolls to the best match; typos like "agricultre" still match; the same query filters the spreadsheet view identically.
- (If no test credentials are available, note the logged-in checks as build-verified only.)

- [ ] **Step 3: Report results**

If anything fails, fix before declaring done (superpowers:verification-before-completion).
