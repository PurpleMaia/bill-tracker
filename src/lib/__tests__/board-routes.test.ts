import { describe, it, expect, afterEach } from 'vitest';
import {
  publicBoardPath,
  publicBoardUrl,
  isActiveBoardsPath,
  communityTab,
} from '@/lib/boards/board-routes';

const original = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = original;
});

describe('publicBoardPath', () => {
  it('builds /community/<slug>', () => {
    expect(publicBoardPath('food-plus')).toBe('/community/food-plus');
  });

  it('encodes URL-unsafe slugs', () => {
    expect(publicBoardPath('a b&c')).toBe('/community/a%20b%26c');
  });
});

describe('publicBoardUrl', () => {
  it('is absolute on the public origin', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://x.org/';
    expect(publicBoardUrl('food-plus')).toBe('https://x.org/community/food-plus');
  });
});

describe('isActiveBoardsPath', () => {
  it('covers the /community tree', () => {
    expect(isActiveBoardsPath('/community')).toBe(true);
    expect(isActiveBoardsPath('/community/following')).toBe(true);
    expect(isActiveBoardsPath('/community/food-plus')).toBe(true);
  });

  it('does not match look-alike or unrelated paths', () => {
    expect(isActiveBoardsPath('/communityx')).toBe(false);
    expect(isActiveBoardsPath('/tracker')).toBe(false);
  });
});

describe('communityTab', () => {
  it('maps Browse and Following', () => {
    expect(communityTab('/community', 'food-plus')).toBe('browse');
    expect(communityTab('/community/following', 'food-plus')).toBe('following');
  });

  it('treats your own org board as Your Organization', () => {
    expect(communityTab('/community/food-plus', 'food-plus')).toBe('your-organization');
  });

  it('treats another org board as Browse, where it was opened from', () => {
    expect(communityTab('/community/hawaii-farmers', 'food-plus')).toBe('browse');
    expect(communityTab('/community/food-plus', null)).toBe('browse');
  });

  it('is null outside Community', () => {
    expect(communityTab('/tracker', 'food-plus')).toBeNull();
  });
});
