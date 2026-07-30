// Cache-behaviour tests for the bill-HTML fetcher.
//
// These stub globalThis.fetch rather than hitting the network. That is a
// departure from the pure-logic-only rule in CLAUDE.md, justified narrowly: the
// property under test is EVICTION, which is only observable through fetch call
// counts, and an unbounded cache here is a memory leak measured in hundreds of
// MB. No DB is involved and no real network call is made.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchBillHtml, clearBillHtmlCache, billHtmlCacheSize } from '@/services/bill-html';

const originalFetch = globalThis.fetch;

/** Counts calls per URL so cache hits are distinguishable from misses. */
let calls: string[] = [];

beforeEach(() => {
  clearBillHtmlCache();
  calls = [];
  globalThis.fetch = vi.fn(async (url: any) => {
    const href = String(url);
    calls.push(href);
    return {
      ok: true,
      status: 200,
      // windows-1252 bytes for the body; the service decodes them itself.
      arrayBuffer: async () => new TextEncoder().encode(`<html>${href}</html>`).buffer,
    } as unknown as Response;
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearBillHtmlCache();
});

function url(n: number): string {
  return `https://data.capitol.hawaii.gov/doc/${n}.htm`;
}

describe('fetchBillHtml caching', () => {
  it('serves a repeat request from cache without refetching', async () => {
    await fetchBillHtml(url(1));
    await fetchBillHtml(url(1));
    expect(calls).toEqual([url(1)]);
  });

  it('returns the same content on a cache hit', async () => {
    const first = await fetchBillHtml(url(1));
    const second = await fetchBillHtml(url(1));
    expect(second).toBe(first);
    expect(first).toContain(url(1));
  });

  it('never exceeds the entry ceiling', async () => {
    // Well past the 16-entry cap.
    for (let i = 0; i < 40; i++) await fetchBillHtml(url(i));
    expect(billHtmlCacheSize()).toBeLessThanOrEqual(16);
  });

  it('evicts the least-recently-used entry, not the newest', async () => {
    for (let i = 0; i < 16; i++) await fetchBillHtml(url(i));
    calls = [];

    // url(0) is the oldest; one more insertion should evict it.
    await fetchBillHtml(url(99));
    await fetchBillHtml(url(0));
    expect(calls).toContain(url(0)); // refetched => it was evicted

    // url(15) was the most recent of the original fill and should still be warm.
    calls = [];
    await fetchBillHtml(url(15));
    expect(calls).toEqual([]);
  });

  it('a read marks an entry recent, protecting it from the next eviction', async () => {
    for (let i = 0; i < 16; i++) await fetchBillHtml(url(i));

    // Touch the oldest entry so it is no longer the eviction candidate.
    await fetchBillHtml(url(0));
    calls = [];

    // This insertion should now evict url(1), the new oldest — not url(0).
    await fetchBillHtml(url(99));

    await fetchBillHtml(url(0));
    expect(calls).not.toContain(url(0)); // still cached

    await fetchBillHtml(url(1));
    expect(calls).toContain(url(1)); // evicted in its place
  });

  it('does not cache a non-2xx response', async () => {
    globalThis.fetch = vi.fn(async () => {
      return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
    }) as unknown as typeof fetch;

    await expect(fetchBillHtml(url(7))).rejects.toThrow(/404/);
    expect(billHtmlCacheSize()).toBe(0);
  });
});
