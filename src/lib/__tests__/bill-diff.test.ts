import { describe, it, expect } from 'vitest';
import { diffVersions } from '@/services/bill-diff';
import type { BillVersion } from '@/types/legislation';

const ver = (label: string, originalText: string | null): BillVersion => ({
  id: label, label, htmlLink: null, pdfLink: null,
  originalText, aiSummary: null, createdAt: null,
});

describe('diffVersions', () => {
  it('produces add/del/modified rows from two version texts', () => {
    const older = ver('HB1334', 'SECTION 2. Funded at $5,000,000.\nSECTION 4. Effective 2026.');
    const newer = ver('HD1', 'SECTION 2. Funded at $2,000,000.\nSECTION 3. Report annually.\nSECTION 4. Effective 2026.');
    const d = diffVersions(older, newer);
    expect(d.olderLabel).toBe('HB1334');
    expect(d.newerLabel).toBe('HD1');
    expect(d.error).toBe(false);
    expect(d.rows.length).toBeGreaterThan(0);
    // At least one changed row is surfaced.
    expect(d.rows.some((r) => r.type === 'add' || r.type === 'modified')).toBe(true);
    expect(typeof d.summaryText).toBe('string');
  });

  it('returns an error diff when a version has no text', () => {
    const d = diffVersions(ver('HB1334', null), ver('HD1', 'text'));
    expect(d.error).toBe(true);
    expect(d.rows).toEqual([]);
  });

  it('reports no changes for identical text without erroring', () => {
    const same = 'SECTION 1. Identical text.';
    const d = diffVersions(ver('A', same), ver('B', same));
    expect(d.error).toBe(false);
    expect(d.rows.every((r) => r.type === 'context')).toBe(true);
  });
});
