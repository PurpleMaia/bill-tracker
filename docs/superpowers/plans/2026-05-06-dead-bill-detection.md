# Dead Bill Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic dead-bill detection system that checks whether a Hawaii legislature bill is dead based on session calendar deadlines and explicit committee deferral language.

**Architecture:** A JSON deadline reference file drives the logic. Core pure functions in `src/lib/dead-bill.ts` determine if a bill is dead based on its committee count, current kanban status, and the date. A CLI script queries the database, feeds data into the core logic, and prints the verdict. A separate one-time script parses the session calendar PDF into the JSON reference.

**Tech Stack:** TypeScript, Kysely (existing DB client), pdf-parse (new dep for PDF parsing), tsx (existing CLI runner)

---

## File Structure

| File | Responsibility |
|---|---|
| `src/data/session-deadlines-2026.json` | Static deadline reference for 2026 session (checked in) |
| `src/lib/dead-bill.ts` | Core pure-function logic: committee parsing, referral type, deadline lookup, dead-bill verdict |
| `scripts/parse-session-calendar.ts` | One-time PDF parser that extracts deadlines from session calendar PDF into JSON |
| `scripts/check-bill-dead.ts` | CLI entry point: takes bill ID, queries DB, calls core logic, prints verdict |

---

### Task 1: Create the session deadlines JSON reference

This is a static data file — no code logic, just the extracted deadline data from the 2026 session calendar PDF.

**Files:**
- Create: `src/data/session-deadlines-2026.json`

- [ ] **Step 1: Create the data directory and JSON file**

```bash
mkdir -p src/data
```

Write `src/data/session-deadlines-2026.json`:

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

- [ ] **Step 2: Commit**

```bash
git add src/data/session-deadlines-2026.json
git commit -m "feat: add 2026 session calendar deadlines JSON reference"
```

---

### Task 2: Build core dead-bill logic — committee parsing and referral type

The first set of pure functions: parsing `committee_assignment` strings and determining referral types.

**Files:**
- Create: `src/lib/dead-bill.ts`

**Reference:**
- `src/db/types.ts` — `BillStatus` type
- `src/lib/kanban-columns.ts` — `COLUMN_INDEX` for status comparison

- [ ] **Step 1: Write `parseCommittees` and `getReferralType` functions**

Write `src/lib/dead-bill.ts`:

```typescript
import { BillStatus } from '@/db/types';
import { COLUMN_INDEX } from '@/lib/kanban-columns';

// --- Types ---

export type ReferralType = 'single' | 'double' | 'triple';
export type Chamber = 'HB' | 'SB';

export interface DeadlineEntry {
  name: string;
  date: string;
  minimumStatus: BillStatus;
}

export interface DeadBillResult {
  dead: boolean;
  reason: string;
}

export interface SessionDeadlines {
  session: number;
  deadlines: {
    first_triple_referral_filing: { HB: string; SB: string };
    first_lateral_filing: string;
    first_lateral: string;
    single_referral_filing: { SB: string; HB: string };
    first_decking: string;
    first_crossover: string;
    second_triple_referral_filing: string;
    second_lateral_filing: string;
    second_lateral: string;
    second_decking: string;
    second_crossover: string;
  };
}

export interface StatusUpdate {
  statustext: string;
  date: string;
  chamber: string;
}

// --- Committee Parsing ---

export function parseCommittees(committeeAssignment: string): string[] {
  return committeeAssignment
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

export function getReferralType(committeeCount: number): ReferralType {
  if (committeeCount >= 3) return 'triple';
  if (committeeCount === 2) return 'double';
  return 'single';
}

export function getBillChamber(billNumber: string): Chamber {
  const prefix = billNumber.replace(/[0-9]/g, '').toUpperCase();
  if (prefix.startsWith('SB')) return 'SB';
  return 'HB';
}
```

- [ ] **Step 2: Manually verify the functions work**

Run in a quick sanity check:

