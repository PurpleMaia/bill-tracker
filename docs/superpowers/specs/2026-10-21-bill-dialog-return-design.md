# Return to the Bill Dialog — Design

**Date:** 2026-10-21
**Status:** Draft
**Branch:** `feat/improve-bill-navigation`

## Why

In user testing, testers opened a bill dialog, went into **Contact Legislator** or
**Write Testimony**, then pressed the browser back button or the page's own Back button.
They landed on a plain board with the dialog closed. They hunted for the bill, didn't
find it, and gave up on the task.

Root causes in today's code:

- Which bill is open lives only in component state (`selectedBillId` / `openBillId`),
  copied separately in four hosts: `components/kanban/kanban-board.tsx`,
  `components/kanban/kanban-spreadsheet.tsx`, `components/calendar/calendar-view.tsx`,
  `components/search/bill-search-view.tsx`. Nothing is in the URL.
- The dialog's Contact/Testimony buttons call `onClose()` *before* `router.push(...)`
  (`components/kanban/bill-details-dialog.tsx` ~L423, L483, L532–533, L725, L737).
- Both destination pages hard-code their Back target:
  `backHref = from === 'testimonies' ? '/testimonies' : '/'`
  (`app/bills/[id]/contact/page.tsx:78`, `app/bills/[id]/testimony/page.tsx:37`).
  `/` is **Discover** (`app/(main)/page.tsx` re-exports `discover/page`), so a user who came
  from **Your Bills** (`/your-bills`) or **Boards** (`/boards`) is sent to a different screen
  entirely.

## Goal

After visiting Contact Legislator or Write Testimony from a bill dialog, going back — via
the browser/phone back button **or** the in-app Back button — returns the user to the
screen they came from with **that same bill dialog open**.

### Non-goals

- A Share button (copy link / native share sheet / link previews). Shelved; a follow-up
  can build on the URL param introduced here.
- Turning the bill dialog into its own route (`/bills/[id]` with intercepting/parallel
  routes). Considered and rejected as a larger restructure than this problem needs.
- Restoring the rest of the host page's position on return: calendar month/selected day,
  spreadsheet sort, scroll position. Only the dialog and the view type (kanban /
  spreadsheet / calendar) come back. *(Decided by Jaden.)*
