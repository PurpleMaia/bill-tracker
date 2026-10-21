import { describe, it, expect } from 'vitest';
import { ApiError, Errors } from '../core/errors';

describe('ApiError', () => {
  it('creates an error with code, statusCode, and message', () => {
    const err = new ApiError('TEST_ERROR', 400, 'Test message');
    expect(err.code).toBe('TEST_ERROR');
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Test message');
    expect(err.name).toBe('ApiError');
  });

  it('is an instance of Error', () => {
    const err = new ApiError('TEST', 500, 'test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
  });

  it('has a stack trace', () => {
    const err = new ApiError('TEST', 500, 'test');
    expect(err.stack).toBeDefined();
  });
});

describe('Errors constants', () => {
  it('TOO_MANY_REQUESTS has 429 status', () => {
    expect(Errors.TOO_MANY_REQUESTS.statusCode).toBe(429);
    expect(Errors.TOO_MANY_REQUESTS.code).toBe('TOO_MANY_REQUESTS');
  });

  it('USER_ALREADY_EXISTS has 409 status', () => {
    expect(Errors.USER_ALREADY_EXISTS.statusCode).toBe(409);
  });

  it('INVALID_CREDENTIALS has 401 status', () => {
    expect(Errors.INVALID_CREDENTIALS.statusCode).toBe(401);
  });

  it('ACCOUNT_INACTIVE has 403 status', () => {
    expect(Errors.ACCOUNT_INACTIVE.statusCode).toBe(403);
  });

  it('EMAIL_NOT_VERIFIED has 403 status', () => {
    expect(Errors.EMAIL_NOT_VERIFIED.statusCode).toBe(403);
  });

  it('UNAUTHORIZED has 401 status', () => {
    expect(Errors.UNAUTHORIZED.statusCode).toBe(401);
  });

  it('FORBIDDEN has 403 status', () => {
    expect(Errors.FORBIDDEN.statusCode).toBe(403);
  });

  it('NO_SESSION_COOKIE has 401 status', () => {
    expect(Errors.NO_SESSION_COOKIE.statusCode).toBe(401);
  });

  it('INTERNAL_ERROR has 500 status', () => {
    expect(Errors.INTERNAL_ERROR.statusCode).toBe(500);
  });

  it('NOT_A_MEMBER has 403 status', () => {
    expect(Errors.NOT_A_MEMBER.statusCode).toBe(403);
  });

  it('TENANT_NOT_FOUND has 404 status', () => {
    expect(Errors.TENANT_NOT_FOUND.statusCode).toBe(404);
  });

  it('all errors are ApiError instances', () => {
    for (const [, error] of Object.entries(Errors)) {
      expect(error).toBeInstanceOf(ApiError);
    }
  });

  it('all errors have non-empty messages', () => {
    for (const [, error] of Object.entries(Errors)) {
      expect(error.message.length).toBeGreaterThan(0);
    }
  });
});
