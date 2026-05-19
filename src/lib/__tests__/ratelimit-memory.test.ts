import { describe, it, expect, beforeEach } from 'vitest';
import { limitFixedWindow, retryAfterMs } from '../ratelimit-memory';

describe('limitFixedWindow', () => {
  // Use unique keys per test to avoid interference
  let keyCounter = 0;
  const uniqueKey = () => `test-key-${++keyCounter}-${Date.now()}`;

  it('allows first request within the limit', () => {
    const key = uniqueKey();
    const result = limitFixedWindow(key, 5, 60_000);
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('decrements remaining count on each request', () => {
    const key = uniqueKey();

    const r1 = limitFixedWindow(key, 3, 60_000);
    expect(r1.ok).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = limitFixedWindow(key, 3, 60_000);
    expect(r2.ok).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = limitFixedWindow(key, 3, 60_000);
    expect(r3.ok).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it('blocks requests after limit is reached', () => {
    const key = uniqueKey();

    // Exhaust the limit
    limitFixedWindow(key, 2, 60_000);
    limitFixedWindow(key, 2, 60_000);

    // Third request should be blocked
    const result = limitFixedWindow(key, 2, 60_000);
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('returns resetAt timestamp in the future', () => {
    const key = uniqueKey();
    const before = Date.now();
    const result = limitFixedWindow(key, 5, 60_000);
    expect(result.resetAt).toBeGreaterThan(before);
    expect(result.resetAt).toBeLessThanOrEqual(before + 60_000 + 100); // small tolerance
  });

  it('uses consistent resetAt within same window', () => {
    const key = uniqueKey();
    const r1 = limitFixedWindow(key, 5, 60_000);
    const r2 = limitFixedWindow(key, 5, 60_000);
    expect(r1.resetAt).toBe(r2.resetAt);
  });

  it('treats different keys independently', () => {
    const key1 = uniqueKey();
    const key2 = uniqueKey();

    // Exhaust key1
    limitFixedWindow(key1, 1, 60_000);
    const blocked = limitFixedWindow(key1, 1, 60_000);
    expect(blocked.ok).toBe(false);

    // key2 should still be available
    const r2 = limitFixedWindow(key2, 1, 60_000);
    expect(r2.ok).toBe(true);
  });

  it('handles limit of 1', () => {
    const key = uniqueKey();

    const r1 = limitFixedWindow(key, 1, 60_000);
    expect(r1.ok).toBe(true);
    expect(r1.remaining).toBe(0);

    const r2 = limitFixedWindow(key, 1, 60_000);
    expect(r2.ok).toBe(false);
    expect(r2.remaining).toBe(0);
  });
});

describe('retryAfterMs', () => {
  it('returns positive value when reset is in the future', () => {
    const now = Date.now();
    const resetAt = now + 30_000;
    expect(retryAfterMs(resetAt, now)).toBe(30_000);
  });

  it('returns 0 when reset is in the past', () => {
    const now = Date.now();
    const resetAt = now - 1000;
    expect(retryAfterMs(resetAt, now)).toBe(0);
  });

  it('returns 0 when reset equals now', () => {
    const now = Date.now();
    expect(retryAfterMs(now, now)).toBe(0);
  });
});