```bash
tsx -e "
  const { parseCommittees, getReferralType, getBillChamber } = require('./src/lib/dead-bill');
  console.log(parseCommittees('AGR, JDL/WAM, FIN'));
  console.log(getReferralType(3));
  console.log(getReferralType(2));
  console.log(getReferralType(1));
  console.log(getBillChamber('HB1234'));
  console.log(getBillChamber('SB567'));
"
```

Expected:
```
[ 'AGR', 'JDL/WAM', 'FIN' ]
triple
double
single
HB
SB
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/dead-bill.ts
git commit -m "feat: add committee parsing and referral type functions for dead-bill detection"
```

---

### Task 3: Build core dead-bill logic — crossover detection and explicit deferral check

Add the phase detection and explicit deferral kill condition.

**Files:**
- Modify: `src/lib/dead-bill.ts`

- [ ] **Step 1: Add `isPreCrossover` and `isExplicitlyDeferred` functions**

Append to `src/lib/dead-bill.ts`:

```typescript
// --- Phase Detection ---

export function isPreCrossover(status: BillStatus): boolean {
  const statusStr = status as string;
  return !statusStr.startsWith('crossover') &&
    !['passedCommittees', 'conferenceAssigned', 'conferenceScheduled',
      'conferenceDeferred', 'conferencePassed', 'transmittedGovernor',
      'vetoList', 'governorSigns', 'lawWithoutSignature'].includes(statusStr);
}

// --- Kill Condition 1: Explicit Deferral ---

export function isExplicitlyDeferred(statusUpdates: StatusUpdate[]): boolean {
  return statusUpdates.some((update) =>
    update.statustext.toLowerCase().includes('deferred the measure')
  );
}
```

- [ ] **Step 2: Manually verify**

```bash
tsx -e "
  const { isPreCrossover, isExplicitlyDeferred } = require('./src/lib/dead-bill');
  console.log('introduced pre-crossover:', isPreCrossover('introduced'));
  console.log('scheduled2 pre-crossover:', isPreCrossover('scheduled2'));
  console.log('crossoverWaiting1 pre-crossover:', isPreCrossover('crossoverWaiting1'));
  console.log('passedCommittees pre-crossover:', isPreCrossover('passedCommittees'));
  console.log('conferenceAssigned pre-crossover:', isPreCrossover('conferenceAssigned'));
  console.log('explicit deferral found:', isExplicitlyDeferred([
    { statustext: 'The committee on AGR deferred the measure.', date: '2026-02-15', chamber: 'H' }
  ]));
  console.log('no deferral:', isExplicitlyDeferred([
    { statustext: 'The committee(s) on WAM has rescheduled its decision making to 03-05-26', date: '2026-03-04', chamber: 'S' }
  ]));
"
```

Expected:
```
introduced pre-crossover: true
scheduled2 pre-crossover: true
crossoverWaiting1 pre-crossover: false
passedCommittees pre-crossover: false
conferenceAssigned pre-crossover: false
explicit deferral found: true
no deferral: false
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/dead-bill.ts
git commit -m "feat: add crossover detection and explicit deferral check"
```

---

### Task 4: Build core dead-bill logic — deadline lookup and minimum status mapping

The heart of the system: given a bill's referral type, chamber, phase, and today's date, determine which deadline applies and what the minimum required status is.

**Files:**
- Modify: `src/lib/dead-bill.ts`

- [ ] **Step 1: Add `getApplicableDeadlines` and `getRelevantDeadline` functions**

Append to `src/lib/dead-bill.ts`:

