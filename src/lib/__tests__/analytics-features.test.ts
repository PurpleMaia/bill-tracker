import { describe, it, expect } from 'vitest';
import { FEATURE_KEYS, featureKey, featureLabel, isValidOrgFilter, parseOrgFilter } from '../analytics/features';

describe('feature labels', () => {
  it('labels page views by section and events by name', () => {
    expect(featureLabel(featureKey('page_view', 'find-bills'))).toBe('Find Bills page');
    expect(featureLabel(featureKey('bill_opened', null))).toBe('Opened a bill');
    expect(featureLabel('testimony_exported')).toBe('Exported testimony');
  });
  it('falls back to the raw key for unknown features', () => {
    expect(featureLabel('mystery_event')).toBe('mystery_event');
  });
  it('lists every page section and client event once', () => {
    expect(FEATURE_KEYS).toContain('page_view:tracker');
    expect(FEATURE_KEYS).toContain('bill_search');
    expect(FEATURE_KEYS).not.toContain('page_view');
    expect(new Set(FEATURE_KEYS).size).toBe(FEATURE_KEYS.length);
  });
});

describe('parseOrgFilter', () => {
  it('maps all / none / tenant id', () => {
    expect(parseOrgFilter('all')).toEqual({ kind: 'all' });
    expect(parseOrgFilter(null)).toEqual({ kind: 'all' });
    expect(parseOrgFilter('none')).toEqual({ kind: 'none' });
    const id = '3f2b8c1e-0000-4000-8000-000000000001';
    expect(parseOrgFilter(id)).toEqual({ kind: 'org', tenantId: id });
  });
  it('rejects anything that is not a uuid', () => {
    expect(parseOrgFilter('abc')).toBeNull();
  });
});

describe('isValidOrgFilter', () => {
  it('accepts the three shapes and rejects junk', () => {
    expect(isValidOrgFilter({ kind: 'all' })).toBe(true);
    expect(isValidOrgFilter({ kind: 'none' })).toBe(true);
    expect(isValidOrgFilter({ kind: 'org', tenantId: '3f2b8c1e-0000-4000-8000-000000000001' })).toBe(true);
    expect(isValidOrgFilter({ kind: 'org', tenantId: "x' or 1=1" })).toBe(false);
    expect(isValidOrgFilter({ kind: 'everything' })).toBe(false);
    expect(isValidOrgFilter(null)).toBe(false);
  });
});
