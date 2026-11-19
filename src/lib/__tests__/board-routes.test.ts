import { describe, it, expect, afterEach } from 'vitest';
import {
  publicBoardPath,
  publicBoardUrl,
  isActiveBoardsPath,
  isActiveBoardsTabActive,
} from '@/lib/boards/board-routes';

const original = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = original;
});

describe('publicBoardPath', () => {
  it('builds /org/<slug>', () => {
    expect(publicBoardPath('food-plus')).toBe('/org/food-plus');
  });

  it('encodes URL-unsafe slugs', () => {
    expect(publicBoardPath('a b&c')).toBe('/org/a%20b%26c');
  });
});

describe('publicBoardUrl', () => {
  it('is absolute on the public origin', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://x.org/';
    expect(publicBoardUrl('food-plus')).toBe('https://x.org/org/food-plus');
  });
});

describe('isActiveBoardsPath', () => {
  it('covers the /community tree and public board pages', () => {
    expect(isActiveBoardsPath('/community')).toBe(true);
    expect(isActiveBoardsPath('/community/following')).toBe(true);
    expect(isActiveBoardsPath('/community/public-view')).toBe(true);
    expect(isActiveBoardsPath('/org/food-plus')).toBe(true);
  });

  it('does not match look-alike or unrelated paths', () => {
    expect(isActiveBoardsPath('/communityx')).toBe(false);
    expect(isActiveBoardsPath('/organization')).toBe(false);
    expect(isActiveBoardsPath('/tracker')).toBe(false);
  });
});

describe('isActiveBoardsTabActive', () => {
  it('keeps Browse to /community itself and public board pages', () => {
    expect(isActiveBoardsTabActive('/community', '/community')).toBe(true);
    expect(isActiveBoardsTabActive('/community', '/org/x')).toBe(true);
    expect(isActiveBoardsTabActive('/community', '/community/following')).toBe(false);
  });

  it('highlights Following and Public View on their own pages only', () => {
    expect(isActiveBoardsTabActive('/community/following', '/community/following')).toBe(true);
    expect(isActiveBoardsTabActive('/community/following', '/community')).toBe(false);
    expect(isActiveBoardsTabActive('/community/public-view', '/community/public-view')).toBe(true);
    expect(isActiveBoardsTabActive('/community/following', '/community/public-view')).toBe(false);
  });
});