```typescript
// --- Deadline Resolution ---

function resolveDate(
  entry: string | { HB: string; SB: string },
  chamber: Chamber
): string {
  if (typeof entry === 'string') return entry;
  return entry[chamber];
}

/**
 * Returns all deadlines applicable to this bill, in chronological order,
 * with the minimum status the bill must have reached by each deadline.
 */
export function getApplicableDeadlines(
  referralType: ReferralType,
  chamber: Chamber,
  preCrossover: boolean,
  deadlines: SessionDeadlines
): DeadlineEntry[] {
  const d = deadlines.deadlines;
  const entries: DeadlineEntry[] = [];

  if (preCrossover) {
    // Triple referral: must be in 2nd-to-last committee by triple filing deadline
    if (referralType === 'triple') {
      entries.push({
        name: 'First Triple Referral Filing',
        date: resolveDate(d.first_triple_referral_filing, chamber),
        minimumStatus: 'waiting2' as BillStatus,
      });
    }

    // Double/Triple: must be in last committee by first lateral
    if (referralType === 'double' || referralType === 'triple') {
      entries.push({
        name: 'First Lateral',
        date: d.first_lateral,
        minimumStatus: (referralType === 'triple' ? 'waiting3' : 'waiting2') as BillStatus,
      });
    }

    // Single referral: must have passed single committee by filing deadline
    if (referralType === 'single') {
      entries.push({
        name: 'Single Referral Filing',
        date: resolveDate(d.single_referral_filing, chamber),
        minimumStatus: 'waiting2' as BillStatus,
      });
    }

    // All bills: must have emerged from all committees by first decking
    entries.push({
      name: 'First Decking',
      date: d.first_decking,
      minimumStatus: 'passedCommittees' as BillStatus,
    });

    // All bills: must have crossed over by first crossover
    entries.push({
      name: 'First Crossover',
      date: d.first_crossover,
      minimumStatus: 'crossoverWaiting1' as BillStatus,
    });
  } else {
    // Post-crossover deadlines

    // Triple referral: must be in 2nd-to-last crossover committee
    if (referralType === 'triple') {
      entries.push({
        name: 'Second Triple Referral Filing',
        date: d.second_triple_referral_filing,
        minimumStatus: 'crossoverWaiting2' as BillStatus,
      });
    }

    // Double/Triple: must be in last crossover committee by second lateral
    if (referralType === 'double' || referralType === 'triple') {
      entries.push({
        name: 'Second Lateral',
        date: d.second_lateral,
        minimumStatus: (referralType === 'triple' ? 'crossoverWaiting3' : 'crossoverWaiting2') as BillStatus,
      });
    }

    // Single (HBs): filing deadline for single-referral HBs in crossover
    if (referralType === 'single' && chamber === 'HB') {
      entries.push({
        name: 'Single Referral Filing (HBs)',
        date: resolveDate(d.single_referral_filing, 'HB'),
        minimumStatus: 'crossoverWaiting2' as BillStatus,
      });
    }

    // All bills: must have emerged from all crossover committees by second decking
    entries.push({
      name: 'Second Decking',
      date: d.second_decking,
      minimumStatus: 'passedCommittees' as BillStatus,
    });

    // All bills: must have passed second crossover
    entries.push({
      name: 'Second Crossover',
      date: d.second_crossover,
      minimumStatus: 'conferenceAssigned' as BillStatus,
    });
  }

  // Sort by date ascending
  entries.sort((a, b) => a.date.localeCompare(b.date));
  return entries;
}

/**
 * Given today's date, find the most recent deadline that has passed
 * and check if the bill meets the minimum status requirement.
 */
export function getRelevantDeadline(
  referralType: ReferralType,
  chamber: Chamber,
  preCrossover: boolean,
  deadlines: SessionDeadlines,
  today: string
): DeadlineEntry | null {
  const applicable = getApplicableDeadlines(referralType, chamber, preCrossover, deadlines);

  // Find the latest deadline that has already passed (date <= today)
  const passed = applicable.filter((d) => d.date <= today);
  if (passed.length === 0) return null;

  // Return the most recent passed deadline (last in sorted array)
  return passed[passed.length - 1];
}
```

- [ ] **Step 2: Manually verify**

