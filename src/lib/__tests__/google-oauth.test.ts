import { describe, it, expect } from 'vitest';
import {
  isValidOAuthState,
  encodeSignupPayload,
  decodeSignupPayload,
  decideGoogleAccountAction,
  deriveUsernameCandidate,
  MAX_PAYLOAD_COOKIE_LENGTH,
} from '../auth/google-oauth';

describe('isValidOAuthState', () => {
  it('accepts an exact match', () => {
    expect(isValidOAuthState('abc123', 'abc123')).toBe(true);
  });

  it('rejects a mismatch of the same length', () => {
    expect(isValidOAuthState('abc123', 'abc124')).toBe(false);
  });

  it('rejects differing lengths without throwing', () => {
    // timingSafeEqual throws on length mismatch, so this must be guarded.
    expect(() => isValidOAuthState('short', 'muchlongervalue')).not.toThrow();
    expect(isValidOAuthState('short', 'muchlongervalue')).toBe(false);
  });

  it('rejects when either side is missing', () => {
    expect(isValidOAuthState(null, 'abc')).toBe(false);
    expect(isValidOAuthState('abc', null)).toBe(false);
    expect(isValidOAuthState(null, null)).toBe(false);
  });

  it('rejects empty strings, so a cleared cookie never validates', () => {
    expect(isValidOAuthState('', '')).toBe(false);
  });
});

describe('signup payload round trip', () => {
  it('round-trips an invite token', () => {
    const encoded = encodeSignupPayload({ inviteToken: 'tok_abc' });
    expect(decodeSignupPayload(encoded)).toEqual({ inviteToken: 'tok_abc' });
  });

  it('round-trips an org name', () => {
    const encoded = encodeSignupPayload({ orgName: 'Food Policy Hui' });
    expect(decodeSignupPayload(encoded)).toEqual({ orgName: 'Food Policy Hui' });
  });

  it('round-trips both together', () => {
    const encoded = encodeSignupPayload({ orgName: 'Hui', inviteToken: 'tok' });
    expect(decodeSignupPayload(encoded)).toEqual({ orgName: 'Hui', inviteToken: 'tok' });
  });

  it('returns null when there is nothing to carry', () => {
    expect(encodeSignupPayload({})).toBeNull();
    expect(encodeSignupPayload({ orgName: '   ' })).toBeNull();
  });

  it('produces a URL-safe encoding', () => {
    const encoded = encodeSignupPayload({ orgName: 'Kaʻū Farmers + Ranchers' });
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeSignupPayload(encoded)).toEqual({ orgName: 'Kaʻū Farmers + Ranchers' });
  });

  it('trims whitespace on the way in', () => {
    const encoded = encodeSignupPayload({ orgName: '  Hui  ', inviteToken: ' tok ' });
    expect(decodeSignupPayload(encoded)).toEqual({ orgName: 'Hui', inviteToken: 'tok' });
  });
});

describe('decodeSignupPayload hostile input', () => {
  it('returns an empty payload for missing input', () => {
    expect(decodeSignupPayload(null)).toEqual({});
    expect(decodeSignupPayload(undefined)).toEqual({});
    expect(decodeSignupPayload('')).toEqual({});
  });

  it('returns an empty payload for garbage rather than throwing', () => {
    expect(() => decodeSignupPayload('not-base64-!!!')).not.toThrow();
    expect(decodeSignupPayload('not-base64-!!!')).toEqual({});
  });

  it('rejects valid base64 that is not JSON', () => {
    const encoded = Buffer.from('hello world', 'utf8').toString('base64url');
    expect(decodeSignupPayload(encoded)).toEqual({});
  });

  it('rejects JSON that is not an object', () => {
    const arr = Buffer.from('[1,2,3]', 'utf8').toString('base64url');
    const num = Buffer.from('42', 'utf8').toString('base64url');
    expect(decodeSignupPayload(arr)).toEqual({});
    expect(decodeSignupPayload(num)).toEqual({});
  });

  it('drops fields of the wrong type', () => {
    const encoded = Buffer.from(
      JSON.stringify({ orgName: 12345, inviteToken: { nested: true } }),
      'utf8'
    ).toString('base64url');
    expect(decodeSignupPayload(encoded)).toEqual({});
  });

  it('ignores unknown fields, so a tampered cookie cannot smuggle extras', () => {
    const encoded = Buffer.from(
      JSON.stringify({ orgName: 'Hui', systemRole: 'admin', userId: 'someone-else' }),
      'utf8'
    ).toString('base64url');
    expect(decodeSignupPayload(encoded)).toEqual({ orgName: 'Hui' });
  });

  it('drops an over-long org name instead of accepting it', () => {
    const encoded = Buffer.from(
      JSON.stringify({ orgName: 'x'.repeat(101), inviteToken: 'tok' }),
      'utf8'
    ).toString('base64url');
    // The invite still survives; only the invalid field is dropped.
    expect(decodeSignupPayload(encoded)).toEqual({ inviteToken: 'tok' });
  });

  it('refuses an oversized cookie outright', () => {
    const oversized = 'a'.repeat(MAX_PAYLOAD_COOKIE_LENGTH + 1);
    expect(decodeSignupPayload(oversized)).toEqual({});
  });
});

