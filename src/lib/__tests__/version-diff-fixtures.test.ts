// Fixture-backed tests over the real corpus. These pin the measured behaviour
// of hawaii-bill-diff's section parsing, so a package upgrade that changes it
// fails loudly instead of silently degrading the diff.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { diffParsedHtml } from '@/services/bill-diff';

const FIXTURES = join(__dirname, 'fixtures');

function html(name: string): string {
  // Fixtures are stored byte-exact as windows-1252, matching what the network
  // returns; decode the same way the service does.
  return new TextDecoder('windows-1252').decode(readFileSync(join(FIXTURES, `${name}.htm`)));
}

describe('diffParsedHtml over real Hawaii bill documents', () => {
  it('produces a small number of real section changes for HB1494 HD1 -> HD2', () => {
    const c = diffParsedHtml(html('HB1494_HD1'), html('HB1494_HD2'), 'HB1494_HD1', 'HB1494_HD2');
    expect(c.error).toBeNull();
    // The line-based path reported 134 removed / 216 modified of noise here.
    // Section-based comparison finds a handful of real changes.
    expect(c.sections.length).toBeGreaterThan(0);
    expect(c.sections.length).toBeLessThan(30);
    const changed = c.sections.filter((s) => s.kind !== 'unchanged');
    expect(changed.length).toBeGreaterThan(0);
  });

  it('surfaces Hawaii amendment marks as struck/underlined fragments', () => {
    const c = diffParsedHtml(html('HB1494_HD1'), html('HB1494_HD2'), 'HD1', 'HD2');
    const fragments = c.sections.flatMap((s) => s.fragments);
    expect(fragments.some((f) => f.struck)).toBe(true);
    expect(fragments.some((f) => f.underlined)).toBe(true);
  });

  it('flags parseIncomplete for HB1494, whose sections 7/8/10/11 are dropped', () => {
    const c = diffParsedHtml(html('HB1494_HD1'), html('HB1494_HD2'), 'HD1', 'HD2');
    expect(c.parseIncomplete).toBe(true);
  });

  it('never emits Word metadata as section content', () => {
    const c = diffParsedHtml(html('HB1494_HD1'), html('HB1494_HD2'), 'HD1', 'HD2');
    const allText = c.sections.flatMap((s) => s.fragments).map((f) => f.text).join(' ');
    // parseBillHtml(...).text leads with these; sections must not contain them.
    expect(allText).not.toContain('Bill HD.dotm');
    expect(allText).not.toContain('HB template, revision no.');
  });

  it('orders sections numerically', () => {
    const c = diffParsedHtml(html('HB1494_HD1'), html('HB1494_HD2'), 'HD1', 'HD2');
    const numeric = c.sections
      .map((s) => Number.parseInt(s.sectionNumber, 10))
      .filter((n) => Number.isFinite(n));
    expect(numeric).toEqual([...numeric].sort((a, b) => a - b));
  });

  it('handles HB235 HD1 -> CD1', () => {
    const c = diffParsedHtml(html('HB235_HD1'), html('HB235_CD1'), 'HB235_HD1', 'HB235_CD1');
    expect(c.error).toBeNull();
    expect(c.sections.filter((s) => s.kind !== 'unchanged').length).toBeGreaterThan(0);
  });

  it('returns a parse-failed comparison for non-bill HTML', () => {
    const c = diffParsedHtml('<html><body>not a bill</body></html>', '<html><body>nope</body></html>', 'A', 'B');
    expect(c.error).toBe('parse-failed');
    expect(c.sections).toEqual([]);
  });
});