```bash
tsx -e "
  const { getApplicableDeadlines, getRelevantDeadline } = require('./src/lib/dead-bill');
  const deadlines = require('./src/data/session-deadlines-2026.json');

  // Triple referral HB, pre-crossover
  const applicable = getApplicableDeadlines('triple', 'HB', true, deadlines);
  console.log('Triple HB pre-crossover deadlines:');
  applicable.forEach(d => console.log('  ', d.date, d.name, '->', d.minimumStatus));

  // Single referral SB, pre-crossover
  const singleSB = getApplicableDeadlines('single', 'SB', true, deadlines);
  console.log('Single SB pre-crossover deadlines:');
  singleSB.forEach(d => console.log('  ', d.date, d.name, '->', d.minimumStatus));

  // Check relevant deadline for today (2026-05-06)
  const relevant = getRelevantDeadline('triple', 'HB', true, deadlines, '2026-05-06');
  console.log('Most recent passed deadline for triple HB:', relevant?.name, relevant?.date);
"
```

Expected:
```
Triple HB pre-crossover deadlines:
   2026-02-11 First Triple Referral Filing -> waiting2
   2026-02-20 First Lateral -> waiting3
   2026-03-06 First Decking -> passedCommittees
   2026-03-12 First Crossover -> crossoverWaiting1
Single SB pre-crossover deadlines:
   2026-03-05 Single Referral Filing -> waiting2
   2026-03-06 First Decking -> passedCommittees
   2026-03-12 First Crossover -> crossoverWaiting1
Most recent passed deadline for triple HB: First Crossover 2026-03-12
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/dead-bill.ts
git commit -m "feat: add deadline lookup and minimum status mapping for dead-bill detection"
```

---

### Task 5: Build core dead-bill logic — the `isBillDead` verdict function

The top-level function that ties everything together.

**Files:**
- Modify: `src/lib/dead-bill.ts`

- [ ] **Step 1: Add `isBillDead` function**

Append to `src/lib/dead-bill.ts`:

```typescript
// --- Top-Level Verdict ---

export function isBillDead(
  bill: {
    bill_number: string;
    bill_status: BillStatus;
    committee_assignment: string;
  },
  statusUpdates: StatusUpdate[],
  deadlines: SessionDeadlines,
  today: string
): DeadBillResult {
  // Kill Condition 1: Explicit deferral
  if (isExplicitlyDeferred(statusUpdates)) {
    const deferralUpdate = statusUpdates.find((u) =>
      u.statustext.toLowerCase().includes('deferred the measure')
    );
    return {
      dead: true,
      reason: `Explicitly deferred: "${deferralUpdate?.statustext}"`,
    };
  }

  // Parse bill properties
  const committees = parseCommittees(bill.committee_assignment);
  const referralType = getReferralType(committees.length);
  const chamber = getBillChamber(bill.bill_number);
  const preCrossover = isPreCrossover(bill.bill_status);

  // Kill Condition 2: Missed deadline
  const deadline = getRelevantDeadline(
    referralType,
    chamber,
    preCrossover,
    deadlines,
    today
  );

  if (!deadline) {
    return {
      dead: false,
      reason: 'No applicable deadline has passed yet',
    };
  }

  const currentIndex = COLUMN_INDEX[bill.bill_status] ?? 0;
  const requiredIndex = COLUMN_INDEX[deadline.minimumStatus] ?? 0;

  if (currentIndex < requiredIndex) {
    return {
      dead: true,
      reason: `Missed deadline: ${deadline.name} (${deadline.date}). Bill is at "${bill.bill_status}" (index ${currentIndex}) but should be at or past "${deadline.minimumStatus}" (index ${requiredIndex})`,
    };
  }

  return {
    dead: false,
    reason: `Bill meets the most recent deadline: ${deadline.name} (${deadline.date}). Status "${bill.bill_status}" (index ${currentIndex}) >= required "${deadline.minimumStatus}" (index ${requiredIndex})`,
  };
}
```

- [ ] **Step 2: Manually verify with a mock dead bill**

