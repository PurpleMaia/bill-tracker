import { describe, it, expect } from 'vitest';
import { getClientIp } from '../core/client-ip';

/** Minimal stand-in for the Headers subset getClientIp reads. */
function req(headers: Record<string, string>) {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  };
}

describe('getClientIp', () => {
  it('prefers cf-connecting-ip over everything else', () => {
    expect(
      getClientIp(
        req({
          'cf-connecting-ip': '203.0.113.7',
          'x-forwarded-for': '198.51.100.1',
          'x-real-ip': '192.0.2.1',
        }),
      ),
    ).toBe('203.0.113.7');
  });

  it('falls back to the first x-forwarded-for entry', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1, 10.0.0.2' }))).toBe(
      '198.51.100.1',
    );
  });

  it('trims whitespace around the x-forwarded-for entry', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '  198.51.100.1 , 10.0.0.1' }))).toBe('198.51.100.1');
  });

  it('falls back to x-real-ip when no forwarded header is present', () => {
    expect(getClientIp(req({ 'x-real-ip': '192.0.2.1' }))).toBe('192.0.2.1');
  });

  it("returns 'unknown' when no header identifies the caller", () => {
    expect(getClientIp(req({}))).toBe('unknown');
  });

  it("returns 'unknown' rather than an empty bucket key for a blank forwarded header", () => {
    // A header present but empty would otherwise yield '' — a falsy key that
    // reads as "no rate limiting" to a careless caller.
    expect(getClientIp(req({ 'x-forwarded-for': '   ' }))).toBe('unknown');
    expect(getClientIp(req({ 'x-forwarded-for': ',' }))).toBe('unknown');
  });
});
