import { describe, it, expect } from 'vitest';
import { compareVersionHtml } from '@/services/bill-diff';

describe('compareVersionHtml', () => {
  it('returns a no-html error when either version lacks an html_link', async () => {
    const a = await compareVersionHtml({
      olderLabel: 'HB1334', newerLabel: 'HD1',
      olderUrl: null, newerUrl: 'https://example.invalid/b.htm',
    });
    expect(a.error).toBe('no-html');
    expect(a.sections).toEqual([]);
    expect(a.olderLabel).toBe('HB1334');
    expect(a.newerLabel).toBe('HD1');

    const b = await compareVersionHtml({
      olderLabel: 'HB1334', newerLabel: 'HD1',
      olderUrl: 'https://example.invalid/a.htm', newerUrl: null,
    });
    expect(b.error).toBe('no-html');
  });
});