```bash
tsx -e "
  const { isBillDead } = require('./src/lib/dead-bill');
  const deadlines = require('./src/data/session-deadlines-2026.json');

  // Dead bill: triple referral HB stuck at scheduled1 in May
  const result1 = isBillDead(
    { bill_number: 'HB1234', bill_status: 'scheduled1', committee_assignment: 'AGR, JDL/WAM, FIN' },
    [],
    deadlines,
    '2026-05-06'
  );
  console.log('Dead triple HB:', result1);

  // Dead bill: explicitly deferred
  const result2 = isBillDead(
    { bill_number: 'SB100', bill_status: 'scheduled1', committee_assignment: 'AGR, FIN' },
    [{ statustext: 'The committee on AGR deferred the measure.', date: '2026-02-10', chamber: 'S' }],
    deadlines,
    '2026-02-10'
  );
  console.log('Explicitly deferred:', result2);

  // Alive bill: no deadlines passed yet
  const result3 = isBillDead(
    { bill_number: 'HB500', bill_status: 'introduced', committee_assignment: 'AGR' },
    [],
    deadlines,
    '2026-01-25'
  );
  console.log('Before any deadline:', result3);
"
```

Expected output:
```
Dead triple HB: { dead: true, reason: 'Missed deadline: First Crossover (2026-03-12). Bill is at "scheduled1" (index 2) but should be at or past "crossoverWaiting1" (index 10)' }
Explicitly deferred: { dead: true, reason: 'Explicitly deferred: "The committee on AGR deferred the measure."' }
Before any deadline: { dead: false, reason: 'No applicable deadline has passed yet' }
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/dead-bill.ts
git commit -m "feat: add isBillDead verdict function combining both kill conditions"
```

---

### Task 6: Build the CLI script — `check-bill-dead.ts`

The standalone CLI that queries the real database and prints the formatted verdict.

**Files:**
- Create: `scripts/check-bill-dead.ts`

**Reference:**
- `src/db/kysely/client.ts` — DB client singleton
- `scripts/export-csv.ts` — existing script pattern (import style, cleanup)
- `src/lib/dead-bill.ts` — all core functions

- [ ] **Step 1: Write the CLI script**

Write `scripts/check-bill-dead.ts`:

