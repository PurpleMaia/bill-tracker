# Jaden Kapali Org — Showcase Board Seed (dummy bills)

**Date:** 2026-07-30
**Status:** Approved design, pending implementation-plan
**Author:** Jaden + Claude

## Goal

Populate the **Jaden Kapali** organization board (`tenants.slug = 'jaden-kapali'`,
id `dea7be8b-3aba-4dbd-9be0-0206927b2861`) with a curated set of **dummy** bills so
every meaningful board state is demonstrable for a walkthrough:

- A bill whose **testimony is nearly due** and still writable (live countdown).
- A bill whose **testimony deadline has already closed** (hearing passed).
- Bills that **failed in different columns for their respective reasons**
  (deferred by committee, recommendation not adopted, missed deadline).
- **One card in each simple-view column** to showcase end-to-end usage.

## Constraints (from the user)

1. **Use dummy bills** (fake `dummy.test` URL prefix), not real bills — full control
   over status, dates, dead-flag, and hearing text; trivially removable.
2. **Only fill gaps** — do not modify the ~62 bills already in the Jaden org.
3. **Seed data only** — no UI work this task (we observe how current UI renders closed
   testimony afterward, then decide on any UI follow-up).
4. Track showcase bills under **`jkapali`** (org admin, user id `ca18f8b7`).
5. Tune deadline/testimony dates to the **demo calendar**
   (`NEXT_PUBLIC_DEMO_DEADLINES=1`, dates near today 2026-07-30).
6. **Reversible** via an undo script keyed on the dummy URL prefix.

## Pattern to follow

Mirror the existing `scripts/seed-dummy-column-bills.ts` +
`scripts/undo-seed-dummy-column-bills.ts` pair. New scripts use a **distinct** URL prefix
so undo removes only this showcase set and never the column-stress dummies (HB9910–…) or
the older HB9901–SB9904 dummies.

- Seed prefix: `https://dummy.test/jaden-showcase/`
- Seed: `scripts/seed-jaden-org-showcase.ts`
- Undo: `scripts/undo-jaden-org-showcase.ts` (delete referencing rows then bills, keyed on prefix)

## How the board reads status (verified against code)

- Tenant board fetch `innerJoin`s `user_bills` filtered by `tenant_id` → each dummy bill
  needs a **`user_bills` row** `{ user_id: jkapali, bill_id, tenant_id: jaden }`.
- Card placement uses `current_bill_status` = **`org_bills.bill_status` ?? global
  `bills.bill_status`** (`bill-mappers.ts:156`). We control both, so we simply set the
  dummy bill's global `bill_status` and an `org_bills` row to the **same** target status.
- Testimony countdown (`kanban-card.tsx:146-151`): shows when
  `isTestimonyUrgent(current_bill_status)` (status is `scheduled*`) **and** the bill's
  **latest** `status_update` text has a parseable hearing datetime. Countdown targets
  *hearing − 24h*; `getDeadlineTier` colors it (≤7d urgent, ≤14d warning, else safe).
- "Latest" status_update = newest `date` cast to date, desc (`bills-read.ts:363`) — the
  seed makes the hearing-notice row the newest-dated one.
- Closed testimony: `getTestimonyDeadline` → `hearingPassed: true` once the hearing
  datetime is past; `testimonies-view.tsx` already renders a "submission window closed"
  note. (Kanban card simply drops the countdown once passed — a candidate gap to note.)
- Dead/failed cards: driven by `bills.dead = true` plus the latest status_update text.
  `getDeadReasonFromUpdate` (dead-bill.ts) derives the reason label shown in the card /
  dead-bill popover from that text:
  - "deferred the measure" (no "until") → **Deferred by <CMTE>**
  - "recommendation was not adopted" → **Recommendation not adopted by <CMTE>**
  - neither → **Missed deadline**

## Demo calendar anchors (for date tuning)

From `session-deadlines-demo.json`, today = 2026-07-30:
- first_triple_referral_filing HB 2026-07-10 / SB 2026-07-12 (already passed → failure)
- first_lateral 2026-07-17 (passed)
- single_referral_filing SB 2026-07-21 (passed), HB 2026-08-20 (upcoming)
- first_decking 2026-08-07, first_crossover 2026-08-14 (upcoming)
- final_decking_non_fiscal 2026-10-07 / fiscal 2026-10-09 (testimony stays open until then)

## The showcase set (dummy bills)

Each row is one dummy bill. `bill_status` and `org_bills.bill_status` are set to the same
target. Bill numbers are illustrative; finalized in the plan (unique, non-colliding with
existing dummies). Chamber prefix chosen per committee mix to land the intended tier.

