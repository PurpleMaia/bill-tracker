# Bill Education Tooltips & Explainer — Design

**Date:** 2026-08-12
**Status:** Approved design, ready for implementation planning

## Problem

The tracker assumes legislative literacy that a global audience does not have. A user
arriving from a shared link sees `HB1494`, `RELATING TO AGRICULTURE`, `AGR · FIN`,
`HB1494_HD1`, `HSCR65`, `CROSSOVER & WAITING 1ST`, and `First Decking · 8d` — and nothing
on the page explains any of it.

Two distinct gaps:

1. **Term gaps.** A word or code whose meaning is unknown ("what is a committee report?").
2. **Causal gaps.** Facts that are only meaningful as part of a sequence. "Crossover means
   the bill moves to the other chamber" does not explain *why* it must — that only makes
   sense once you know both chambers must pass identical text before anything reaches the
   Governor.

Tooltips can close term gaps. They structurally cannot close causal gaps. The design
therefore has two layers, with the tooltips acting as an index into the narrative.

## Existing assets (this is largely wiring, not authoring)

A significant fraction of the needed content already exists and is stranded:

| Asset | Location | Current reach |
|---|---|---|
| `COLUMN_DESCRIPTIONS` | `src/lib/bills/kanban-columns.ts:81-134` | Column header popover only. Already novice-grade prose covering First Reading, crossover, conferees, Finance/Ways and Means, veto override. |
| `committeeFullName` | `src/lib/testimony/committees.ts:52` | Exactly one tooltip (`kanban-card.tsx:413`) |
| `describeVersionLabel` | `src/lib/versions/version-labels.ts:23` | **Zero UI consumers.** Used only by `summary-prompts.ts`. |
| `DeadBillInfoPopover` | `src/components/kanban/dead-bill-info-popover.tsx` | Proven explainer pattern to imitate |
| `ui/tooltip.tsx`, `ui/popover.tsx` | `src/components/ui/` | Radix, already portalled |

Two constraints discovered while reading these:

- `describeVersionLabel` returns `null` for unrecognized labels (by design — it refuses to
  assert unverifiable positions). `HFA4`, `_PROPOSED`, and malformed labels all return
  `null`.
- `committeeFullName` passes **unknown codes through unchanged**, so it can return the code
  itself (`"XYZ"` → `"XYZ"`), which is not a definition.

Both mean the term component must handle *absent* definitions by rendering plain text with
no affordance — never a marker that opens an empty card. This is a correctness requirement,
not an edge case: it is the difference between "quietly no help here" and "the app is
broken."

## Architecture

Four units, each independently understandable and testable.

### 1. Content layer — `src/lib/glossary/terms.ts`

Pure module, no DB, no React. Consistent with the `src/lib/` DB-free convention.

```ts
export type TermSlug = 'crossover' | 'committee-report' | /* … */;

export interface GlossaryTerm {
  term: string;              // display name, e.g. "Crossover"
  short: string;             // 15–40 words, the tooltip body
  learnMoreAnchor?: string;  // '/learn' anchor id, only for causally-hard terms
}

export const GLOSSARY: Record<TermSlug, GlossaryTerm>;
```

**Delegation rule:** where copy already exists, the registry references the existing source
rather than duplicating it. Status terms resolve through `COLUMN_DESCRIPTIONS`; committee
codes through `committeeFullName`; version labels through `describeVersionLabel`. One source
of truth per fact. Duplicating that prose here would guarantee drift.

Because delegated lookups are dynamic (a committee code is data, not a compile-time slug),
the layer exposes resolver functions alongside the static registry:

```ts
export function resolveStatusTerm(statusId: string): GlossaryTerm | null;
export function resolveCommitteeTerm(code: string): GlossaryTerm | null;   // null on unknown code
export function resolveVersionTerm(label: string): GlossaryTerm | null;    // null when describeVersionLabel returns null
```

Each returns `null` rather than a placeholder, so callers can omit the affordance entirely.

**Two entry points, deliberately.** Static terms are addressed by compile-time slug
(`<Term slug="crossover">`) so a typo is a type error. Delegated terms are addressed by
runtime *data* — a committee code or version label is a string from the DB, not a slug —
so those go through the resolvers and pass the result as an object
(`<Term term={resolved}>`). These are not redundant APIs; they exist because half the
vocabulary is known at compile time and half is not.

### 2. Component layer — `src/components/ui/term.tsx`

```tsx
<Term slug="crossover">Crossover</Term>
<Term term={resolvedTerm}>{children}</Term>   // for dynamic/delegated lookups
```