describe('decideGoogleAccountAction', () => {
  it('logs in a returning user matched by google_id', () => {
    expect(
      decideGoogleAccountAction({
        userIdByGoogleId: 'user-1',
        userIdByEmail: null,
        emailVerified: true,
      })
    ).toEqual({ type: 'login', userId: 'user-1' });
  });

  it('prefers the google_id match over an email match on a different account', () => {
    // The Google account's email may have changed since it was linked; the
    // stored google_id is the durable identifier and must win.
    expect(
      decideGoogleAccountAction({
        userIdByGoogleId: 'user-1',
        userIdByEmail: 'user-2',
        emailVerified: true,
      })
    ).toEqual({ type: 'login', userId: 'user-1' });
  });

  it('logs in a known google_id even when Google reports the email unverified', () => {
    // The link was already proven on a previous sign-in.
    expect(
      decideGoogleAccountAction({
        userIdByGoogleId: 'user-1',
        userIdByEmail: null,
        emailVerified: false,
      })
    ).toEqual({ type: 'login', userId: 'user-1' });
  });

  it('links a verified Google email to an existing password account', () => {
    expect(
      decideGoogleAccountAction({
        userIdByGoogleId: null,
        userIdByEmail: 'user-2',
        emailVerified: true,
      })
    ).toEqual({ type: 'link', userId: 'user-2' });
  });

  it('creates an account when nothing matches and the email is verified', () => {
    expect(
      decideGoogleAccountAction({
        userIdByGoogleId: null,
        userIdByEmail: null,
        emailVerified: true,
      })
    ).toEqual({ type: 'create' });
  });

  it('refuses to link an unverified Google email to an existing account', () => {
    // The account-takeover case: asserting an address must not claim the account.
    expect(
      decideGoogleAccountAction({
        userIdByGoogleId: null,
        userIdByEmail: 'user-2',
        emailVerified: false,
      })
    ).toEqual({ type: 'reject', reason: 'unverified_email' });
  });

  it('refuses to create an account from an unverified Google email', () => {
    expect(
      decideGoogleAccountAction({
        userIdByGoogleId: null,
        userIdByEmail: null,
        emailVerified: false,
      })
    ).toEqual({ type: 'reject', reason: 'unverified_email' });
  });
});

describe('deriveUsernameCandidate', () => {
  it('uses the email local-part', () => {
    expect(deriveUsernameCandidate('jaden.kapali@purplemaia.org')).toBe('jadenkapali');
  });

  it('lowercases and strips punctuation', () => {
    expect(deriveUsernameCandidate('Jaden_K+tag@example.com')).toBe('jadenktag');
  });

  it('falls back to the display name when the local-part is too short', () => {
    expect(deriveUsernameCandidate('jk@example.com', 'Jaden Kapali')).toBe('jadenkapali');
  });

  it('always returns a non-empty candidate', () => {
    // username is NOT NULL, so no input may produce an empty string.
    expect(deriveUsernameCandidate('..@example.com', '!!!').length).toBeGreaterThan(0);
    expect(deriveUsernameCandidate('a@example.com', null).length).toBeGreaterThan(0);
  });

  it('caps length so the candidate fits the column', () => {
    const long = `${'a'.repeat(80)}@example.com`;
    expect(deriveUsernameCandidate(long).length).toBeLessThanOrEqual(30);
  });
});
