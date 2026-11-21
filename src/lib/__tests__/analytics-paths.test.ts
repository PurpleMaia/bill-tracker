import { describe, it, expect } from 'vitest';
import { normalizePath, sectionForPath } from '@/lib/analytics/paths';

describe('normalizePath', () => {
  it('replaces bill ids', () => expect(normalizePath('/bills/3f2a-uuid/testimony')).toBe('/bills/[id]/testimony'));
  it('replaces community slugs but not fixed subpages', () => {
    expect(normalizePath('/community/hawaii-foodbank')).toBe('/community/[slug]');
    expect(normalizePath('/community/following')).toBe('/community/following');
    expect(normalizePath('/community/your-organization')).toBe('/community/your-organization');
  });
  it('strips query, hash and trailing slash', () => expect(normalizePath('/find-bills/?q=poi#x')).toBe('/find-bills'));
  it('keeps the root path', () => expect(normalizePath('/')).toBe('/'));
});

describe('sectionForPath', () => {
  it('maps main sections', () => {
    expect(sectionForPath('/tracker')).toBe('tracker');
    expect(sectionForPath('/find-bills')).toBe('find-bills');
    expect(sectionForPath('/take-action/testimony')).toBe('take-action');
    expect(sectionForPath('/community/following')).toBe('community');
    expect(sectionForPath('/guide')).toBe('guide');
    expect(sectionForPath('/learn')).toBe('learn');
    expect(sectionForPath('/bills/abc/contact')).toBe('bill');
  });
  it('maps / to find-bills (the root re-exports Find Bills)', () => {
    expect(sectionForPath('/')).toBe('find-bills');
  });
  it('never tracks the analytics page or auth pages', () => {
    expect(sectionForPath('/analytics')).toBeNull();
    expect(sectionForPath('/login')).toBeNull();
    expect(sectionForPath('/register')).toBeNull();
  });
});