```typescript
import { db } from '@/db/kysely/client';
import {
  parseCommittees,
  getReferralType,
  getBillChamber,
  isPreCrossover,
  getRelevantDeadline,
  isExplicitlyDeferred,
  isBillDead,
} from '@/lib/dead-bill';
import type { SessionDeadlines } from '@/lib/dead-bill';
import { COLUMN_INDEX } from '@/lib/kanban-columns';
import type { BillStatus } from '@/db/types';
import deadlinesJson from '@/data/session-deadlines-2026.json';

const deadlines = deadlinesJson as SessionDeadlines;

async function main() {
  const billId = process.argv[2];

  if (!billId) {
    console.error('Usage: tsx scripts/check-bill-dead.ts <bill-id>');
    console.error('  bill-id can be a UUID or a bill number like HB1234');
    process.exit(1);
  }

  try {
    // Fetch bill — support both UUID and bill_number lookup
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(billId);

    let billQuery = db
      .selectFrom('bills')
      .select(['id', 'bill_number', 'bill_title', 'bill_status', 'committee_assignment']);

    if (isUUID) {
      billQuery = billQuery.where('id', '=', billId);
    } else {
      billQuery = billQuery.where('bill_number', '=', billId.toUpperCase());
    }

    const bill = await billQuery.executeTakeFirst();

    if (!bill) {
      console.error(`Bill not found: ${billId}`);
      process.exit(1);
    }

    if (!bill.committee_assignment) {
      console.error(`Bill ${bill.bill_number} has no committee_assignment`);
      process.exit(1);
    }

    if (!bill.bill_status) {
      console.error(`Bill ${bill.bill_number} has no bill_status`);
      process.exit(1);
    }

    // Fetch status updates
    const statusUpdates = await db
      .selectFrom('status_updates')
      .select(['statustext', 'date', 'chamber'])
      .where('bill_id', '=', bill.id)
      .orderBy('date', 'asc')
      .execute();

    // Compute derived values for display
    const committees = parseCommittees(bill.committee_assignment);
    const referralType = getReferralType(committees.length);
    const chamber = getBillChamber(bill.bill_number!);
    const preCrossover = isPreCrossover(bill.bill_status as BillStatus);
    const today = new Date().toISOString().split('T')[0];

    const relevantDeadline = getRelevantDeadline(
      referralType,
      chamber,
      preCrossover,
      deadlines,
      today
    );

    const explicitlyDeferred = isExplicitlyDeferred(statusUpdates);

    // Run the verdict
    const result = isBillDead(
      {
        bill_number: bill.bill_number!,
        bill_status: bill.bill_status as BillStatus,
        committee_assignment: bill.committee_assignment,
      },
      statusUpdates,
      deadlines,
      today
    );

    // Print formatted output
    console.log('');
    console.log(`Bill: ${bill.bill_number} — "${bill.bill_title}"`);
    console.log(`Committees: ${bill.committee_assignment}`);
    console.log(`Referral type: ${referralType.charAt(0).toUpperCase() + referralType.slice(1)} (${committees.length} committee${committees.length !== 1 ? 's' : ''})`);
    console.log(`Chamber: ${chamber === 'HB' ? 'House' : 'Senate'} (${chamber})`);
    console.log(`Current status: ${bill.bill_status} (index ${COLUMN_INDEX[bill.bill_status] ?? '?'})`);
    console.log(`Phase: ${preCrossover ? 'Pre-crossover' : 'Post-crossover'}`);
    console.log('');

    if (relevantDeadline) {
      console.log(`Relevant deadline: ${relevantDeadline.name} (${relevantDeadline.date})`);
      console.log(`Minimum required status: ${relevantDeadline.minimumStatus} (index ${COLUMN_INDEX[relevantDeadline.minimumStatus] ?? '?'})`);
    } else {
      console.log('Relevant deadline: None (no deadlines have passed yet)');
    }
    console.log(`Today: ${today}`);
    console.log('');

    console.log(`Kill condition 1 (explicit deferral): ${explicitlyDeferred ? 'YES' : 'NO'}`);
    if (relevantDeadline) {
      const currentIdx = COLUMN_INDEX[bill.bill_status] ?? 0;
      const requiredIdx = COLUMN_INDEX[relevantDeadline.minimumStatus] ?? 0;
      const missed = currentIdx < requiredIdx;
      console.log(`Kill condition 2 (missed deadline): ${missed ? 'YES' : 'NO'}${missed ? ` — bill is at ${bill.bill_status} but should be at ${relevantDeadline.minimumStatus} by ${relevantDeadline.date}` : ''}`);
    } else {
      console.log('Kill condition 2 (missed deadline): N/A (no deadlines passed)');
    }
    console.log('');

    console.log(`VERDICT: ${result.dead ? 'DEAD' : 'ALIVE'}`);
    console.log(`Reason: ${result.reason}`);
    console.log('');
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Test with a real bill from the database**

The user will provide a known dead bill ID to test against. Run:

```bash
tsx scripts/check-bill-dead.ts <bill-id-or-number>
```

Verify the output matches the expected format and the verdict is correct.

- [ ] **Step 3: Commit**

```bash
git add scripts/check-bill-dead.ts
git commit -m "feat: add CLI script to check if a bill is dead"
```

---

### Task 7: Build the PDF parser script

A one-time convenience script to extract deadlines from the session calendar PDF. Uses `pdf-parse` to extract text, then regex to match deadline entries.

**Files:**
- Create: `scripts/parse-session-calendar.ts`

- [ ] **Step 1: Install pdf-parse**

```bash
npm install pdf-parse
npm install --save-dev @types/pdf-parse
```

- [ ] **Step 2: Write the parser script**

Write `scripts/parse-session-calendar.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';

interface ParsedDeadlines {
  session: number;
  deadlines: Record<string, string | { HB: string; SB: string }>;
}

const MONTH_MAP: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04',
  MAY: '05', JUN: '06', JUL: '07', AUG: '08',
  SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

