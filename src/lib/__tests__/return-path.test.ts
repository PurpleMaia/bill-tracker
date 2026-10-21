import { describe, it, expect } from 'vitest';
import {
  safeReturnPath,
  loginHref,
  registerHref,
  MAX_RETURN_PATH_LENGTH,
} from '../auth/return-path';

describe('safeReturnPath', () => {
  it('accepts a same-site path', () => {
    expect(safeReturnPath('/discover')).toBe('/discover');
  });

  it('keeps the query string', () => {
    expect(safeReturnPath('/discover?q=food&page=2')).toBe('/discover?q=food&page=2');
  });

  it('falls back for missing or non-string input', () => {
    expect(safeReturnPath(null)).toBe('/');
    expect(safeReturnPath(undefined)).toBe('/');
    expect(safeReturnPath(42)).toBe('/');
    expect(safeReturnPath('')).toBe('/');
  });

  it('uses the given fallback', () => {
    expect(safeReturnPath('https://evil.com', '/boards')).toBe('/boards');
  });

  it('rejects absolute URLs', () => {
    expect(safeReturnPath('https://evil.com')).toBe('/');
    expect(safeReturnPath('javascript:alert(1)')).toBe('/');
  });

  it('rejects protocol-relative URLs', () => {
    expect(safeReturnPath('//evil.com')).toBe('/');
    expect(safeReturnPath('/\\evil.com')).toBe('/');
  });

  it('rejects paths without a leading slash', () => {
    expect(safeReturnPath('discover')).toBe('/');
  });

  it('rejects control characters browsers would strip', () => {
    expect(safeReturnPath('/\t/evil.com')).toBe('/');
    expect(safeReturnPath('/discover\n')).toBe('/');
  });

  it('rejects oversized values', () => {
    expect(safeReturnPath('/' + 'a'.repeat(MAX_RETURN_PATH_LENGTH))).toBe('/');
  });

  it('refuses to return to the auth pages, so nothing loops', () => {
    expect(safeReturnPath('/login')).toBe('/');
    expect(safeReturnPath('/login?next=/x')).toBe('/');
    expect(safeReturnPath('/register')).toBe('/');
  });
});

describe('loginHref / registerHref', () => {
  it('omits next for home', () => {
    expect(loginHref('/')).toBe('/login');
    expect(loginHref(null)).toBe('/login');
  });

  it('omits next for unsafe values', () => {
    expect(loginHref('//evil.com')).toBe('/login');
  });

  it('encodes the return path', () => {
    expect(loginHref('/discover?q=food')).toBe('/login?next=%2Fdiscover%3Fq%3Dfood');
    expect(registerHref('/boards')).toBe('/register?next=%2Fboards');
  });
});
