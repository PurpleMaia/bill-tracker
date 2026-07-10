# Bill Versions & Committee Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface bill draft versions and committee reports in the Bill Details dialog — a "Latest" card plus a version timeline with reports nested under their version, each with HTML/PDF links, an inline full-text viewer, and an AI-summary slot — and remove the stray AI Update button.

**Architecture:** A pure `lib/bill-versions.ts` module parses report labels and groups reports under versions (DB-free, unit-tested). A new `getBillVersionsAndReports` query feeds data into the existing `getBillDetails` call so no extra fetch is added. A new `BillVersionsPanel` component renders the UI; the dialog mounts it in a tabbed right panel (desktop) and a third tab (mobile).

**Tech Stack:** Next.js 15, TypeScript, Kysely, React, shadcn/ui (Tabs, Badge, Button, ScrollArea), Tailwind, Vitest.

## Global Constraints

- **Kysely for all queries** — no raw SQL; all queries live in `src/db/queries/*`. Copied verbatim from CLAUDE.md.
- **`src/lib/` is DB-free** — pure utilities only; anything running a query belongs in `src/db/queries/`.
- **A `'use server'` file may only export async functions** — no type exports, no re-exports. Shared types/mappers live in plain modules (`bill-mappers.ts`, `legislation.ts`).
- **Tests are pure unit tests** in `src/lib/__tests__/` using `describe`/`it`/`expect` from vitest — no DB, no mocking.
- **Verification:** `npm test`, `npm run typecheck`, and `npm run build` must all pass (build catches `'use server'` export violations typecheck misses).
- **Commit style:** prefixes `feat:`/`fix:`/`refactor:`/`docs:`. Do NOT add `Co-Authored-By` lines.

---

### Task 1: Client types for versions & reports

**Files:**
- Modify: `src/types/legislation.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface BillVersion { id: string; label: string; htmlLink: string | null; pdfLink: string | null; originalText: string | null; aiSummary: string | null; createdAt: string | null; }`
  - `interface CommitteeReport { id: string; label: string; reportCode: string | null; htmlLink: string | null; pdfLink: string | null; originalText: string | null; aiSummary: string | null; createdAt: string | null; }`
  - `BillDetails` extended with `versions: BillVersion[]` and `reports: CommitteeReport[]`.

- [ ] **Step 1: Add the two new interfaces and extend BillDetails**

In `src/types/legislation.ts`, replace the unused `BillDraft` interface (lines 16–24) with:

```typescript
/**
 * A specific draft version of a bill (e.g. HB139, HB139_HD1, HB139_SD1).
 * Backed by the bill_versions table.
 */
export interface BillVersion {
  id: string;
  label: string;
  htmlLink: string | null;
  pdfLink: string | null;
  originalText: string | null;
  aiSummary: string | null;
  createdAt: string | null;
}

/**
 * A committee report on a bill (e.g. HSCR65, SSCR1197).
 * Backed by the committee_reports table. The label embeds the version it
 * belongs to, e.g. "HB139_HD1_HSCR65" belongs to the "HB139_HD1" version.
 */
export interface CommitteeReport {
  id: string;
  label: string;
  reportCode: string | null;
  htmlLink: string | null;
  pdfLink: string | null;
  originalText: string | null;
  aiSummary: string | null;
  createdAt: string | null;
}
```

Then extend the `BillDetails` interface (currently ends at `updates: StatusUpdate[];`) by adding two fields:

