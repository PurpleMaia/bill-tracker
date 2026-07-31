# Jaden Kapali Org — Showcase Board Seed (real bills)

**Date:** 2026-07-30
**Status:** Approved design, pending implementation-plan
**Author:** Jaden + Claude

## Goal

Populate the **Jaden Kapali** organization board (`tenants.slug = 'jaden-kapali'`,
id `dea7be8b-3aba-4dbd-9be0-0206927b2861`) with a curated set of **real** bills so
every meaningful board state is demonstrable for a walkthrough:

- A bill whose **testimony is nearly due** and still writable (live countdown).
- A bill whose **testimony deadline has already closed** (hearing passed).
- Bills that **failed in different columns for their respective reasons**
  (deferred by committee, recommendation not adopted, missed deadline).
- **One card in each simple-view column** to showcase end-to-end usage.

## Hard constraints (from the user)

1. **Do not create new bills.** Use bills already stored in the DB (6,110 real bills exist).
2. **Only fill gaps** — do not modify the ~62 bills already in the Jaden org.
3. **Seed data only** — no UI work this task (we observe how current UI renders closed testimony afterward).
4. Track showcase bills under **`jkapali`** (org admin, user id `ca18f8b7`).
5. Tune deadline/testimony dates to the **demo calendar**
   (`NEXT_PUBLIC_DEMO_DEADLINES=1`, dates near today 2026-07-30).
6. Everything **reversible** via an undo script that restores exactly what was touched.

## How the board reads status (verified)

- Tenant board fetch (`getAllTrackedBills` / member views) `innerJoin`s `user_bills`
  filtered by `tenant_id` → a bill needs a **`user_bills` row** for the org to appear.
- Card placement uses `current_bill_status`, which the mapper resolves as
  **`org_bills.bill_status` ?? global `bills.bill_status`** (`bill-mappers.ts:156`).
  → Setting **`org_bills.bill_status`** moves a card in *this org only*, without
  touching the bill's global status or any other org.
- Testimony countdown (`kanban-card.tsx:146-151`): shows when
  `isTestimonyUrgent(current_bill_status)` (status is `scheduled*`) **and** the bill's
  **latest** `status_update` text contains a parseable hearing datetime. Countdown
  targets *hearing − 24h*; `getDeadlineTier` colors it (≤7d urgent, ≤14d warning).
- "Latest" status_update = newest `date` cast to date, desc (`bills-read.ts:363`).
- Closed testimony: `getTestimonyDeadline` returns `hearingPassed: true` once the
  hearing datetime is in the past; `testimonies-view.tsx` already renders a
  "submission window closed" note for it.

## Why real hearing dates don't work as-is

All real status_updates carry **2025** hearing datetimes (2025-session scrape). Relative
to today (2026-07-30) every real hearing is a year in the past, so no untouched real
bill can render "nearly due". Therefore the two testimony cases require rewriting the
**latest status_update's date + hearing datetime** into the demo window. Approved.

## The showcase set

All bills are real and food-related. Exact bill numbers are finalized in the
implementation plan against a fresh DB read (avoid ones already in the org). Candidates
below are confirmed present.

| # | Case | Real bill (candidate) | Mechanism |
|---|------|----------------------|-----------|
| 1 | Testimony **nearly due**, writable | a real `scheduled1/2` food bill (e.g. `SB1191`) | org_bills.bill_status = its scheduled status; rewrite latest status_update → hearing ~**36h out** (warning tier), demo window |
| 2 | Testimony **closed** (hearing passed) | another real scheduled food bill | org status scheduled; rewrite latest status_update → hearing ~**12h ago** → `hearingPassed` |
| 3a | Failed: **deferred by committee** | `SB729` (real, dead, deferred) | add to org as-is (global status + dead flag drive it) |
| 3b | Failed: **recommendation not adopted** | `SB12` (real, dead) | add to org as-is |
| 3c | Failed: **missed deadline** | `SB688 SD1` (real, dead) | add to org as-is |
| 4a | Column: `conferenceAssigned` (AWAITING COMMITTEES) | real bill in that status (e.g. `HB1450 HD2 SD1`) | add to org as-is |
| 4b | Column: `governorSigns` (SIGNED INTO LAW) | real bill in that status (e.g. `HB345…`) | add to org as-is |
| 5 | Columns with **no real bill in that status** — `passedCommittees` (CONFERENCE), `crossoverWaiting*`, `crossoverScheduled*`, `conferencePassed`, `transmittedGovernor`, `vetoList`, `lawWithoutSignature` | real food bills chosen from a lower status | **repoint `org_bills.bill_status`** to the target column (org-only; global status untouched) |

