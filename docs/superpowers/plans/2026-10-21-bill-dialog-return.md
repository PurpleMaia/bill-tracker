# Return to the Bill Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Going back from Contact Legislator or Write Testimony (browser back or in-app Back) returns the user to the screen they came from with the same bill dialog open.

**Architecture:** The open bill moves from per-host component state into a `?bill=<id>` query param, read and written through one hook (`useBillDialogParam`) used by all four dialog hosts. The dialog's Contact/Testimony buttons stop closing the dialog and append `?returnTo=<current path+query>`. The destination pages compute Back from a validated `returnTo`. The URL and path logic lives in pure, unit-tested `src/lib/` helpers.

**Tech Stack:** Next.js 15 App Router (`useRouter`, `usePathname`, `useSearchParams` from `next/navigation`), React, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-21-bill-dialog-return-design.md`

## Global Constraints

- Query param name: `bill`, value: the internal `bill.id` (not bill number).
- Return param name: `returnTo`, value: `encodeURIComponent(pathname + search)` of the host page (includes `bill=`).
- A `returnTo` is accepted only if it starts with a single `/`, does not start with `//` or `/\`, and contains no scheme. Otherwise it's ignored.
- Fallback Back order: safe `returnTo` → `/testimonies` when `from=testimonies` → `/`.
- Param-only navigations use `{ scroll: false }`.
- Out of scope: Share button, dialog-as-route, restoring calendar month / spreadsheet sort / scroll, remembering the dialog tab.
- `src/lib/` stays DB-free; tests are pure Vitest in `src/lib/__tests__/` (flat). No `index.ts` barrels; import by deep path.
- Commits: `feat:`/`fix:`/`refactor:` prefixes, **no** `Co-Authored-By` line (project CLAUDE.md).
- Before finishing: `pnpm test`, `pnpm typecheck`, `pnpm build` all pass (build catches missing Suspense boundaries; it ignores type errors, so typecheck separately).

## Review Focus

1. **Close-then-back reopening the dialog.** After closing a dialog that was opened in this mount, browser back must not reopen it. → Manual check in Task 6, mechanism pinned in Task 3.
2. **Discover losing saved filters on return.** `/discover?bill=…` must still restore saved filters. → `hasNonBillParams` test in Task 2, used in Task 4.
3. **Crafted `returnTo` (open redirect).** `//evil.example`, `/\evil.example`, `https://evil.example`, `javascript:…`, encoded variants → ignored. → Tests in Task 1.
4. **Other query params clobbered.** Adding/removing `bill` on `/discover?stages=x&tracked=untracked` keeps `stages` and `tracked`. → `withBillParam` tests in Task 2.
5. **Close animation shows an empty dialog.** When `bill` is removed, the dialog must keep rendering the last bill while it animates out. → `dialogBillId` in Task 3, manual check in Task 6.

---

### Task 1: `safeReturnPath` helper

**Files:**
- Create: `src/lib/core/safe-return-path.ts`
- Test: `src/lib/__tests__/safe-return-path.test.ts`

**Interfaces:**
- Produces: `export function safeReturnPath(raw: string | null | undefined): string | null`. Returns `raw` unchanged when it's a safe same-origin relative path, else `null`. Input is already URL-decoded (as `searchParams.get` returns it).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { safeReturnPath } from '../core/safe-return-path';

