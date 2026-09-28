import { describe, it, expect } from 'vitest';
import {
  getOAuthProvider,
  isKnownProvider,
  oauthCookieNames,
} from '../auth/oauth-registry';

describe('getOAuthProvider', () => {
  it('resolves the google provider by id', () => {
    const provider = getOAuthProvider('google');
    expect(provider).not.toBeNull();
    expect(provider?.id).toBe('google');
  });

  it('returns null for an unknown provider id', () => {
    expect(getOAuthProvider('myspace')).toBeNull();
  });

  it('is case-insensitive on the id from the URL segment', () => {
    expect(getOAuthProvider('GOOGLE')?.id).toBe('google');
  });
});

describe('isKnownProvider', () => {
  it('is true for a registered provider', () => {
    expect(isKnownProvider('google')).toBe(true);
  });

  it('is false for an unregistered provider', () => {
    expect(isKnownProvider('facebook')).toBe(false);
  });
});

describe('oauthCookieNames', () => {
  it('namespaces the cookie names by provider so two flows never collide', () => {
    const google = oauthCookieNames('google');
    const other = oauthCookieNames('microsoft');

    expect(google.state).not.toBe(other.state);
    expect(google.state).toContain('google');
    expect(other.state).toContain('microsoft');
  });

  it('produces distinct names for state, verifier, and payload', () => {
    const names = oauthCookieNames('google');
    const distinct = new Set([names.state, names.codeVerifier, names.payload]);
    expect(distinct.size).toBe(3);
  });
});