```typescript
export interface BillDetails extends Bill {
  committee_assignment: string;
  introducer: string;
  food_related: boolean | null;
  created_at: Date | null;
  updated_at: Date | null;

  updates: StatusUpdate[];
  versions: BillVersion[];
  reports: CommitteeReport[];
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS (no code consumes the removed `BillDraft` — grep confirmed only the type definition referenced it). If any error mentions `BillDraft`, that file imported it; remove that import.

- [ ] **Step 3: Commit**

```bash
git add src/types/legislation.ts
git commit -m "feat: add BillVersion and CommitteeReport client types"
```

---

### Task 2: Pure version↔report grouping logic

**Files:**
- Create: `src/lib/bill-versions.ts`
- Test: `src/lib/__tests__/bill-versions.test.ts`

**Interfaces:**
- Consumes: `BillVersion`, `CommitteeReport` from `@/types/legislation` (Task 1).
- Produces:
  - `parseVersionLabelFromReport(reportLabel: string): string | null` — extracts the version-label portion of a report label. `"HB139_HD1_HSCR65"` → `"HB139_HD1"`; `"HB139_HSCR10"` → `"HB139"`; returns `null` if no report-code segment is present.
  - `interface VersionGroup { version: BillVersion; reports: CommitteeReport[]; }`
  - `groupReportsByVersion(versions: BillVersion[], reports: CommitteeReport[]): { groups: VersionGroup[]; orphanReports: CommitteeReport[]; }` — matches each report to a version by label; unmatched reports go to `orphanReports`. `groups` preserves the input `versions` order.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/bill-versions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  parseVersionLabelFromReport,
  groupReportsByVersion,
} from '../bill-versions';
import type { BillVersion, CommitteeReport } from '@/types/legislation';

const v = (label: string): BillVersion => ({
  id: label, label, htmlLink: null, pdfLink: null,
  originalText: null, aiSummary: null, createdAt: null,
});
const r = (label: string, reportCode: string): CommitteeReport => ({
  id: label, label, reportCode, htmlLink: null, pdfLink: null,
  originalText: null, aiSummary: null, createdAt: null,
});

describe('parseVersionLabelFromReport', () => {
  it('strips a report-code segment from a draft-versioned report', () => {
    expect(parseVersionLabelFromReport('HB139_HD1_HSCR65')).toBe('HB139_HD1');
  });

  it('handles a report on the base version', () => {
    expect(parseVersionLabelFromReport('HB139_HSCR10')).toBe('HB139');
  });

  it('handles senate report codes', () => {
    expect(parseVersionLabelFromReport('HB139_SD1_SSCR1197')).toBe('HB139_SD1');
  });

  it('returns null when there is no report-code segment', () => {
    expect(parseVersionLabelFromReport('HB139_HD1')).toBeNull();
  });
});

describe('groupReportsByVersion', () => {
  it('nests reports under the matching version, preserving version order', () => {
    const versions = [v('HB139'), v('HB139_HD1'), v('HB139_HD2')];
    const reports = [
      r('HB139_HD1_HSCR65', 'HSCR65'),
      r('HB139_HD2_HSCR526', 'HSCR526'),
      r('HB139_HD2_HSCR901', 'HSCR901'),
    ];
    const { groups, orphanReports } = groupReportsByVersion(versions, reports);
    expect(groups.map(g => g.version.label)).toEqual(['HB139', 'HB139_HD1', 'HB139_HD2']);
    expect(groups[0].reports).toEqual([]);
    expect(groups[1].reports.map(x => x.reportCode)).toEqual(['HSCR65']);
    expect(groups[2].reports.map(x => x.reportCode)).toEqual(['HSCR526', 'HSCR901']);
    expect(orphanReports).toEqual([]);
  });

  it('puts reports with no matching version into orphanReports', () => {
    const versions = [v('HB139')];
    const reports = [r('HB139_SD9_SSCR999', 'SSCR999')];
    const { groups, orphanReports } = groupReportsByVersion(versions, reports);
    expect(groups[0].reports).toEqual([]);
    expect(orphanReports.map(x => x.reportCode)).toEqual(['SSCR999']);
  });

  it('treats an unparseable report label as an orphan', () => {
    const versions = [v('HB139')];
    const reports = [r('HB139', 'WEIRD')];
    const { orphanReports } = groupReportsByVersion(versions, reports);
    expect(orphanReports).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/bill-versions.test.ts`
Expected: FAIL — cannot resolve `../bill-versions`.

