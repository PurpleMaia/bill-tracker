import { describe, it, expect, afterEach } from 'vitest';
import {
  publicBoardPath,
  publicBoardUrl,
  isActiveBoardsPath,
  communityTab,
  embedBoardPath,
  embedBoardUrl,
  publicBillUrl,
  embedSnippet,
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

describe('embed links', () => {
  it('builds /embed/<slug>, encoded', () => {
    expect(embedBoardPath('a b')).toBe('/embed/a%20b');
  });

  it('is absolute on the public origin', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://x.org/';
    expect(embedBoardUrl('food-plus')).toBe('https://x.org/embed/food-plus');
  });

  it('links a bill on the org’s public board', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://x.org/';
    expect(publicBillUrl('food-plus', 'b 1')).toBe('https://x.org/community/food-plus?bill=b%201');
  });
});

describe('embedSnippet', () => {
  it('is an iframe of the embed URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://x.org/';
    expect(embedSnippet('food-plus', 'Food+')).toBe(
      '<iframe src="https://x.org/embed/food-plus" title="Food+’s Tracker" width="100%" height="600" style="border:0" loading="lazy"></iframe>',
    );
  });

  it('escapes the org name inside the title attribute', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://x.org/';
    expect(embedSnippet('food-plus', 'A "B" <C> & D')).toContain(
      'title="A &quot;B&quot; &lt;C&gt; &amp; D’s Tracker"',
    );
  });
});