Renders a Radix **Tooltip** on fine-pointer devices and a Radix **Popover** otherwise.
Both primitives are already dependencies.

**Pointer detection.** `window.matchMedia('(hover: hover) and (pointer: fine)')`, read in
`useEffect` and held in state. It must **default to popover** on first render: SSR has no
`matchMedia`, and defaulting to tooltip would give every touch user a hover-only affordance
on first paint plus a hydration flip. Popover-first fails safe — a desktop user gets
click-to-open for one tick. The media query (not user-agent sniffing) correctly handles
iPads with keyboards, touchscreen laptops, and desktop-mode phones.

**Absent definition.** When `slug`/`term` resolves to `null`, render `children` as plain
text with no trigger, no marker, no wrapper.

**Requirements (each exists because it would otherwise regress silently):**

- Trigger is a real `<button>` and calls `stopPropagation()` on activation — nearly every
  Tier 1 term sits inside an already-tappable parent (kanban card → opens dialog,
  spreadsheet row, version link). Without this, tapping a term opens the bill dialog.
- Content is portalled, width-constrained (must fit a 375px viewport), and
  collision-repositioned rather than pushed off-screen. Cards live in horizontally
  scrolling `overflow-hidden` columns; the dialog is a modal; the spreadsheet scrolls both
  axes.
- Layers above the bill dialog when opened from inside it.
- Dismisses on scroll of an ancestor container, outside press, and Escape.
- The outside press that dismisses must not activate what it landed on — otherwise
  dismissing a definition on a card opens the bill dialog.
- Keyboard reachable via Tab, opens on Enter/Space.
- `aria-describedby` in tooltip mode; standard Radix popover semantics in popover mode.
  Mobile screen readers get the definition announced in popover mode, which hover tooltips
  do not provide.
- Never renders a `<button>` inside an `<a>` (invalid HTML) — see the sibling-ⓘ rule below.

**Also in this unit:** add a single `TooltipProvider` to `src/lib/core/providers.tsx`.
There is currently none at the app root, and every existing usage wraps its own.

### 3. Wiring layer

**Trigger-shape rule** (decides every chip case, no per-site improvisation):

> The whole chip becomes the trigger when the chip has no other action. Otherwise the
> existing link/action keeps the tap and a sibling ⓘ carries the definition.

Applied:

