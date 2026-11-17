# Removing Failed Bills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make removing a failed bill easy to find (an X in the card's corner, and Remove in the bill dialog's actions) while still drawing users to read why the bill failed (a "Failed | Why? ›" pill, and the full explanation in the dialog's briefing).

**Architecture:** First, pull the "why did it fail" wording out of `DeadBillInfoPopover` into a pure, tested helper. Both the popover and `BillBriefing` render from it. Second, pull the card's remove-from-board flow (confirmation dialog + `data.bills.removeFromOrg` + local state cleanup) into one reusable component, used by the card's live X, the card's failed-corner X, the popover and the dialog. Everything else is presentational changes to `kanban-card.tsx`, `bill-details-dialog.tsx` and `bill-briefing.tsx`.

**Tech Stack:** Next.js 15 / React, TypeScript, shadcn/ui (AlertDialog, Popover, Button, Badge), Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-17-failed-bill-remove-design.md`

**Branch:** `feat/failed-bill-remove`, stacked on `fix/removed-bill-still-tracked` (PR #240). It needs #240's guarded `data.bills.removeFromOrg`.

## Global Constraints

- Who may remove is unchanged: org admins (`activeTenant?.orgRole === 'admin'`) get Remove from board (org-wide); other users get Untrack only where they already can. No server or auth changes.
- The "Remove Bill from Board?" confirmation copy and the destructive confirm button are unchanged.
- Remove buttons use an outline/ghost style with destructive colors, never filled red.
- **Don't restyle `BillBriefing`.** The container, heading, progress bar, and Latest version / Committees tiles render exactly as today. Only failed-bill content changes.
- Live and enacted bills look and behave exactly as before, on both the card and the dialog.
- `src/lib/` stays DB-free; tests are pure Vitest in `src/lib/__tests__/` (flat).
- Run `pnpm typecheck`, `pnpm test` and `pnpm build` before each commit. All must pass.
- Commit prefixes are `feat:`/`refactor:`/`fix:`. No `Co-Authored-By` lines.

## Review Focus

1. **Bill with no committee assignment** (`committee_assignment` null) marked dead: the explanation must still render ("no committee referral on record"), and must not crash or show "Unknown deadline". → test in Task 1.
2. **Dead bill whose status is end-of-process** (`governorSigns`, `vetoList`, …): the heading must be "Where did this bill end up?", the summary must not say "failed", and there's no revival note. → test in Task 1.
3. **Missed-deadline date formatting across timezones:** "February 27, 2025" must render the same in every timezone (the old popover used local-time `toLocaleDateString`, which can shift the day). → test in Task 1.
4. **Remove from inside the dialog:** after confirming, the dialog must close and the card must leave the board. A dialog left open on a removed bill, or a card that survives, is the bug we're fixing. → manual check in Task 4.
5. **localStorage unavailable** (private mode, blocked storage): the pill must render and work, just without the pulse. → manual check in Task 3 (wrap every storage access in try/catch).

---

### Task 1: Pure dead-bill explanation helper

**Files:**
- Create: `src/lib/bills/dead-bill-explanation.ts`
- Modify: `src/components/kanban/dead-bill-info-popover.tsx` (replace the inline wording logic, lines ~41–120, with the helper; markup unchanged)
- Test: `src/lib/__tests__/dead-bill-explanation.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface DeadBillExplanation {
    heading: 'Why did this bill fail?' | 'Where did this bill end up?';
    summary: string;
    /** Only for missed-deadline deaths (not committee actions / closed statuses). */
    missedDeadline: { name: string; date: string /* e.g. "February 27, 2025" */ } | null;
    committeeExplanation: string;
    showRevivalNote: boolean;
  }
  export function explainDeadBill(
    bill: { billNumber: string; billStatus: string; committeeAssignment: string | null },
    statusUpdates: StatusUpdate[],
    deadlines: SessionDeadlines,
    today: string, // YYYY-MM-DD
  ): DeadBillExplanation
  ```

- [ ] **Step 1: Write the failing tests** in `dead-bill-explanation.test.ts`. Reuse the same `MOCK_DEADLINES` shape as `dead-bill.test.ts` (copy the fixture).

```ts
it('deferral: committee-action copy, no missed deadline, revival note', () => {
  const e = explainDeadBill({ billNumber: 'HB100', billStatus: 'introduced', committeeAssignment: 'JDC' },
    [{ statustext: 'The committee on JDC deferred the measure.', date: '2025-02-10', chamber: 'H' }],
    MOCK_DEADLINES, '2025-03-01');
  expect(e.heading).toBe('Why did this bill fail?');
  expect(e.summary).toBe('This bill failed because it was permanently deferred by a committee.');
  expect(e.missedDeadline).toBeNull();
  expect(e.committeeExplanation).toBe('The committee permanently deferred this bill, ending its progress this session.');
  expect(e.showRevivalNote).toBe(true);
});