describe('safeReturnPath', () => {
  it('accepts relative app paths with queries', () => {
    expect(safeReturnPath('/your-bills?bill=123')).toBe('/your-bills?bill=123');
    expect(safeReturnPath('/discover?stages=a&bill=9')).toBe('/discover?stages=a&bill=9');
    expect(safeReturnPath('/')).toBe('/');
  });
  it('rejects empty / missing', () => {
    expect(safeReturnPath(null)).toBeNull();
    expect(safeReturnPath(undefined)).toBeNull();
    expect(safeReturnPath('')).toBeNull();
  });
  it('rejects protocol-relative and backslash tricks', () => {
    expect(safeReturnPath('//evil.example')).toBeNull();
    expect(safeReturnPath('/\\evil.example')).toBeNull();
    expect(safeReturnPath('/%2Fevil.example')).toBeNull();
    expect(safeReturnPath('/%5Cevil.example')).toBeNull();
  });
  it('rejects absolute URLs and schemes', () => {
    expect(safeReturnPath('https://evil.example')).toBeNull();
    expect(safeReturnPath('javascript:alert(1)')).toBeNull();
    expect(safeReturnPath('evil.example/path')).toBeNull();
  });
  it('rejects control characters', () => {
    expect(safeReturnPath('/\t/evil.example')).toBeNull();
    expect(safeReturnPath('/ok\n')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/safe-return-path.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `safeReturnPath` in `src/lib/core/safe-return-path.ts`**

Reject: non-strings or empty strings, anything not starting with `/`, a second character of `/` or `\`, any char code < 0x20, and anything whose `decodeURIComponent` (in a try/catch; on throw, reject) starts with `//` or `/\`. Also as a final guard, `new URL(raw, 'http://x').origin === 'http://x'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/__tests__/safe-return-path.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/core/safe-return-path.ts src/lib/__tests__/safe-return-path.test.ts
git commit -m "feat: add safeReturnPath validator for in-app back links"
```

---

### Task 2: Bill-dialog URL helpers

**Files:**
- Create: `src/lib/bills/bill-dialog-url.ts`
- Test: `src/lib/__tests__/bill-dialog-url.test.ts`

**Interfaces:**
- Produces:
  - `export const BILL_PARAM = 'bill';`
  - `export const RETURN_TO_PARAM = 'returnTo';`
  - `export function withBillParam(search: string, billId: string | null): string`. Takes a query string with or without a leading `?`. Returns it with `bill` set (or removed when `billId` is null), other params kept in order. The result has a leading `?`, or is `''` when no params remain.
  - `export function billActionHref(billId: string, action: 'testimony' | 'contact', returnTo: string): string`. Returns `/bills/<billId>/<action>?returnTo=<encoded returnTo>`.
  - `export function hasNonBillParams(search: string): boolean`. True if any key other than `bill` is present.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { withBillParam, billActionHref, hasNonBillParams } from '../bills/bill-dialog-url';

describe('withBillParam', () => {
  it('adds bill to an empty query', () => {
    expect(withBillParam('', '123')).toBe('?bill=123');
  });
  it('keeps other params when adding', () => {
    expect(withBillParam('?stages=a&tracked=untracked', '9')).toBe('?stages=a&tracked=untracked&bill=9');
  });
  it('replaces an existing bill', () => {
    expect(withBillParam('stages=a&bill=1', '2')).toBe('?stages=a&bill=2');
  });
  it('removes bill and keeps the rest', () => {
    expect(withBillParam('?stages=a&bill=1', null)).toBe('?stages=a');
  });
  it('returns empty string when nothing remains', () => {
    expect(withBillParam('?bill=1', null)).toBe('');
  });
});

describe('billActionHref', () => {
  it('builds an encoded returnTo link', () => {
    expect(billActionHref('123', 'testimony', '/your-bills?bill=123'))
      .toBe('/bills/123/testimony?returnTo=%2Fyour-bills%3Fbill%3D123');
    expect(billActionHref('123', 'contact', '/discover?stages=a&bill=123'))
      .toBe('/bills/123/contact?returnTo=%2Fdiscover%3Fstages%3Da%26bill%3D123');
  });
});

describe('hasNonBillParams', () => {
  it('ignores bill', () => {
    expect(hasNonBillParams('?bill=1')).toBe(false);
    expect(hasNonBillParams('')).toBe(false);
  });
  it('detects other params', () => {
    expect(hasNonBillParams('?bill=1&stages=a')).toBe(true);
    expect(hasNonBillParams('tracked=untracked')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/bill-dialog-url.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement the four exports in `src/lib/bills/bill-dialog-url.ts`** using `URLSearchParams` (it accepts a leading `?`). `billActionHref` uses `encodeURIComponent`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/__tests__/bill-dialog-url.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/bills/bill-dialog-url.ts src/lib/__tests__/bill-dialog-url.test.ts
git commit -m "feat: add bill-dialog URL helpers"
```

---

### Task 3: `useBillDialogParam` hook + Kanban board and spreadsheet

**Files:**
- Create: `src/hooks/use-bill-dialog-param.ts`
- Modify: `src/components/kanban/kanban-board.tsx` (state ~L51–52, `handleCardClick` ~L410–413, dialog ~L600–605)
- Modify: `src/components/kanban/kanban-spreadsheet.tsx` (state ~L137–143, dialog ~L383–387)
- Modify: `src/app/(main)/your-bills/page.tsx`, `src/app/(main)/boards/page.tsx` (add `<Suspense fallback={null}>` like `app/(main)/discover/page.tsx` if `pnpm build` asks for it)

**Interfaces:**
- Consumes: `withBillParam`, `BILL_PARAM` (Task 2).
- Produces (`'use client'` module):
  ```ts
  export function useBillDialogParam(): {
    openBillId: string | null;   // current ?bill= value
    dialogBillId: string | null; // last non-null openBillId — pass to BillDetailsDialog so the close animation keeps content
    isOpen: boolean;             // openBillId !== null
    openBill: (billId: string) => void;
    closeBill: () => void;
  };
  ```

- [ ] **Step 1: Implement the hook**

- `openBill`: `router.push(pathname + withBillParam(searchParams.toString(), id), { scroll: false })` and set a `useRef` `openedHereRef = true`.
- `closeBill`: if `openedHereRef.current` → set it false, `router.back()`. Otherwise → `router.replace(pathname + withBillParam(searchParams.toString(), null), { scroll: false })`. This prevents back from reopening a dialog that was opened in this mount. When the dialog was restored from history or a refresh, replace removes the param in place.
- `dialogBillId`: keep the last non-null `openBillId` in state or a ref.

- [ ] **Step 2: Migrate `KanbanBoard`**

Delete `selectedBillId`/`isDialogOpen` state. `handleCardClick` calls `openBill(bill.id)`. The dialog gets `billID={dialogBillId}`, `isOpen={isOpen}`, `onClose={closeBill}`, and keeps `boardMode`. Leave `handleTempCardClick` alone (it scrolls; it doesn't open the dialog).

- [ ] **Step 3: Migrate `KanbanSpreadsheet`** the same way. `openBillDetails(billId)` becomes `openBill(billId)`.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm build`
Expected: no type errors, and the build has no "useSearchParams() should be wrapped in a suspense boundary" error. If it does, wrap the page body in `<Suspense fallback={null}>` as Discover does.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-bill-dialog-param.ts src/components/kanban/kanban-board.tsx src/components/kanban/kanban-spreadsheet.tsx src/app/\(main\)
git commit -m "feat: keep the open bill dialog in the URL on the board and spreadsheet"
```

---

### Task 4: Calendar and Discover hosts

**Files:**
- Modify: `src/components/calendar/calendar-view.tsx` (`openBillId` state ~L84; `onOpen={setOpenBillId}` ~L235, L245, L251; dialog ~L255–259)
- Modify: `src/components/search/bill-search-view.tsx` (`urlHadParams` ~L39–45; `openBillId` ~L71, L88, L137; dialog ~L300–313)

**Interfaces:**
- Consumes: `useBillDialogParam` (Task 3), `hasNonBillParams` (Task 2).

- [ ] **Step 1: Calendar.** Replace the `openBillId` state with the hook. `onOpen={openBill}`, dialog `billID={dialogBillId}` `isOpen={isOpen}` `onClose={closeBill}`.

- [ ] **Step 2: Discover.** Replace the `openBillId` state with the hook. `handleCardClick` calls `openBill`. `openBill` lookup (the bill object for `trackSlot`) uses `openBillId`; rename the local `openBill` variable to `openBillRow` to avoid clashing with the hook's `openBill` function. Change `urlHadParams.current = Array.from(raw.keys()).length > 0` to `urlHadParams.current = hasNonBillParams(raw.toString())`. `parseSearchParams` ignores unknown keys, so `bill` doesn't leak into filters (confirm by reading it).

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/calendar/calendar-view.tsx src/components/search/bill-search-view.tsx
git commit -m "feat: keep the open bill dialog in the URL on calendar and discover"
```

---

### Task 5: Dialog keeps itself in history and passes `returnTo`; destination pages honor it

**Files:**
- Modify: `src/components/kanban/bill-details-dialog.tsx` (call sites ~L421–424, L481–484, L532–533, L723–726, L735–738)
- Modify: `src/app/bills/[id]/testimony/page.tsx` (`backHref` L36–37, `router.replace('/')` ~L97; `doneHref` L303 picks it up automatically)
- Modify: `src/app/bills/[id]/contact/page.tsx` (`backHref` L78)

**Interfaces:**
- Consumes: `billActionHref`, `RETURN_TO_PARAM` (Task 2), `safeReturnPath` (Task 1).

- [ ] **Step 1: Dialog.** In `BillDetailsDialog`, add `usePathname()` and `useSearchParams()`, and compute `const returnTo = pathname + (search ? '?' + search : '')`. At all five call sites, remove the `onClose()` call and replace the hard-coded path with `router.push(billActionHref(bill.id, '<action>', returnTo))`.

- [ ] **Step 2: Testimony page.**
  ```ts
  const backHref = safeReturnPath(searchParams.get(RETURN_TO_PARAM))
    ?? (searchParams.get('from') === 'testimonies' ? '/testimonies' : '/');
  ```
  Change the load-failure `router.replace('/')` to `router.replace(backHref)`. Leave the "Go to sign in" `<Link href="/">` alone.

- [ ] **Step 3: Contact page.** Use the same `backHref` expression. All existing `router.push(backHref)` uses (skeleton, error, header) pick it up.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/kanban/bill-details-dialog.tsx "src/app/bills/[id]"
git commit -m "fix: return to the open bill dialog from contact and testimony pages"
```

---

### Task 6: Full verification and manual acceptance

**Files:** none (fix-ups only if a check fails)

- [ ] **Step 1: Automated**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: all pass; build has no Suspense/`'use server'` errors.

- [ ] **Step 2: Manual.** `pnpm dev` (port 9002). For each host — Discover (`/` and `/discover`), Your Bills in kanban, spreadsheet and calendar view, and Boards:
  1. Open a bill → URL gains `?bill=`.
  2. Write Testimony → browser back → same host, same view type, same bill dialog open.
  3. Same, using the in-app Back button.
  4. Repeat 2–3 with Contact Legislator.
  5. Close the dialog → `?bill=` gone → browser back does not reopen it.
  6. Open a bill → browser back → dialog closes, still on the host page.
  7. Refresh with `?bill=` → dialog opens.
  8. The close animation shows the bill's content, not an empty shell.
  9. Discover with saved filters → open a bill → Testimony → back → filters still applied.
  10. `/bills/<id>/testimony?returnTo=https://evil.example` → Back goes to `/`.
  11. `/testimonies` → open a testimony → Back goes to `/testimonies`.

- [ ] **Step 3: Commit any fix-ups**

```bash
git commit -am "fix: <what the manual check caught>"
```