| Surface | Treatment |
|---|---|
| Committee code chips | Whole chip. (Upgrade: today's hover tooltip is unreachable on touch.) |
| Chamber badges `H`/`S` | Whole badge. A bare letter is meaningless to a novice. Appears in both `bill-details-dialog` status-updates panel and `bill-reference-panel`. |
| Status badges | Whole badge, body from `COLUMN_DESCRIPTIONS`. |
| Version labels linking to a PDF | Link keeps the tap; sibling ⓘ. Stealing the tap from "open the bill text" is a downgrade, and nesting is invalid HTML. |
| Deadline pills | Whole pill. Tier 3 deadline-name copy folds into the existing chair-scheduling tooltip rather than competing with it. |

**Marking style.** Always marked — the audience does not know what it does not know, and a
learning-mode toggle adds persisted state plus a discoverability problem to solve a
busyness problem better solved by restraint. Prose terms get a muted dotted bottom-border
inheriting text color (no color change, no icon) so they read as footnotes, not links.
Chips get **no added icon** — the existing border/background is the affordance, plus
`cursor-help`. ⓘ appears *only* in the sibling case.

Consequence accepted: there is no user-facing toggle, so if marks prove noisy the fix is
styling, not a setting.

**Marking density per surface** — the difference between educational and vandalized:

- **Kanban cards**: only terms needed to parse the card itself — status badge, committee
  chip, deadline pill. Cards do **not** mark bill-number anatomy, "RELATING TO", or
  introducers, even though those terms exist in the registry.
- **Bill dialog / briefing / contact / testimony**: full marking. Someone here has
  signaled they want detail, and there is room.

**Coverage — Tiers 1–3 (all in scope):**

*Tier 1 — content exists, pure wiring:*
- Statuses → dialog status `Select`, spreadsheet badges, card badges, pill strip
  (currently `COLUMN_DESCRIPTIONS` reaches only column headers)
- Committee codes → briefing, spreadsheet, `bill-reference-panel`, contact page
- Version labels → versions panel, compare pickers, diff accordion, briefing

*Tier 2 — new content, immediately-encountered structural terms:*
Bill number anatomy (HB vs SB); "RELATING TO" / measure title; Introducers; Committee and
committee chair (including what power a chair holds — this is what explains why bills die);
Committee report and report codes (HSCR/SSCR/CCR); what a bill version is and why there are
several; Crossover; Conference; Fiscal (FIN/WAM); chamber badges.

*Tier 3 — hardest jargon, explained nowhere today:*
Decking, Lateral, Sine Die, Triple Referral, Single Referral Filing.

### 4. Explainer — `/learn`

A static narrative walkthrough of one bill's journey, **not** an alphabetized glossary dump.
Each stage answers *what happens* and *why this exists / what kills a bill here*. Causal
questions live here; this is the layer that answers "why must it go to the other chamber."

- `id` anchors on each stage, matching `learnMoreAnchor` values in the registry.
- Optional `?bill=` param marks "you are here" on the walkthrough and shows the bill number
  in a small header. It reads the bill through the **existing** `data.bills` client path
  (per the data-client convention — no raw `fetch`, no new `db/queries` function, no new
  API route). The status it maps onto the walkthrough is `bills.bill_status`, which is
  already derived server-side by `recomputeDerivedStatus`; `/learn` only reads it.
  Mapping status → stage reuses the existing `COLUMN_INDEX` ordering rather than
  introducing a third status taxonomy.
- Degrades cleanly with no param (the canonical walkthrough).
- Explicit back affordance. On touch, "Learn more" navigates away from the board and the
  user loses scroll position and any open dialog; leaving the browser back button as the
  only exit is worse on mobile than desktop. Exact board scroll restoration is
  deliberately *not* attempted — disproportionate.
- Tooltip "Learn more" links carry `?bill=` when opened from a bill context.

Only the ~8–10 causally-hard terms get `learnMoreAnchor`. `Introducers` is done in one
sentence and gets no second tier.

**Taxonomy hazard.** The app already has two independent status vocabularies: the 21
`KANBAN_COLUMNS` ids and the separate `PROGRESS_STAGES` array hardcoded at
`bill-details-dialog.tsx:81-101` (Introduced / Orig. Chamber / Non-Orig. Chamber /
Conference / Governor / Law), which has no descriptions anywhere. `/learn` stages must map
onto one of these, not invent a third. The walkthrough follows the `PROGRESS_STAGES` arc —
it is the coarse narrative shape a novice needs — while term-level status copy continues to
come from `COLUMN_DESCRIPTIONS`. Implementation should lift `PROGRESS_STAGES` out of the
dialog into a shared module so `/learn` and the dialog cannot drift apart.

## Out of scope

- **Raw `statustext` parsing.** Explaining "Passed Second Reading and referred to the
  committee(s) on FIN with none voting aye with reservations…" is a large feature on its
  own. Deferred per explicit instruction.
- **Guided first-run tour.** Rejected during design: a global audience arriving from a link
  is not onboarded, it is dropped mid-page, and a one-time tour does not help six weeks
  later at first contact with "First Decking."
- **Auto-linkifying text scanner.** Rejected: cannot distinguish "Finance" the committee
  from "finance" the verb, matches inside words, and transforms arbitrary scraper text.

## Known issues, deliberately not fixed

Found during inventory; out of the Tiers 1–3 scope, recorded so they are not lost:

- `src/components/kanban/temp-card.tsx:113,117` prints raw status IDs (`crossoverWaiting2`)
  to users instead of using `formatBillStatusName`.
- `src/lib/bills/bill-briefing-facts.ts:84` prints a raw status ID in its no-deadline
  fallback (`Currently ${status}`).

These are display bugs, not education gaps.

## Testing

Pure unit tests in `src/lib/__tests__/` per project convention (pure logic only, no DB, no
mocking):

- Every `learnMoreAnchor` resolves to an anchor id that exists in the `/learn` stage list
  (guards the dead-link failure mode).
- No orphan registry entries; no duplicate slugs.
- Tier 1 delegation returns non-empty copy for every `KANBAN_COLUMNS` id — pairs with the
  existing `kanban-columns.test.ts:217-227` invariant.
- `resolveCommitteeTerm` returns `null` for a code absent from `COMMITTEE_NAMES` (not the
  passed-through code).
- `resolveVersionTerm` returns `null` where `describeVersionLabel` does (`HFA4`,
  `_PROPOSED`, malformed labels).

Component interaction behavior (pointer branching, tap isolation, dismissal) is not
unit-tested — the convention here is pure-logic tests only, so those are verified manually
against the requirement list in §2.

## Success criteria

A user with no legislative background can, without leaving the app:

1. Learn what any marked term on a bill means in one interaction, on phone or desktop.
2. Follow "Learn more" from a hard term to a narrative that explains why that stage exists.
3. See where the bill they came from currently sits in that narrative.
