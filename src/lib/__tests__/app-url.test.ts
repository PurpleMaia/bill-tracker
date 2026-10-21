import { describe, it, expect, afterEach } from 'vitest';
import { getAppUrl, appUrl } from '@/lib/core/app-url';

const original = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = original;
});

describe('app-url', () => {
  it('falls back to the local dev origin', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(getAppUrl()).toBe('http://localhost:9002');
  });

  it('strips a trailing slash from the configured origin', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://dev-bill-tracker.purplemaia.org/';
    expect(getAppUrl()).toBe('https://dev-bill-tracker.purplemaia.org');
  });

  it('builds redirects on the public origin, not the internal one', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://dev-bill-tracker.purplemaia.org';
    expect(appUrl('/?authError=state_mismatch').toString()).toBe(
      'https://dev-bill-tracker.purplemaia.org/?authError=state_mismatch'
    );
    expect(appUrl('/').toString()).toBe('https://dev-bill-tracker.purplemaia.org/');
  });
});
