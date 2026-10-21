# Dead Bill Detection — Design Spec

## Problem

Bills in the Hawaii legislature become "dead" when they miss key session calendar deadlines or are explicitly deferred by committee. Currently, there is no automated detection for this — status classification relies entirely on LLM inference from status update text. This spec defines a deterministic, rule-based system for detecting dead bills based on session calendar deadlines and explicit deferral language.

## Kill Conditions

A bill is dead if **either** condition is true:

### Kill Condition 1: Explicit Deferral

A status update's `statustext` contains the phrase "deferred the measure". This is an immediate kill — no recovery.

Note: "rescheduled its decision making" is NOT a kill signal. The committee is still actively working on the bill.

### Kill Condition 2: Missed Deadline

The bill's current kanban status has not reached the minimum required milestone by the relevant session calendar deadline.

## Session Deadlines JSON

Source: the annual session calendar PDF (e.g., `sessioncalendar-writtenguide.pdf`).

Output: `src/data/session-deadlines-2026.json`

```json
{
  "session": 2026,
  "deadlines": {
    "first_triple_referral_filing": { "HB": "2026-02-11", "SB": "2026-02-12" },
    "first_lateral_filing": "2026-02-19",
    "first_lateral": "2026-02-20",
    "single_referral_filing": { "SB": "2026-03-05", "HB": "2026-04-09" },
    "first_decking": "2026-03-06",
    "first_crossover": "2026-03-12",
    "second_triple_referral_filing": "2026-03-19",
    "second_lateral_filing": "2026-03-27",
    "second_lateral": "2026-03-30",
    "second_decking": "2026-04-10",
    "second_crossover": "2026-04-16"
  }
}
```

Some deadlines are chamber-specific (HB vs SB have different dates for the same milestone), represented as `{ "HB": "date", "SB": "date" }` instead of a plain string.

## Committee Parsing

Given `committee_assignment` (e.g., `"AGR, JDL/WAM, FIN"`):

1. Split by comma
2. Trim whitespace on each entry
3. Count entries — joint committees like `JDL/WAM` count as one referral
4. Determine referral type:
   - 1 = single referral
   - 2 = double referral (lateral deadlines apply)
   - 3+ = triple referral (triple referral filing + lateral deadlines apply)

Bill chamber (`HB` or `SB`) is extracted from `bill_number` prefix.

## Deadline-to-Minimum-Status Mapping

### Pre-crossover (originating chamber)

| Referral Type | Deadline | Minimum Status |
|---|---|---|
| Triple (3+) | First Triple Referral Filing | `waiting2` |
| Double/Triple | First Lateral | last committee (`waiting3` for triple, `waiting2` for double) |
| Single | Single Referral Filing | `waiting2` |
| All | First Decking | `passedCommittees` |
| All | First Crossover | `crossoverWaiting1` |

### Post-crossover (non-originating chamber)

| Referral Type | Deadline | Minimum Status |
|---|---|---|
| Triple (3+) | Second Triple Referral Filing | `crossoverWaiting2` |
| Double/Triple | Second Lateral | last crossover committee |
| Single (HBs) | Single Referral Filing (HBs) | past single crossover committee |
| All | Second Decking | past all crossover committees |
| All | Second Crossover | past crossover phase |

### Algorithm

1. Determine pre-crossover vs post-crossover from current `bill_status`
2. Get referral count from `committee_assignment`
3. Get today's date
4. Find the most recent passed deadline for this bill's referral type and phase
5. Check if current status (via `COLUMN_INDEX`) >= minimum required status for that deadline
6. If not, bill is dead

## File Structure

```
src/data/session-deadlines-2026.json    — Deadline reference (checked in)
src/lib/dead-bill.ts                    — Core pure-function logic (reusable)
scripts/parse-session-calendar.ts       — One-time PDF parser -> JSON
scripts/check-bill-dead.ts              — CLI: takes bill ID, prints verdict
```

## `src/lib/dead-bill.ts` — Exported Functions

- `parseCommittees(committeeAssignment: string): string[]` — split + trim
- `getReferralType(count: number): 'single' | 'double' | 'triple'`
- `getBillChamber(billNumber: string): 'HB' | 'SB'`
- `isPreCrossover(status: BillStatus): boolean`
- `getRelevantDeadline(...)` — returns the applicable deadline and minimum status
- `isExplicitlyDeferred(statusUpdates): boolean` — checks for "deferred the measure"
- `isBillDead(bill, statusUpdates, deadlines, today): { dead: boolean, reason: string }`

## `scripts/check-bill-dead.ts` — CLI Output

```
$ tsx scripts/check-bill-dead.ts <bill-id>

Bill: HB1234 — "Relating to Food Safety"
Committees: AGR, JDL/WAM, FIN
Referral type: Triple (3 committees)
Chamber: House (HB)
Current status: scheduled1 (index 3)
Phase: Pre-crossover

Relevant deadline: First Triple Referral Filing (2026-02-11)
Minimum required status: waiting2 (index 6)
Today: 2026-05-06

Kill condition 1 (explicit deferral): NO
Kill condition 2 (missed deadline): YES — bill is at scheduled1 but should be at waiting2 by 2026-02-11

VERDICT: DEAD
```

## PDF Parser

`scripts/parse-session-calendar.ts` uses `pdf-parse` to extract text, then regex to match deadline entries. Outputs the JSON to `src/data/`. Runs once per legislative session year. If a regex misses something, fix manually in the JSON — the parser is a convenience, not a critical path.
