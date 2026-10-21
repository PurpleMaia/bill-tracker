import { describe, it, expect } from 'vitest';
import { setSessionCookie, getClearSessionCookie } from '../auth/cookies';

describe('setSessionCookie', () => {
  it('sets the session cookie with the token value', () => {
    const cookie = setSessionCookie('abc123');
    expect(cookie).toContain('session=abc123');
  });

  it('sets HttpOnly flag', () => {
    const cookie = setSessionCookie('token');
    expect(cookie).toContain('HttpOnly');
  });

  it('sets SameSite=Lax', () => {
    const cookie = setSessionCookie('token');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('sets Path=/', () => {
    const cookie = setSessionCookie('token');
    expect(cookie).toContain('Path=/');
  });

  it('sets 7-day Max-Age', () => {
    const cookie = setSessionCookie('token');
    const sevenDays = 7 * 24 * 60 * 60;
    expect(cookie).toContain(`Max-Age=${sevenDays}`);
  });
});

describe('getClearSessionCookie', () => {
  it('sets session to empty', () => {
    const cookie = getClearSessionCookie();
    expect(cookie).toContain('session=;');
  });

  it('sets Max-Age=0 to expire immediately', () => {
    const cookie = getClearSessionCookie();
    expect(cookie).toContain('Max-Age=0');
  });

  it('keeps HttpOnly and SameSite', () => {
    const cookie = getClearSessionCookie();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });
});