Net: one card in every simple-view column, plus the three failure exemplars and the two
testimony exemplars. Existing org bills provide additional coverage and are left alone.

## What gets written (per showcase bill)

1. `user_bills` row: `{ user_id: jkapali, bill_id, tenant_id: jaden }` (idempotent — skip if present).
2. `org_bills` row: `{ tenant_id: jaden, bill_id, bill_status: <target-column-status> }`.
   If no org_bills row exists for (tenant, bill), **insert** it; if one exists with a
   different `bill_status`, **update** it to the target (recording the prior value in
   provenance for undo). Showcase bills are chosen to not already be in the org, so this
   is normally an insert — the update path is a safety net, not the intent.
3. Cases 1 & 2 only: `UPDATE status_updates` on the bill's latest row —
   set `date` and `statustext` hearing datetime into the demo window.

The target `org_bills.bill_status` equals the bill's real status **except** for case-5
repointed columns and the two testimony bills (whose org status is forced to a
`scheduled*` value).

## Reversibility

A single seed script (`scripts/seed-jaden-org-showcase.ts`) and undo
(`scripts/undo-jaden-org-showcase.ts`), following the existing
`seed-dummy-column-bills.ts` / `undo-*` pattern.

- Seed keys every touched bill by a **known list of bill_numbers** (the showcase set),
  scoped to the Jaden tenant.
- **Provenance table for exact restore:** because we mutate `org_bills.bill_status` and
  `status_updates` on *pre-existing real rows*, "doNothing on conflict" is not enough to
  undo cleanly. The seed script records, into a small JSON provenance file under
  `scripts/.jaden-showcase-provenance.json` (git-ignored), the **prior value** of each
  row it changed or inserted:
  - which `user_bills` rows it inserted (to delete on undo),
  - which `org_bills` rows it inserted vs. updated, and their prior `bill_status`,
  - the prior `date` + `statustext` of any edited `status_updates` row.
- Undo replays the provenance in reverse: restore edited status_updates text/date,
  restore or delete org_bills rows, delete inserted user_bills rows. Bills themselves
  are never inserted or deleted, so nothing global is at risk.
- Idempotent: re-running seed detects existing showcase membership and is a no-op for
  already-seeded bills (provenance is not double-written).

## Verification (after seeding)

1. `npm run typecheck` on the scripts.
2. Run seed; run a read query asserting the Jaden org now has one bill in each targeted
   simple-view column and the three failure exemplars are `dead` with the expected reasons.
3. Launch the app with `NEXT_PUBLIC_DEMO_DEADLINES=1`, open the Jaden org board in simple
   view as `jkapali`, and confirm:
   - Case 1 shows "Testimony due in ~36h" (warning tier), Write Testimony open.
   - Case 2 shows the closed-window state (observe current UI; note any gap for a later UI task).
   - Failure exemplars show Failed badge with the right reason in the dead-bill popover.
   - Each simple column has at least one card.
4. Run undo; confirm the org board returns to its prior 62-bill state and the edited
   status_updates are restored verbatim.

## Out of scope

- Any UI changes (including a dedicated "testimony closed" indicator).
- Touching the Food+ org or any other tenant.
- Modifying global `bills.bill_status`, `bills.dead`, or scraped data other than the two
  testimony status_update rows (which are restored on undo).