- [ ] **Step 3: Implement the module**

Create `src/lib/bill-versions.ts`:

```typescript
import type { BillVersion, CommitteeReport } from '@/types/legislation';

/**
 * A committee-report label embeds the version it belongs to plus a trailing
 * report-code segment, e.g. "HB139_HD1_HSCR65" (version "HB139_HD1", report
 * "HSCR65") or "HB139_HSCR10" (base version "HB139"). Report codes look like
 * H/S + "SCR" + digits. We strip the final "_<REPORTCODE>" segment to recover
 * the version label.
 *
 * Returns null when the label has no recognizable report-code segment.
 */
export function parseVersionLabelFromReport(reportLabel: string): string | null {
  const match = reportLabel.match(/^(.*)_([HS]SCR\d+)$/);
  return match ? match[1] : null;
}

export interface VersionGroup {
  version: BillVersion;
  reports: CommitteeReport[];
}

/**
 * Matches each committee report to its version by label and returns the
 * versions (input order preserved) each with its reports nested, plus any
 * reports that matched no known version.
 */
export function groupReportsByVersion(
  versions: BillVersion[],
  reports: CommitteeReport[],
): { groups: VersionGroup[]; orphanReports: CommitteeReport[] } {
  const byLabel = new Map<string, CommitteeReport[]>();
  const orphanReports: CommitteeReport[] = [];

  for (const report of reports) {
    const versionLabel = parseVersionLabelFromReport(report.label);
    if (versionLabel === null) {
      orphanReports.push(report);
      continue;
    }
    const bucket = byLabel.get(versionLabel);
    if (bucket) bucket.push(report);
    else byLabel.set(versionLabel, [report]);
  }

  const matchedLabels = new Set<string>();
  const groups: VersionGroup[] = versions.map((version) => {
    matchedLabels.add(version.label);
    return { version, reports: byLabel.get(version.label) ?? [] };
  });

  // Reports whose parsed version label matches no actual version → orphans.
  for (const [label, bucket] of byLabel) {
    if (!matchedLabels.has(label)) orphanReports.push(...bucket);
  }

  return { groups, orphanReports };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/bill-versions.test.ts`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bill-versions.ts src/lib/__tests__/bill-versions.test.ts
git commit -m "feat: add pure version-report grouping logic"
```

---

### Task 3: DB query + mappers for versions & reports

**Files:**
- Modify: `src/db/queries/bill-mappers.ts`
- Modify: `src/db/queries/bills-read.ts:269-300`

**Interfaces:**
- Consumes: `BillVersion`, `CommitteeReport` (Task 1); `db` from `@/db/kysely/client`; `BillVersions`, `CommitteeReports` from `@/db/types`.
- Produces:
  - In `bill-mappers.ts`: `mapVersionRow(row: Selectable<BillVersions>): BillVersion` and `mapReportRow(row: Selectable<CommitteeReports>): CommitteeReport`; `AdditionalBillData` gains optional `versions?: BillVersion[]` and `reports?: CommitteeReport[]`.
  - In `bills-read.ts`: `getBillVersionsAndReports(billId: string): Promise<{ versions: BillVersion[]; reports: CommitteeReport[] }>`, and `getBillDetails` now returns those populated on `BillDetails`.

- [ ] **Step 1: Add mappers and extend AdditionalBillData**

In `src/db/queries/bill-mappers.ts`:

Update the type import (line 6) to include the new types:

```typescript
import type { Bill, BillTracker, Tag, BillDetails, StatusUpdate, BillVersion, CommitteeReport } from '@/types/legislation';
```

Update the DB-types import (line 7):

```typescript
import { Bills, StatusUpdates, BillVersions, CommitteeReports } from '@/db/types';
```

Add to the `AdditionalBillData` interface (after `orgBillStatuses`):

```typescript
  versions?: BillVersion[]; // For getBillDetails - direct versions array
  reports?: CommitteeReport[]; // For getBillDetails - direct reports array