function parseDate(month: string, day: string, year: number): string {
  const mm = MONTH_MAP[month.toUpperCase()];
  const dd = day.padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

async function main() {
  const pdfPath = process.argv[2];
  const sessionYear = parseInt(process.argv[3] || '2026', 10);

  if (!pdfPath) {
    console.error('Usage: tsx scripts/parse-session-calendar.ts <path-to-pdf> [session-year]');
    process.exit(1);
  }

  const dataBuffer = fs.readFileSync(pdfPath);
  const data = await pdfParse(dataBuffer);
  const text = data.text;

  const result: ParsedDeadlines = {
    session: sessionYear,
    deadlines: {},
  };

  // Pattern: "FEB 11 (HOUSE BILLS) & FEB 12 (SENATE BILLS) FIRST TRIPLE REFERRAL FILING"
  const tripleFirstMatch = text.match(
    /(\w{3})\s+(\d{1,2})\s*\(HOUSE BILLS?\)\s*&\s*(\w{3})\s+(\d{1,2})\s*\(SENATE BILLS?\)\s*FIRST TRIPLE REFERRAL FILING/i
  );
  if (tripleFirstMatch) {
    result.deadlines.first_triple_referral_filing = {
      HB: parseDate(tripleFirstMatch[1], tripleFirstMatch[2], sessionYear),
      SB: parseDate(tripleFirstMatch[3], tripleFirstMatch[4], sessionYear),
    };
  }

  // Pattern: "FEB 19 FIRST LATERAL FILING"
  const firstLateralFilingMatch = text.match(
    /(\w{3})\s+(\d{1,2})\s*FIRST LATERAL FILING/i
  );
  if (firstLateralFilingMatch) {
    result.deadlines.first_lateral_filing = parseDate(
      firstLateralFilingMatch[1], firstLateralFilingMatch[2], sessionYear
    );
  }

  // Pattern: "FEB 20 FIRST LATERAL (BILLS)"
  const firstLateralMatch = text.match(
    /(\w{3})\s+(\d{1,2})\s*FIRST LATERAL\s*\(BILLS\)/i
  );
  if (firstLateralMatch) {
    result.deadlines.first_lateral = parseDate(
      firstLateralMatch[1], firstLateralMatch[2], sessionYear
    );
  }

  // Pattern: "MAR 5 SINGLE REFERRAL FILING DEADLINE (SBS)"
  const singleSBMatch = text.match(
    /(\w{3})\s+(\d{1,2})\s*SINGLE REFERRAL FILING DEADLINE\s*\(SBS?\)/i
  );
  // Pattern: "APR 9 ... & SINGLE REFERRAL FILING DEADLINE (HBS)"
  const singleHBMatch = text.match(
    /(\w{3})\s+(\d{1,2})[\s\S]*?SINGLE REFERRAL FILING DEADLINE\s*\(HBS?\)/i
  );
  if (singleSBMatch || singleHBMatch) {
    result.deadlines.single_referral_filing = {
      SB: singleSBMatch ? parseDate(singleSBMatch[1], singleSBMatch[2], sessionYear) : '',
      HB: singleHBMatch ? parseDate(singleHBMatch[1], singleHBMatch[2], sessionYear) : '',
    };
  }

  // Pattern: "MAR 6 FIRST DECKING"
  const firstDeckingMatch = text.match(
    /(\w{3})\s+(\d{1,2})\s*FIRST DECKING/i
  );
  if (firstDeckingMatch) {
    result.deadlines.first_decking = parseDate(
      firstDeckingMatch[1], firstDeckingMatch[2], sessionYear
    );
  }

  // Pattern: "MAR 12 FIRST CROSSOVER"
  const firstCrossoverMatch = text.match(
    /(\w{3})\s+(\d{1,2})\s*FIRST CROSSOVER\s*\(BILLS\)/i
  );
  if (firstCrossoverMatch) {
    result.deadlines.first_crossover = parseDate(
      firstCrossoverMatch[1], firstCrossoverMatch[2], sessionYear
    );
  }

  // Pattern: "MAR 19 SECOND TRIPLE REFERRAL FILING"
  const secondTripleMatch = text.match(
    /(\w{3})\s+(\d{1,2})\s*SECOND TRIPLE REFERRAL FILING/i
  );
  if (secondTripleMatch) {
    result.deadlines.second_triple_referral_filing = parseDate(
      secondTripleMatch[1], secondTripleMatch[2], sessionYear
    );
  }

  // Pattern: "MAR 27 SECOND LATERAL FILING"
  const secondLateralFilingMatch = text.match(
    /(\w{3})\s+(\d{1,2})\s*SECOND LATERAL FILING/i
  );
  if (secondLateralFilingMatch) {
    result.deadlines.second_lateral_filing = parseDate(
      secondLateralFilingMatch[1], secondLateralFilingMatch[2], sessionYear
    );
  }

  // Pattern: "MAR 30 SECOND LATERAL (BILLS)"
  const secondLateralMatch = text.match(
    /(\w{3})\s+(\d{1,2})\s*SECOND LATERAL\s*\(BILLS\)/i
  );
  if (secondLateralMatch) {
    result.deadlines.second_lateral = parseDate(
      secondLateralMatch[1], secondLateralMatch[2], sessionYear
    );
  }

  // Pattern: "APR 10 SECOND DECKING"
  const secondDeckingMatch = text.match(
    /(\w{3})\s+(\d{1,2})\s*SECOND DECKING/i
  );
  if (secondDeckingMatch) {
    result.deadlines.second_decking = parseDate(
      secondDeckingMatch[1], secondDeckingMatch[2], sessionYear
    );
  }

  // Pattern: "APR 16 SECOND CROSSOVER"
  const secondCrossoverMatch = text.match(
    /(\w{3})\s+(\d{1,2})\s*SECOND CROSSOVER\s*\(BILLS\)/i
  );
  if (secondCrossoverMatch) {
    result.deadlines.second_crossover = parseDate(
      secondCrossoverMatch[1], secondCrossoverMatch[2], sessionYear
    );
  }

  // Output
  const outputPath = path.resolve(__dirname, `../src/data/session-deadlines-${sessionYear}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');

  console.log(`Parsed ${Object.keys(result.deadlines).length} deadlines:`);
  for (const [key, value] of Object.entries(result.deadlines)) {
    if (typeof value === 'string') {
      console.log(`  ${key}: ${value}`);
    } else {
      console.log(`  ${key}: HB=${value.HB}, SB=${value.SB}`);
    }
  }
  console.log(`\nWritten to: ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Test the parser against the real PDF**

```bash
tsx scripts/parse-session-calendar.ts /Users/jkapali/Desktop/sessioncalendar-writtenguide.pdf 2026
```

Expected: prints 11 deadlines, writes to `src/data/session-deadlines-2026.json`. Compare the output against the manually created JSON from Task 1 to confirm they match.

- [ ] **Step 4: Commit**

```bash
git add scripts/parse-session-calendar.ts package.json package-lock.json
git commit -m "feat: add session calendar PDF parser script"
```

---

### Task 8: End-to-end test with real bill data

The user will provide a known dead bill. Run the full pipeline and verify correctness.

**Files:**
- No new files

- [ ] **Step 1: User provides a dead bill ID**

Ask the user for a bill ID (UUID or bill number) that they know is dead, along with:
- How many committees it has
- When it was deferred (if applicable)
- Why they expect it to be dead

- [ ] **Step 2: Run the CLI script**

```bash
tsx scripts/check-bill-dead.ts <bill-id>
```

- [ ] **Step 3: Verify output matches expectations**

Check that:
- Committee count matches what the user said
- Referral type is correct
- The relevant deadline is correct for the referral type
- The verdict matches (DEAD with the right reason)

- [ ] **Step 4: If issues found, fix and re-run**

Debug any discrepancies in `src/lib/dead-bill.ts` or `scripts/check-bill-dead.ts`.

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -u
git commit -m "fix: adjust dead-bill detection based on real bill testing"
```
