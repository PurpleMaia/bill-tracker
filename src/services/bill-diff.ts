// External-integration wrapper for the `hawaii-bill-diff` package (per
// CLAUDE.md, third-party wrappers live in src/services/). Plain module — the
// package is synchronous and pure for our plain-text path, so client
// components import and run it directly with no server-action boundary.
//
// NOTE: hawaii-bill-diff@1.0.1 has a broken CommonJS entry — its package.json
// points `main`/`require` at ./dist/index.js, which doesn't exist (only the ESM
// build dist/index.es.js and dist/index.cjs.js ship). It therefore resolves
// only via the ESM `import` condition. Keep every consumer of this module on
// the ESM path (client components, Vitest); do NOT import it from a CommonJS /
// `require()` context (a plain Node script, a forced-CJS SSR path) or it throws
// MODULE_NOT_FOUND.
import { compareBills, generateDiffSummary } from 'hawaii-bill-diff';
import type { BillVersion } from '@/types/legislation';

/**
 * One aligned diff row. `left` is the older side, `right` the newer side.
 *  - 'context'  : unchanged line (left === right)
 *  - 'modified' : line changed (both sides present, differ)
 *  - 'del'      : line removed (left only)
 *  - 'add'      : line added (right only)
 * A null side means "blank cell" in a side-by-side view.
 */
export interface DiffRow {
  kind: 'add' | 'del' | 'context' | 'modified';
  left: string | null;
  right: string | null;
}

export interface VersionDiff {
  olderLabel: string;
  newerLabel: string;
  rows: DiffRow[];
  /** Plain-language change summary from the package (generateDiffSummary). */
  summaryText: string;
  error: boolean;
}

/** Tailwind classes for diff highlighting, shared by the inline and split views. */
export const DIFF_ROW_CLASS: Record<DiffRow['kind'], string> = {
  add: 'bg-[#E7F4E9] text-[#2F7A3E]',
  del: 'bg-[#FBEAE6] text-[#B4442F]',
  modified: 'bg-[#FBEAE6] text-[#B4442F]',
  context: 'text-foreground/70',
};

function toBillData(v: BillVersion) {
  return {
    id: v.id,
    title: v.label,
    version: v.label,
    date: v.createdAt ?? '',
    content: v.originalText ?? '',
    url: v.htmlLink ?? undefined,
  };
}

// The package formats a modified entry as: Line N: "old text" → "new text".
const MODIFIED_RE = /^Line\s+\d+:\s+"([\s\S]*)"\s+→\s+"([\s\S]*)"$/;

function parseModified(entry: string): { left: string; right: string } {
  const m = entry.match(MODIFIED_RE);
  if (m) return { left: m[1], right: m[2] };
  // Fall back to showing the raw entry on both sides if the format changes.
  return { left: entry, right: entry };
}

/**
 * Compare two versions using hawaii-bill-diff and normalize its output into
 * aligned rows both the inline and side-by-side views can render. Feeds each
 * version's stored `original_text` as content (no network fetch). Returns an
 * error diff (empty rows) when either version lacks text or the package throws.
 */
export function diffVersions(older: BillVersion, newer: BillVersion): VersionDiff {
  const base = { olderLabel: older.label, newerLabel: newer.label };

  if (!older.originalText || !newer.originalText) {
    return { ...base, rows: [], summaryText: '', error: true };
  }

  try {
    const result = compareBills(toBillData(older), toBillData(newer));

    // Modified lines carry both sides → align them on one row. Removals are
    // left-only, additions right-only. When there are no changes at all, show
    // the unchanged lines as context so the view isn't blank.
    const rows: DiffRow[] = [
      ...result.modified.map((entry): DiffRow => {
        const { left, right } = parseModified(entry);
        return { kind: 'modified', left, right };
      }),
      ...result.removed.map((text): DiffRow => ({ kind: 'del', left: text, right: null })),
      ...result.added.map((text): DiffRow => ({ kind: 'add', left: null, right: text })),
    ];

    if (rows.length === 0) {
      for (const text of result.unchanged) {
        rows.push({ kind: 'context', left: text, right: text });
      }
    }

    return { ...base, rows, summaryText: generateDiffSummary(result), error: false };
  } catch {
    return { ...base, rows: [], summaryText: '', error: true };
  }
}