it('recommendation not adopted: names the committees', () => {
  const e = explainDeadBill({ billNumber: 'SB5', billStatus: 'introduced', committeeAssignment: 'AGR, WAM' },
    [{ statustext: 'The committee(s) on WAM recommend(s) that the measure be PASSED. The recommendation was not adopted.', date: '2025-02-10', chamber: 'S' }],
    MOCK_DEADLINES, '2025-03-01');
  expect(e.summary).toBe('This bill failed because a committee did not adopt the recommendation to advance it.');
  expect(e.committeeExplanation).toContain('AGR, WAM heard this bill but did not adopt');
  expect(e.missedDeadline).toBeNull();
});

it('missed deadline: summary names it and the date is formatted timezone-independently', () => {
  const e = explainDeadBill({ billNumber: 'HB100', billStatus: 'introduced', committeeAssignment: 'JDC' },
    [], MOCK_DEADLINES, '2025-03-14');
  expect(e.missedDeadline).not.toBeNull();
  expect(e.summary).toBe(`This bill failed because it was not scheduled for a committee hearing before its ${e.missedDeadline!.name} deadline.`);
  expect(e.missedDeadline!.date).toMatch(/^[A-Z][a-z]+ \d{1,2}, 2025$/);
});

it('formats a known deadline date exactly', () => {
  // AGR, WAM = double referral → First Lateral (2025-02-27) is the first failed deadline
  const e = explainDeadBill({ billNumber: 'SB5', billStatus: 'introduced', committeeAssignment: 'AGR, WAM' },
    [], MOCK_DEADLINES, '2025-03-01');
  expect(e.missedDeadline).toEqual({ name: 'First Lateral', date: 'February 27, 2025' });
  expect(e.committeeExplanation).toContain('referred to AGR, WAM but neither chair scheduled it');
});

it('closed status: "Where did this bill end up?", no failure wording, no revival note', () => {
  const e = explainDeadBill({ billNumber: 'HB1', billStatus: 'governorSigns', committeeAssignment: 'AGR' },
    [], MOCK_DEADLINES, '2025-06-01');
  expect(e.heading).toBe('Where did this bill end up?');
  expect(e.summary).toBe('This bill completed the legislative process and was signed into law.');
  expect(e.summary).not.toMatch(/fail/i);
  expect(e.showRevivalNote).toBe(false);
});