```

Add these two exported mappers after the `AdditionalBillData` interface (before `mapBillDataToBillClient`). `created_at` is a `Timestamp` (Date); coerce to ISO string for the client type:

```typescript
export function mapVersionRow(row: Selectable<BillVersions>): BillVersion {
  return {
    id: row.id,
    label: row.label,
    htmlLink: row.html_link,
    pdfLink: row.pdf_link,
    originalText: row.original_text,
    aiSummary: row.ai_summary,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

export function mapReportRow(row: Selectable<CommitteeReports>): CommitteeReport {
  return {
    id: row.id,
    label: row.label,
    reportCode: row.report_code,
    htmlLink: row.html_link,
    pdfLink: row.pdf_link,
    originalText: row.original_text,
    aiSummary: row.ai_summary,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}
```

In `convertDataToBillShape`, populate the extended-fields branch. Change the `if (includeExtendedFields)` return object (currently ends with `updates: updates,`) to also include:

```typescript
      updates: updates,
      versions: additionalData?.versions ?? [],
      reports: additionalData?.reports ?? [],
```

- [ ] **Step 2: Add the query and wire it into getBillDetails**

In `src/db/queries/bills-read.ts`:

Update the mappers import (line 8):

```typescript
import { mapBillDataToBillClient, convertDataToBillShape, mapVersionRow, mapReportRow } from '@/db/queries/bill-mappers';
```

Update the client-types import (line 3):

```typescript
import type { Bill, BillTracker, BillDetails, StatusUpdate, BillVersion, CommitteeReport } from '@/types/legislation';
```

Add this exported query function immediately above `getBillDetails` (before its doc comment at line ~263):

```typescript
/**
 * Fetches all draft versions and committee reports for a bill, ordered oldest
 * first by created_at. Backs the Versions & Reports panel in the bill dialog.
 */
export async function getBillVersionsAndReports(
  billId: string,
): Promise<{ versions: BillVersion[]; reports: CommitteeReport[] }> {
  const [versionRows, reportRows] = await Promise.all([
    db.selectFrom('bill_versions').selectAll().where('bill_id', '=', billId)
      .orderBy('created_at', 'asc').execute(),
    db.selectFrom('committee_reports').selectAll().where('bill_id', '=', billId)
      .orderBy('created_at', 'asc').execute(),
  ]);
  return {
    versions: versionRows.map(mapVersionRow),
    reports: reportRows.map(mapReportRow),
  };
}
```

In `getBillDetails`, fetch versions/reports alongside updates and pass them through. Replace the block that currently reads (lines ~284-292):

```typescript
    const updates = await getStatusUpdatesForBill(billId);
    console.log(`[BILL DETAILS] Found ${updates.length} status updates for bill ${billId.slice(0, 6)}`);

    // Use the generic converter with includeExtendedFields flag
    const billDetails = await convertDataToBillShape(
      bill,
      { updates },
      true  // includeExtendedFields = true to get BillDetails
    );
```

with:

```typescript
    const [updates, { versions, reports }] = await Promise.all([
      getStatusUpdatesForBill(billId),
      getBillVersionsAndReports(billId),
    ]);
    console.log(`[BILL DETAILS] Found ${updates.length} status updates, ${versions.length} versions, ${reports.length} reports for bill ${billId.slice(0, 6)}`);

    // Use the generic converter with includeExtendedFields flag
    const billDetails = await convertDataToBillShape(
      bill,
      { updates, versions, reports },
      true  // includeExtendedFields = true to get BillDetails
    );
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS. (If an error says `created_at` is not assignable, confirm the `new Date(...).toISOString()` coercion is present in both mappers.)

- [ ] **Step 4: Verify the query returns seeded data**

Run:
```bash
npx tsx -e "import('./src/db/queries/bills-read').then(async m => { const id = 'REPLACE_WITH_BILL_ID'; const res = await m.getBillVersionsAndReports(id); console.log(JSON.stringify({versions: res.versions.length, reports: res.reports.length}, null, 2)); process.exit(0); })" 2>/dev/null || echo "tsx not available — skip; typecheck + build cover correctness"
```
Get a real bill id first: `psql "$DATABASE_URL" -t -A -c "SELECT bill_id FROM bill_versions LIMIT 1;"`
Expected: nonzero `versions` and (for a bill with reports) `reports` counts. If `tsx` isn't installed, skip — build coverage suffices.

- [ ] **Step 5: Commit**

```bash
git add src/db/queries/bill-mappers.ts src/db/queries/bills-read.ts
git commit -m "feat: fetch bill versions and reports in getBillDetails"
```

---

### Task 4: Inline text viewer subcomponent

**Files:**
- Create: `src/components/kanban/version-text-viewer.tsx`

**Interfaces:**
- Consumes: shadcn `Button`, `ScrollArea`; `lucide-react` icons.
- Produces: `VersionTextViewer({ text }: { text: string }): JSX.Element` — a self-contained collapsible "Read text" disclosure. Renders nothing meaningful when `text` is empty (caller guards).

- [ ] **Step 1: Implement the component**

Create `src/components/kanban/version-text-viewer.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VersionTextViewerProps {
  text: string;
  label?: string; // e.g. "Read text" (default) or "Read report"
  defaultOpen?: boolean;
}

export function VersionTextViewer({ text, label = 'Read text', defaultOpen = false }: VersionTextViewerProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-1.5 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <ChevronRight className={cn('mr-1 h-3.5 w-3.5 transition-transform', open && 'rotate-90')} />
        {label}
      </Button>
      {open && (
        <ScrollArea className="mt-1.5 max-h-64 rounded-md border bg-muted/40">
          <pre className="whitespace-pre-wrap break-words p-3 text-[11px] leading-relaxed font-mono text-foreground/80">
            {text}
          </pre>
        </ScrollArea>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/kanban/version-text-viewer.tsx
git commit -m "feat: add collapsible bill-text viewer component"
```

---

### Task 5: Versions & Reports panel

**Files:**
- Create: `src/components/kanban/bill-versions-panel.tsx`

**Interfaces:**
- Consumes: `BillVersion`, `CommitteeReport` from `@/types/legislation`; `groupReportsByVersion` from `@/lib/bill-versions` (Task 2); `VersionTextViewer` (Task 4); shadcn `Badge`, `Button`, `ScrollArea`; `lucide-react`.
- Produces: `BillVersionsPanel({ versions, reports }: { versions: BillVersion[]; reports: CommitteeReport[] }): JSX.Element`.

- [ ] **Step 1: Implement the panel**

Create `src/components/kanban/bill-versions-panel.tsx`:

```typescript
'use client';

import { useMemo } from 'react';
import type { BillVersion, CommitteeReport } from '@/types/legislation';
import { groupReportsByVersion } from '@/lib/bill-versions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VersionTextViewer } from './version-text-viewer';
import { FileText, ExternalLink, Sparkles, ScrollText } from 'lucide-react';

function LinkButtons({ htmlLink, pdfLink }: { htmlLink: string | null; pdfLink: string | null }) {
  if (!htmlLink && !pdfLink) return null;
  return (
    <div className="flex items-center gap-1.5">
      {htmlLink && (
        <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
          <a href={htmlLink} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-1 h-3 w-3" /> HTML
          </a>
        </Button>
      )}
      {pdfLink && (
        <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
          <a href={pdfLink} target="_blank" rel="noopener noreferrer">
            <FileText className="mr-1 h-3 w-3" /> PDF
          </a>
        </Button>
      )}
    </div>
  );
}

function ReportRow({ report }: { report: CommitteeReport }) {
  return (
    <div className="rounded-md border border-border/60 bg-card/60 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <ScrollText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs font-medium">{report.reportCode ?? report.label}</span>
        </div>
        <LinkButtons htmlLink={report.htmlLink} pdfLink={report.pdfLink} />
      </div>
      {report.aiSummary && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{report.aiSummary}</p>
      )}
      {report.originalText && (
        <div className="mt-1">
          <VersionTextViewer text={report.originalText} label="Read report" />
        </div>
      )}
    </div>
  );
}

export function BillVersionsPanel({ versions, reports }: { versions: BillVersion[]; reports: CommitteeReport[] }) {
  const { groups, orphanReports } = useMemo(
    () => groupReportsByVersion(versions, reports),
    [versions, reports],
  );

  if (versions.length === 0 && reports.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No versions or reports available yet</p>
      </div>
    );
  }

  // "Latest" = last by created_at (query returns ascending, so last element).
  const latestVersion = versions.length > 0 ? versions[versions.length - 1] : null;
  const latestReport = reports.length > 0 ? reports[reports.length - 1] : null;

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 sm:p-5 space-y-5">
        {/* Zone A — Latest card */}
        {(latestVersion || latestReport) && (
          <div className="rounded-lg border border-primary/20 bg-card p-3.5 shadow-sm space-y-3">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Latest</h4>
            </div>

            {latestVersion && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{latestVersion.label}</span>
                  <LinkButtons htmlLink={latestVersion.htmlLink} pdfLink={latestVersion.pdfLink} />
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {latestVersion.aiSummary ?? 'No summary yet — the full text is available below.'}
                </p>
              </div>
            )}

            {latestReport && (
              <div className="border-t pt-2.5">
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  Latest report
                </p>
                <ReportRow report={latestReport} />
              </div>
            )}
          </div>
        )}

        {/* Zone B — Timeline */}
        <div>
          <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Timeline</h4>
          <ol className="relative space-y-4 border-l border-border/70 pl-4">
            {groups.map((group, i) => {
              const isLatest = latestVersion?.id === group.version.id;
              const isBase = i === 0;
              return (
                <li key={group.version.id} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" aria-hidden="true" />
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{group.version.label}</span>
                      {isBase && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">introduced</Badge>}
                      {isLatest && <Badge variant="default" className="h-4 px-1.5 text-[10px]">current</Badge>}
                    </div>
                    <LinkButtons htmlLink={group.version.htmlLink} pdfLink={group.version.pdfLink} />
                  </div>
                  {group.version.aiSummary && (
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{group.version.aiSummary}</p>
                  )}
                  {group.version.originalText && (
                    <div className="mt-1">
                      <VersionTextViewer text={group.version.originalText} defaultOpen={isLatest} />
                    </div>
                  )}
                  {group.reports.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {group.reports.map((report) => (
                        <ReportRow key={report.id} report={report} />
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          {orphanReports.length > 0 && (
            <div className="mt-5">
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Other reports</h4>
              <div className="space-y-1.5">
                {orphanReports.map((report) => (
                  <ReportRow key={report.id} report={report} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/kanban/bill-versions-panel.tsx
git commit -m "feat: add versions and reports panel component"
```

---

### Task 6: Wire panel into the dialog + remove AI Update button

**Files:**
- Modify: `src/components/kanban/bill-details-dialog.tsx`

**Interfaces:**
- Consumes: `BillVersionsPanel` (Task 5); `billDetails.versions` / `billDetails.reports` (Task 3).
- Produces: dialog with the AI Update button removed, a tabbed right panel (desktop) and a third mobile tab, widened to `sm:max-w-7xl`.

- [ ] **Step 1: Remove the AI Update button and its import**

In `src/components/kanban/bill-details-dialog.tsx`:

Delete the import on line 21: `import AIUpdateSingleButton from '../llm/llm-update-single-button';`

Delete the button usage on line 489: `<AIUpdateSingleButton bill={bill} />`

- [ ] **Step 2: Import the new panel**

Add near the other component imports (after the `TagSelector` import, line 39):

```typescript
import { BillVersionsPanel } from './bill-versions-panel';
```

- [ ] **Step 3: Widen the dialog**

Change the `DialogContent` className (line 214): replace `sm:max-w-6xl` with `sm:max-w-7xl`.

- [ ] **Step 4: Turn the desktop right panel into tabs**

The current `rightPanel` (lines ~496-551) is the Status Updates panel. Rename its content to a reusable `activityPanel` and wrap both it and the new versions panel in Tabs. Replace the `const rightPanel = ( ... );` block with:

```typescript
            const activityPanel = (
            <div className="flex flex-col min-h-0 h-full">
              <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 border-b shrink-0 flex items-center justify-between">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status Updates
                  {billDetails?.updates && (
                    <span className="ml-1.5 text-muted-foreground/60">({billDetails.updates.length})</span>
                  )}
                </h3>
                {user && (
                  <RefreshStatusesButton bill={bill} onRefresh={handleStatusUpdateRefresh} />
                )}
              </div>
              <ScrollArea className="flex-1">
                <div className="p-4 sm:p-5">
                  {billDetails?.updates && billDetails.updates.length > 0 ? (
                    <div className="space-y-3">
                      {billDetails.updates.map((update, index) => (
                        <div
                          key={`${billDetails.id}-update-${index}-${update.id || index}`}
                          className={cn(
                            "rounded-lg border p-3 text-sm transition-colors",
                            index === 0
                              ? "bg-card border-primary/20 shadow-sm"
                              : "bg-card/50 border-border/50"
                          )}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <Badge variant={index === 0 ? "default" : "outline"} className="text-[10px] h-4 px-1.5">
                              {update.chamber}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {new Date(update.date).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric'
                              })}
                            </span>
                          </div>
                          <p className={cn(
                            "text-xs leading-relaxed",
                            index === 0 ? "text-foreground" : "text-muted-foreground"
                          )}>
                            {update.statustext}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No status updates</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
            );

            const versionsPanel = (
              <BillVersionsPanel
                versions={billDetails?.versions ?? []}
                reports={billDetails?.reports ?? []}
              />
            );

            const rightPanel = (
            <div className={cn("flex flex-col bg-muted/20 min-h-0", isMobile ? "h-full" : "w-[45%]")}>
              <Tabs defaultValue="activity" className="flex-1 flex flex-col min-h-0">
                <TabsList className="mx-4 mt-3 shrink-0 grid grid-cols-2">
                  <TabsTrigger value="activity">
                    Activity
                    {billDetails?.updates && billDetails.updates.length > 0 && (
                      <span className="ml-1 text-muted-foreground/70">({billDetails.updates.length})</span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="versions">
                    Versions &amp; Reports
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="activity" className="flex-1 min-h-0 mt-2 data-[state=inactive]:hidden">
                  {activityPanel}
                </TabsContent>
                <TabsContent value="versions" className="flex-1 min-h-0 mt-2 flex flex-col data-[state=inactive]:hidden">
                  {versionsPanel}
                </TabsContent>
              </Tabs>
            </div>
            );
```

- [ ] **Step 5: Add the third mobile tab**

In the mobile branch (the `if (isMobile)` block, lines ~553-601), change the `TabsList` from `grid-cols-2` to `grid-cols-3`, add a Versions trigger, and add a `versions` `TabsContent`. Replace the mobile `<Tabs>...</Tabs>` block with:

```typescript
                  <Tabs defaultValue="details" className="flex-1 flex flex-col min-h-0">
                    <TabsList className="mx-4 mt-3 shrink-0 grid grid-cols-3">
                      <TabsTrigger value="details">Details</TabsTrigger>
                      <TabsTrigger value="activity">
                        Activity
                        {billDetails?.updates && billDetails.updates.length > 0 && (
                          <span className="ml-1 text-muted-foreground/70">({billDetails.updates.length})</span>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="versions">Versions</TabsTrigger>
                    </TabsList>
                    <TabsContent value="details" className="flex-1 min-h-0 mt-2 data-[state=inactive]:hidden">
                      {leftPanel}
                    </TabsContent>
                    <TabsContent value="activity" className="flex-1 min-h-0 mt-2 data-[state=inactive]:hidden">
                      {activityPanel}
                    </TabsContent>
                    <TabsContent value="versions" className="flex-1 min-h-0 mt-2 flex flex-col data-[state=inactive]:hidden">
                      {versionsPanel}
                    </TabsContent>
                  </Tabs>
```

Note: on mobile the right panel's own tab wrapper is bypassed — the mobile branch uses `activityPanel` and `versionsPanel` directly, so there is no nested Tabs. `rightPanel` is only used in the desktop return at the bottom.

- [ ] **Step 6: Verify typecheck and build pass**

Run: `npm run typecheck && npm run build`
Expected: PASS. The build must succeed (catches `'use server'` export violations). If build flags an unused `rightPanel` on mobile, that's fine — it's used in the desktop `return`.

- [ ] **Step 7: Commit**

```bash
git add src/components/kanban/bill-details-dialog.tsx
git commit -m "feat: add versions tab to bill dialog, remove AI update button"
```

---

### Task 7: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS, including the new `bill-versions.test.ts`.

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both PASS.

- [ ] **Step 3: Manual smoke (dev server)**

Run: `npm run dev` and open a bill that has versions/reports (e.g. `HB139 HD2 SD1`). Verify:
- No AI Update button in the status bar.
- Right panel has "Activity" and "Versions & Reports" tabs (desktop).
- Latest card shows the most recent version + its summary placeholder + latest report.
- Timeline lists versions with reports nested; "Read text"/"Read report" expand inline.
- Narrow the viewport (or use device emulation at 375px): a third "Versions" tab appears; content stacks and scrolls; buttons are tap-friendly.

- [ ] **Step 4: Final commit if any tweaks were needed**

```bash
git add -A && git commit -m "fix: bill versions panel polish" # only if changes were made
```

---

## Self-Review

**Spec coverage:**
- Remove AI Update button → Task 6, Step 1. ✓
- Latest card (version + report + summary) → Task 5 Zone A. ✓
- Timeline with reports nested → Task 5 Zone B + Task 2 grouping. ✓
- Links + inline text viewer + AI summary slot → Task 4 + Task 5 (`LinkButtons`, `VersionTextViewer`, summary/`No summary yet`). ✓
- Tabbed right panel, widen to 7xl → Task 6 Steps 3-4. ✓
- Mobile third tab → Task 6 Step 5. ✓
- One-fetch data flow → Task 3 (`getBillDetails` populates versions/reports). ✓
- Pure, tested grouping logic → Task 2. ✓
- Regenerated types → done pre-plan (committed with spec). ✓
- Empty/null states → Task 5 empty state; `LinkButtons` hides null links; `VersionTextViewer` guarded by `originalText &&`. ✓
- Orphan reports (defensive matching) → Task 2 + Task 5 "Other reports". ✓

**Placeholder scan:** No TBD/TODO; the one `REPLACE_WITH_BILL_ID` is an explicit instruction with the psql command to obtain it, not a code placeholder. ✓

**Type consistency:** `BillVersion`/`CommitteeReport` field names (`htmlLink`, `pdfLink`, `originalText`, `aiSummary`, `reportCode`, `createdAt`) are identical across Tasks 1, 3, 4, 5. `groupReportsByVersion` / `parseVersionLabelFromReport` signatures match between Task 2 and Task 5. `getBillVersionsAndReports` return shape matches its consumer in `getBillDetails`. ✓

## Open Items (from spec, confirm later)

- Version↔report ordering and precise matching semantics — confirm against real (non-seed) data. Current impl: versions ascending by `created_at`, "latest" = last; reports matched by parsed label segment, unmatched → "Other reports".
- AI summaries are null in seed; UI slot is ready. Populating summaries is out of scope.