- Remembering the dialog's active tab (Overview / Versions / Updates). Reopens on
  Overview. *(Claude's call.)*

### Anti-goals (would be a failure even if it "works")

- The in-app Back button can be pointed at an external site via a crafted link (open
  redirect).
- Closing the dialog and then pressing back reopens the dialog the user just closed.
- Any of the four hosts silently keeps the old behavior.

## Design

### 1. Open bill lives in the URL

- The open bill is a query param on the host page: `?bill=<bill.id>`
  (e.g. `/your-bills?bill=123`, `/discover?bill=123`, `/boards?bill=123`).
  Uses the internal bill id, not the bill number — unambiguous across sessions.
  *(Claude's call.)*
- All four hosts derive "is the dialog open / which bill" from that param instead of local
  state. Other existing query params on the page are preserved when adding/removing
  `bill`.
- **Opening** a bill (card click, row click, calendar milestone, search result) adds the
  param as a new history entry, so the browser/phone back button closes the dialog.
  *(Claude's call — matches common app behavior.)*
- **Closing** the dialog (X, overlay click, Esc) removes the param. Constraint: after
  closing, pressing back must **not** reopen the dialog. The builder chooses the mechanism
  (e.g. `router.back()` when the dialog was opened by an in-session push, otherwise
  `router.replace` without the param).
- Navigation that only changes the param must not scroll the page to the top
  (`{ scroll: false }`).
- Loading a URL that already has `?bill=` (refresh, back navigation) opens the dialog for
  that bill. If the id doesn't resolve to a bill, the dialog shows its existing error state
  or simply doesn't open — no crash. The dialog already fetches its own details by
  `billID`; hosts that pass extra props from their in-memory list (e.g. Discover's track
  button via `openBill`) must cope with the bill not being in the list yet.
- `KanbanBoard` and `KanbanSpreadsheet` currently keep a separate `isDialogOpen` flag
  alongside `selectedBillId`; both collapse into the single URL param.
- Next 15 requires `useSearchParams` consumers to sit under a `<Suspense>` boundary for
  prerendered pages; add boundaries where needed. Run `pnpm build` to confirm.

A small shared hook (e.g. `useBillDialogParam()` returning `{ openBillId, openBill, closeBill }`)
is the expected shape so the four hosts don't each reimplement it. Exact name/location is
the builder's call; it belongs in `src/hooks/`.

### 2. Leaving the dialog keeps the dialog in history

- The dialog's Contact and Testimony buttons (all five call sites) stop calling
  `onClose()` before navigating. They just `router.push` to the destination, so the host
  URL with `?bill=` stays as the previous history entry. Browser back then lands on it and
  the dialog reopens.
- They append a return path: `/bills/<id>/contact?returnTo=<encoded current path + query>`
  (same for `/testimony`). The current path + query already includes `bill=<id>`.

### 3. In-app Back / Done on the destination pages

- `contact/page.tsx` and `testimony/page.tsx` compute `backHref` as:
  1. `returnTo`, if present and safe;
  2. else `/testimonies` when `from=testimonies` (existing behavior, keep it — used by
     `components/testimony/testimonies-view.tsx`);
  3. else `/`.
- **Safe** means: a same-origin relative path — starts with a single `/`, not `//`, not
  `/\`, no scheme. Anything else is ignored and falls through to rule 2/3. This check is a
  pure function in `src/lib/` (e.g. `src/lib/core/safe-return-path.ts`) with a unit test in
  `src/lib/__tests__/`.
- Applies to every place those pages use `backHref`: header Back button, the contact
  page's skeleton/error-state Back buttons, and the testimony page's `doneHref`.
- The Back button keeps using `router.push(backHref)` (not `router.back()`), so it works
  even when the page was opened directly in a new tab.
- No link connects Contact and Testimony to each other, so `returnTo` doesn't need to be
  passed from one to the other.
- Other hard-coded `/` exits on the testimony page: `router.replace('/')` when the bill
  fails to load (~L97) should also follow `returnTo` *(Claude's call)*. The "Go to sign
  in" link (~L213) keeps going to `/`.

### 4. Discover's saved-filter restore

`components/search/bill-search-view.tsx` (~L40–58) skips restoring saved filters whenever
the URL has *any* query param. That check must ignore the `bill` key. Otherwise returning
to `/discover?bill=…` resets the user's search, and the track button disappears because the
bill isn't in the list.

### 5. Close animation

The board and spreadsheet keep `selectedBillId` after closing so the dialog's exit
animation still has content. With the URL param, the hook (or host) holds on to the last id
while the dialog animates out.

## Acceptance checks (manual)

For each host — Discover (`/` and `/discover`), Your Bills in kanban, spreadsheet and
calendar view, Boards:

1. Open a bill → URL gains `?bill=`.
2. Click Write Testimony → browser back → same host, same view type, same bill dialog open (calendar month, sort and scroll may reset).
3. Same, using the in-app Back button.
4. Repeat 2–3 with Contact Legislator.
5. Close the dialog → URL loses `?bill=` → browser back does not reopen it.
6. Open a bill → browser back → dialog closes, still on the host page.
7. Refresh with `?bill=` in the URL → dialog opens.
8. `/bills/<id>/testimony?returnTo=https://evil.example` → Back goes to `/`.
9. From `/testimonies`, open a testimony → Back still goes to `/testimonies`.

Plus `pnpm test`, `pnpm typecheck`, `pnpm build`.

## Left to the builder

- Hook name/location and exact API.
- Close mechanism that satisfies the "back must not reopen" constraint.

## Notes

- The kanban/spreadsheet/calendar choice (`view` in
  `hooks/contexts/kanban-board-context.tsx`) is in-memory state in the root layout. It
  survives client-side navigation, so browser back and the in-app Back keep it. A refresh
  or a new tab resets it to kanban, and with `?bill=` the dialog then opens over kanban.
  That's acceptable; no change here.