| # | Case | Status / column | Committee mix | Dates & latest status_update |
|---|------|-----------------|---------------|------------------------------|
| 1 | **Testimony nearly due**, writable | `scheduled1` (SCHEDULED) | non-fiscal (e.g. `AGR`) | latest update dated ~2026-07-29 with hearing **~2026-08-01 (≈36h out)** → "Testimony due in ~36h", warning tier; Write Testimony open (before final decking 10/07) |
| 1b | Testimony **urgent** variant (optional) | `scheduled2` | non-fiscal | hearing **≈2026-07-31 (<24h)** → "Testimony due now", urgent tier |
| 2 | **Testimony closed** (hearing passed) | `scheduled3` (SCHEDULED) | non-fiscal | latest update with hearing **~2026-07-29 (≈12h ago)** → `hearingPassed`; observe how card + testimonies view render the closed window |
| 3a | Failed: **deferred by committee** | `scheduled1`, `dead=true` | `JDC` | latest update: "The committee(s) on JDC deferred the measure." → **Deferred by JDC** |
| 3b | Failed: **recommendation not adopted** | `waiting2`, `dead=true` | `WAM` | latest update: "The committee(s) on WAM recommended that the recommendation was not adopted." → **Recommendation not adopted by WAM** (verified: the "committee(s) on X" form is required for the committee name to attach) |
| 3c | Failed: **missed deadline** | `introduced`, `dead=true` | triple `AGR, EDN, FIN` | no scheduling; triple-referral filing deadline (7/10) already passed while still `introduced` → **Missed First Triple Referral Filing deadline** |
| 4 | **Every simple-view column** | one dummy per column not otherwise covered | mix | placed by status/org_bills; see column list below |

### Simple-view columns to guarantee one card each

`STATUS_TO_SIMPLIFIED` maps statuses to these simple columns. One dummy per column
(some already satisfied by cases 1–3):

- **INTRODUCED & WAITING** — `introduced` (also covered by 3c) and/or `waiting2`
- **SCHEDULED** — `scheduled1/2/3` (covered by 1, 1b, 2)
- **CROSSOVER & WAITING** — `crossoverWaiting1`
- **CROSSOVER SCHEDULED** — `crossoverScheduled1` (add hearing text for a second testimony-due card here if desired)
- **CONFERENCE** — `passedCommittees`
- **AWAITING COMMITTEES** — `conferenceAssigned`
- **SCHEDULED (conference)** — `conferenceScheduled`
- **PASSED CONFERENCE** — `conferencePassed`
- **TRANSMITTED TO GOVERNOR** — `transmittedGovernor`
- **GOVERNOR VETOED** — `vetoList`
- **GOVERNOR SIGNED INTO LAW** — `governorSigns`
- **LAW WITHOUT SIGNATURE** — `lawWithoutSignature`

Net: ~12–15 dummy bills. Existing org bills are left untouched and provide extra coverage.

## What the seed writes (per dummy bill)

Following `seed-dummy-column-bills.ts`:

1. `bills` row: `bill_url = <prefix><billNumber>_2026`, `bill_title`, `nickname`
   (`Showcase — …`), `description` (marked dummy), `bill_number`, `introducer`,
   `committee_assignment`, `bill_status = target`, `ai_status = target`,
   `food_related = true`, `year = 2026`, `dead = <case>`.
2. `status_updates` rows: an intro row plus, for scheduled/failed cases, a **latest-dated**
   row carrying the hearing-notice or deferral text that drives the UI state.
3. `user_bills` row `{ user_id: jkapali, bill_id, tenant_id: jaden }`.
4. `org_bills` row `{ tenant_id: jaden, bill_id, bill_status: target }`
   (`onConflict doNothing`).

Idempotent: bills keyed by URL; re-run is a no-op / only ensures tracking rows.

## Reversibility

`scripts/undo-jaden-org-showcase.ts` deletes all rows referencing bills whose
`bill_url LIKE 'https://dummy.test/jaden-showcase/%'`, then the bills — same structure as
`undo-seed-dummy-column-bills.ts`. Because these are dedicated dummy bills, cleanup is
total and cannot affect real bills, existing org bills, or other tenants. No provenance
file needed.

## Verification (after seeding)

1. `npm run typecheck`.
2. Run seed; run a read asserting the Jaden org now has ≥1 card in every simple-view
   column and the three failure exemplars are `dead` with expected reasons.
3. Launch with `NEXT_PUBLIC_DEMO_DEADLINES=1`, open the Jaden org board (simple view) as
   `jkapali`, confirm:
   - Case 1 → "Testimony due in ~36h" (warning), Write Testimony open.
   - Case 2 → closed-window state (record exactly what current UI shows; note any gap for
     a possible later UI task, per user's "might need new UI" remark).
   - 3a/3b/3c → Failed badge + correct reason in the dead-bill popover.
   - Every simple column has a card.
4. Run undo; confirm the board returns to its prior 62-bill state and no dummy showcase
   rows remain.

## Out of scope

- Any UI changes (including a dedicated "testimony closed" indicator).
- Touching the Food+ org, other tenants, or any real bill / existing org bill.
