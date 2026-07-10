// External-integration wrapper for the `hawaii-bill-diff` package (per
// CLAUDE.md, third-party wrappers live in src/services/). Plain module — the
// package is synchronous and pure for our plain-text path, so client
// components import and run it directly with no server-action boundary.
import { compareBills, generateDiffSummary } from 'hawaii-bill-diff';
import type { BillVersion } from '@/types/legislation';

export interface DiffRow {
  type: 'add' | 'del' | 'context' | 'modified';
  text: string;
}

export interface VersionDiff {
  olderLabel: string;
  newerLabel: string;
  rows: DiffRow[];
  summaryText: string;
  error: boolean;
}

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

/**
 * Compare two versions using hawaii-bill-diff and normalize its output into
 * UI-ready rows. Feeds each version's stored `original_text` as content (no
 * network fetch). Returns an error diff (empty rows) when either version lacks
 * text or the package throws.
 */
export function diffVersions(older: BillVersion, newer: BillVersion): VersionDiff {
  const base = {
    olderLabel: older.label,
    newerLabel: newer.label,
  };

  if (!older.originalText || !newer.originalText) {
    return { ...base, rows: [], summaryText: '', error: true };
  }

  try {
    const result = compareBills(toBillData(older), toBillData(newer));
    const rows: DiffRow[] = [
      ...result.removed.map((text): DiffRow => ({ type: 'del', text })),
      ...result.modified.map((text): DiffRow => ({ type: 'modified', text })),
      ...result.added.map((text): DiffRow => ({ type: 'add', text })),
    ];
    // If the package reported no changes at all, surface the unchanged lines as
    // context so the UI can say "no differences" honestly rather than blank.
    if (rows.length === 0) {
      for (const text of result.unchanged) rows.push({ type: 'context', text });
    }
    return { ...base, rows, summaryText: generateDiffSummary(result), error: false };
  } catch {
    return { ...base, rows: [], summaryText: '', error: true };
  }
}
