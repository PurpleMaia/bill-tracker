# Removing failed bills — design

**Date:** 2026-11-17
**Size:** small change
**Mockups:** `.superpowers/brainstorm/45000-1794958138/content/failed-bill-final.html` (gitignored)

## Intent

When a bill fails, users want it off their board, but they don't find the remove action. The action exists only inside the red ⓘ popover ("Why did this bill fail?"). An info icon reads as optional reading, not as a place to act. The card's normal X is also hidden on failed bills (`canRemoveFromBoard && !bill.dead`), so the place users already know disappears exactly when they need it.

Goal: put removal where users naturally look (the card corner, and the dialog's action row, which on mobile is the bottom bar), and **still encourage users to read why a bill failed.**

Non-goals: changing how removal works on the server, the confirmation step, or who may remove.
Anti-goal: a destructive button that gets tapped without thinking (keep the confirmation dialog, and use an outline button, not filled red).

## Approaches considered

- **Make the ⓘ more prominent (bigger, brighter).** Rejected. The icon's meaning ("optional info") is the problem, not its size.
- **Card X only.** Covers people who look for the X, but not people who open the bill, and does nothing for mobile.
- **Card X + dialog action (chosen).** Covers both ways users look for it. In the dialog, the "Why did this bill fail?" explanation replaces the general briefing, so a user who opens a failed bill gets the reason without clicking the ⓘ.

Within that approach, Jaden picked:
- **Card corner:** 2B (the X takes the top-right corner; the ⓘ leaves it), not 2A (the X in the bill-number row with the ⓘ still in the corner).
- **Why-it-failed trigger:** a single **Failed | Why? ›** pill, not a small ⓘ beside the badge, and not a text line under the card.
- **Dialog Remove placement:** the header action row (every bill), not inside the failure panel, because it carries over to the mobile bottom bar.
- **Dialog content for failed bills:** a trimmed briefing (D2) **that keeps the progress bar**.

## Design

### Card (`kanban-card.tsx`), failed bills only
1. **Corner X:** always visible on failed cards (not hover-only, since phones have no hover), not grayed out, in the top-right corner of the tags row. It runs the same action as the live card's X: Remove from board (with confirmation) for org admins, Untrack for everyone else allowed to untrack. Live cards don't change.
2. **The red ⓘ circle goes away.** The footer's Failed badge becomes a **Failed | Why? ›** pill (red "Failed" half, white "Why? ›" half with a red outline). The whole pill opens the existing `DeadBillInfoPopover`. The popover keeps its own Remove button.
3. **One-time pulse:** the pill pulses once, the first time a failed card renders in this browser. The "seen" flag lives in `localStorage`, wrapped in try/catch; if storage isn't available, there's simply no pulse. *(My call. Easy to drop.)*

### Bill details dialog (`bill-details-dialog.tsx`)
4. **Remove from board in the header action row**, beside Write Testimony and Contact, on every bill for org admins (the same `activeTenant?.orgRole === 'admin'` rule as the card). It's an outline button with destructive colors and opens the same "Remove Bill from Board?" confirmation. On success, it closes the dialog and the card leaves the board. Users who can only untrack get **Untrack** in the same spot. *(My call: this mirrors the card's X.)* The button doesn't show in Search or on Active Boards, where the dialog receives a `trackSlot` or is read-only.
5. **Mobile:** in the sticky bottom bar, the button takes the full-width row under Testimony and Contact. That row holds `trackSlot` only when the dialog is opened from Search, so the two never collide.
6. **Failed bills, Overview tab: keep `BillBriefing`'s existing look.** Don't restyle the briefing. The card container, the "Bill briefing" heading, the progress bar and the Latest version / Committees tiles all render exactly as they do today. Only the failed-bill content changes, in two places:
   - The **testimony line is hidden** for failed bills, since testimony is closed and the explanation covers it.
   - The existing red **"Bill failed" block** (today's standing tile: `border-red-300 bg-red-50`, uppercase red label) **spans the full grid width** and holds the popover's explanation: the summary, the missed-deadline name and date, the committee explanation and the revival note. Its existing label and text styles stay. This replaces the one-line `deadReason`. The Latest version and Committees tiles sit beside or below it in the same grid. It is **not** a new panel with its own header, icon or source footer.

   Live and enacted bills don't change. *(The final mockup shows a separate styled panel; the briefing's own styling overrides it.)*
7. **One source of truth for the explanation:** pull the popover's reason logic (summary, committee explanation, missed deadline and closed-status branches) out into a shared, pure helper that returns the text pieces. `DeadBillInfoPopover` keeps its current markup and `BillBriefing` uses its own styling, but both get the text from the helper, so the wording can't drift. Fetching and computing data stays in the parents; the dialog passes its full `billDetails.updates` as `statusUpdates`.

## Left to the builder
- The exact name of the shared helper (it lives in `src/lib/bills/` and gets a unit test in `src/lib/__tests__/`).
- The pulse animation's exact styling, and its `prefers-reduced-motion` handling (no pulse when reduced motion is set).
- Marking the failed stage on the progress bar (the mockup shows it in red) is optional polish. Skip it if it isn't a cheap change to `Progress`.