it('no committee assignment: still explains, never "Unknown"', () => {
  const e = explainDeadBill({ billNumber: 'HB9', billStatus: 'introduced', committeeAssignment: null },
    [], MOCK_DEADLINES, '2025-03-14');
  expect(e.summary).toBe('This bill is no longer advancing this session.');
  expect(e.committeeExplanation).toBe('This bill has no committee referral on record, so it cannot advance this session.');
  expect(JSON.stringify(e)).not.toContain('Unknown');
});
```

If the "known deadline" fixture resolves to a different first-failed deadline than First Lateral, adjust only that test's `today`/expected values to match `isBillDead`'s actual `failedDeadline`. Keep the exact-format assertion.

- [ ] **Step 2: Run to verify they fail.** `pnpm vitest run src/lib/__tests__/dead-bill-explanation.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `explainDeadBill`** by moving the popover's wording logic as-is: `isBillDead` call, `isNotAdopted`/`isDeferral` detection, `CLOSED_STATUS_SUMMARY`, the summary and committee-explanation branches (copy the strings verbatim). One change: format the date with `new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'))`. `showRevivalNote = !closedSummary`.

- [ ] **Step 4: Point `DeadBillInfoPopover` at the helper.** Call `explainDeadBill({ billNumber, billStatus, committeeAssignment }, updates, SESSION_DEADLINES, todayHawaii())` and render `heading`, `summary`, `missedDeadline` (the box shows when non-null), `committeeExplanation`, and the revival `<p>` when `showRevivalNote`. The JSX structure and classes stay the same.

- [ ] **Step 5: Verify.** `pnpm test` (all pass, including the new file), then `pnpm typecheck` (clean).

- [ ] **Step 6: Commit.** `refactor: extract dead-bill explanation into a tested pure helper`

---

### Task 2: Reusable remove-from-board confirmation

**Files:**
- Create: `src/components/kanban/remove-from-board-dialog.tsx`
- Modify: `src/components/kanban/kanban-card.tsx`. Replace both inline `AlertDialog` blocks (the live hover X at ~401–440, and the popover `removeSlot` at ~686–720) and `handleRemoveBill`/`isRemoving`/`showRemoveDialog` with the new component.

**Interfaces:**
- Produces:
  ```tsx
  export function RemoveFromBoardDialog(props: {
    bill: Pick<Bill, 'id' | 'bill_number'>;
    /** The element that opens the confirm (rendered via AlertDialogTrigger asChild). */
    trigger: React.ReactElement;
    /** Called after a successful removal (e.g. to close the bill dialog). */
    onRemoved?: () => void;
  }): JSX.Element
  ```
  Internally it owns `open`/`isRemoving`, needs `activeTenant` (no-op with `console.error` when there's no `tenantId`, as today), calls `data.bills.removeFromOrg`, `useBills().removeBill(bill.id)`, `queryClient.invalidateQueries({ queryKey: ['bills','search'] })`, and fires the same "Bill Removed" toast. All clicks inside call `e.stopPropagation()` so card clicks don't fire. Copy and button styles are moved verbatim from the card.

- [ ] **Step 1: Create the component** by moving the card's existing logic and markup into it (pure move, no copy changes).
- [ ] **Step 2: Use it in `kanban-card.tsx`** at both sites, passing the existing trigger buttons unchanged as `trigger`. The card should look and behave exactly as before.
- [ ] **Step 3: Verify.** `pnpm typecheck && pnpm test && pnpm build` all pass. Manual: as an org admin on the Board, hover a live card → X → confirm → the card disappears and the toast shows. On a failed card → ⓘ → popover "Remove from board" → the same result.
- [ ] **Step 4: Commit.** `refactor: share the remove-from-board confirmation`

---

### Task 3: Failed card — corner X and "Failed | Why? ›" pill

**Files:**
- Modify: `src/components/kanban/kanban-card.tsx` (tags row ~350–355; the Failed badge in the footer ~549–552; the absolute ⓘ block ~677–732)
- Modify: `src/components/kanban/dead-bill-info-popover.tsx` only if its trigger needs `asChild` adjustments for the pill (it already takes `children` as the trigger)

**Interfaces:**
- Consumes: `RemoveFromBoardDialog` (Task 2); the existing `canRemoveFromBoard`, `canUntrack`, `onUnadopt`.

- [ ] **Step 1: Corner X (failed cards only).** Move the tags row's right edge to hold one X button (`h-6 w-6`, outline, `border-destructive/35 text-destructive`, white background), rendered **outside** the grayed `opacity-50` layer and always visible (no `opacity-0 group-hover`). `canRemoveFromBoard` → wrap in `RemoveFromBoardDialog`; else `canUntrack` → `onUnadopt(bill.id)`; else no X. `aria-label`: `Remove ${bill.bill_number} from the board` / `Untrack ${bill.bill_number}`. Live cards keep their hover X in the bill-number row (`!bill.dead` conditions stay for live), and failed cards no longer render the bill-number-row X.
- [ ] **Step 2: Pill.** Delete the absolutely positioned red ⓘ circle. Replace the footer's `Failed` badge, on failed cards, with a single `<button>` as the `DeadBillInfoPopover` trigger: a left segment "Failed" (`bg-destructive text-white`) and a right segment "Why? ›" (white background, `text-destructive`, destructive border), `h-[22px] rounded-full text-[10.5px] font-semibold`, `aria-label="Why did this bill fail?"`, `onClick` stops propagation. Render it outside the grayed layer so it stays sharp (the same layering trick as the old ⓘ, but positioned in the footer row).
- [ ] **Step 3: One-time pulse.** Add `useFirstFailedPulse(): boolean` in the same file (or `src/hooks/use-first-failed-pulse.ts`). On mount, read `localStorage.getItem('foodplus:failed-why-seen')`; if it's absent, return `true` once and set it to `'1'`. Every storage access goes in try/catch (on failure, return `false`). Apply a one-shot ring animation class only when `true`, and only under `motion-safe:` (add a `keyframes`/`animation` entry `why-ring` to `tailwind.config` if no suitable one exists: an expanding red box-shadow, ~2.4s, 1 iteration).
- [ ] **Step 4: Verify.** `pnpm typecheck && pnpm test && pnpm build` all pass. Manual on the Board:
  - As an org admin, on a failed card: the X is visible top-right without hover and not grayed. X → confirm → the card is removed. Pill → popover opens with the same text as before.
  - As an org worker in My Bills, on a failed card: the X untracks the bill.
  - On a public/read-only board, a failed card shows the pill but no X.
  - The first failed card pulses once. After a reload, no pulse. In a private window with storage blocked, the pill still works.
  - Live cards are unchanged (hover X, no pill). At ~375px width, the pill and X don't overlap the tags.
- [ ] **Step 5: Commit.** `feat: corner remove button and "Why?" pill on failed bill cards`

---

### Task 4: Bill dialog — Remove / Untrack in the header actions and mobile bar

**Files:**
- Modify: `src/components/kanban/bill-details-dialog.tsx` (desktop actions wrapper ~433–537; mobile sticky bar ~735–800)

**Interfaces:**
- Consumes: `RemoveFromBoardDialog` (Task 2); `useTrackedBills().untrackBill(billId): Promise<boolean>`; `onClose` (existing prop).

- [ ] **Step 1: Visibility rules** (computed once near `canChangeStatus`):
  ```ts
  const onOwnBoard = !trackSlot && boardMode !== 'active-boards' && !!user;
  const canRemoveFromBoard = onOwnBoard && activeTenant?.orgRole === 'admin';
  const canUntrack = onOwnBoard && !canRemoveFromBoard && viewMode === 'my-bills';
  ```
  (`canUntrack` mirrors `protected-kanban-board.tsx`'s `shouldShowUnadoptButton`.)
- [ ] **Step 2: Desktop.** As the first item in the `data-bill-tour="actions"` wrapper (before Testimony/Contact), render an `size="sm" variant="outline"` button with `border-destructive/35 text-destructive hover:bg-destructive/10`, an `X` icon, and the label **"Remove from board"** (wrapped in `RemoveFromBoardDialog` with `onRemoved={onClose}`) or **"Untrack"** (calls `untrackBill(bill.id)`, then `onClose()` when it returns `true`). Show it on every bill, live or failed.
- [ ] **Step 3: Mobile.** In the sticky bar, render the same action as a full-width `h-11` row under the Testimony/Contact grid, in the slot `trackSlot` uses (they're mutually exclusive by `onOwnBoard`).
- [ ] **Step 4: Verify.** `pnpm typecheck && pnpm test && pnpm build` all pass. Manual:
  - As an admin, Board → open any bill → "Remove from board" → confirm → the dialog closes, the card is gone, and it's still gone after a reload. **(Review Focus 4)**
  - As a worker in My Bills → "Untrack" → the dialog closes and the card is gone.
  - Opening the dialog from Search shows Track Bill and no Remove. From Active Boards there's no Remove. Signed out, there's no Remove.
  - At ~375px, the Remove row sits under Testimony/Contact.
- [ ] **Step 5: Commit.** `feat: remove or untrack a bill from the bill details dialog`

---

### Task 5: Briefing — full failure explanation in the existing "Bill failed" block

**Files:**
- Modify: `src/components/kanban/bill-briefing.tsx`
- Modify: `src/components/kanban/bill-details-dialog.tsx` (replace the `deadReason` computation ~232–243 with `explainDeadBill`; pass the result down)

**Interfaces:**
- Consumes: `explainDeadBill`, `DeadBillExplanation` (Task 1).
- Changes `BillBriefing`'s props: replace `deadReason: string | null` with `deadExplanation: DeadBillExplanation | null`. The `dead` prop stays.

- [ ] **Step 1: Compute in the dialog.** When `bill.dead && billDetails`, call `explainDeadBill({ billNumber, billStatus, committeeAssignment: committeeAssign ?? null }, billDetails.updates mapped as today, SESSION_DEADLINES, today)`. Otherwise `null`. (This also covers dead bills with no committee assignment, which previously got the generic fallback.)
- [ ] **Step 2: Briefing, failed bills only.**
  - Hide the testimony line (`facts.testimony` row) when `dead`.
  - The standing tile gets `sm:col-span-3` when `dead` (it spans the grid; the Latest version and Committees tiles wrap below it), and keeps its existing `border-red-300 bg-red-50` box and the uppercase red `h4` (keep the label text "Bill failed", or use "Where it ended" when `deadExplanation.heading` is the closed-status one).
  - Body, using the tile's existing `text-[12px] text-red-600` paragraph style for the summary: `summary`; then, if `missedDeadline`, one line `Missed deadline: {name} · {date}` in the same text style, with `font-semibold` on the name; then `committeeExplanation` and (if `showRevivalNote`) the revival sentence, both in `text-[12px] text-foreground/80`. Use `space-y-1.5`. No new borders, icons, headers or source footer.
  - With `deadExplanation` null but `dead` true (details still loading), show today's fallback `'This bill is no longer moving.'`.
  - The progress bar and the Latest version / Committees tiles stay as-is.
- [ ] **Step 3: Verify.** `pnpm typecheck && pnpm test && pnpm build` all pass. Manual: open a failed bill → progress bar → the full-width red "Bill failed" block with summary / missed deadline / explanation / revival note → the version and committee tiles below, with no testimony line. The text matches the card popover word for word. A live bill's briefing is pixel-identical to before. Mobile layout stacks cleanly.
- [ ] **Step 4: Commit.** `feat: show the full failure explanation in the bill briefing`

---

### Task 6: Ship

- [ ] **Step 1:** `pnpm typecheck && pnpm test && pnpm build` all pass on the branch.
- [ ] **Step 2:** Push `feat/failed-bill-remove` and open a PR against `fix/removed-bill-still-tracked` (retarget to `dev` once #240 merges). Use the CLAUDE.md PR format (Summary + QA steps covering the manual checks from Tasks 3–5, plus admin / worker / public / mobile edge cases). Then run the Codex review loop.
