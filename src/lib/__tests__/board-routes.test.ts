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
  it('covers the /boards tree and public board pages', () => {
    expect(isActiveBoardsPath('/boards')).toBe(true);
    expect(isActiveBoardsPath('/boards/browse')).toBe(true);
    expect(isActiveBoardsPath('/org/food-plus')).toBe(true);
  });

  it('does not match look-alike or unrelated paths', () => {
    expect(isActiveBoardsPath('/organization')).toBe(false);
    expect(isActiveBoardsPath('/your-bills')).toBe(false);
  });
});

describe('isActiveBoardsTabActive', () => {
  it('keeps Following exact', () => {
    expect(isActiveBoardsTabActive('/boards', '/boards')).toBe(true);
    expect(isActiveBoardsTabActive('/boards', '/org/x')).toBe(false);
  });

  it('highlights Browse on public board pages', () => {
    expect(isActiveBoardsTabActive('/boards/browse', '/boards/browse')).toBe(true);
    expect(isActiveBoardsTabActive('/boards/browse', '/org/x')).toBe(true);
    expect(isActiveBoardsTabActive('/boards/browse', '/boards')).toBe(false);
  });

  it('highlights only the Your Org tab on the admin preview', () => {
    expect(isActiveBoardsTabActive('/boards/mine', '/boards/mine')).toBe(true);
    expect(isActiveBoardsTabActive('/boards', '/boards/mine')).toBe(false);
    expect(isActiveBoardsTabActive('/boards/browse', '/boards/mine')).toBe(false);
  });
});
