import { describe, it, expect } from 'vitest';
import {
  CONTACT_HREF,
  TESTIMONY_HREF,
  isTakeActionPath,
  takeActionBackHref,
} from '@/lib/take-action/routes';

describe('takeActionBackHref', () => {
  it('returns to the tab the user came from', () => {
    expect(takeActionBackHref('testimony')).toBe(TESTIMONY_HREF);
    expect(takeActionBackHref('contact')).toBe(CONTACT_HREF);
  });

  it('still honors the pre-rename ?from=testimonies', () => {
    expect(takeActionBackHref('testimonies')).toBe(TESTIMONY_HREF);
  });

  it('falls back for anything else', () => {
    expect(takeActionBackHref(null)).toBe('/');
    expect(takeActionBackHref('elsewhere')).toBe('/');
    expect(takeActionBackHref(undefined, '/your-bills')).toBe('/your-bills');
  });
});

describe('isTakeActionPath', () => {
  it('matches the section and its pages only', () => {
    expect(isTakeActionPath('/take-action')).toBe(true);
    expect(isTakeActionPath('/take-action/testimony/drafts')).toBe(true);
    expect(isTakeActionPath('/take-action/contact')).toBe(true);
    expect(isTakeActionPath('/take-actions')).toBe(false);
    expect(isTakeActionPath('/testimonies')).toBe(false);
  });
});
