import { describe, it, expect } from 'vitest';
import { validateClientEvent, resolveTenant, toStoredEvent } from '../analytics/events';

describe('validateClientEvent', () => {
  it('accepts an allowlisted event', () => {
    expect(validateClientEvent({ event: 'page_view', props: { section: 'tracker' } })?.event).toBe('page_view');
  });
  it('rejects server-only events', () => {
    expect(validateClientEvent({ event: 'login' })).toBeNull();
    expect(validateClientEvent({ event: 'status_change' })).toBeNull();
  });
  it('rejects unknown events and non-objects', () => {
    expect(validateClientEvent({ event: 'hack' })).toBeNull();
    expect(validateClientEvent('page_view')).toBeNull();
    expect(validateClientEvent(null)).toBeNull();
  });
  it('rejects props over 2048 bytes', () => {
    expect(validateClientEvent({ event: 'csv_exported', props: { x: 'a'.repeat(2100) } })).toBeNull();
  });
  it('trims and caps bill_search query at 100 chars', () => {
    const v = validateClientEvent({ event: 'bill_search', props: { query: '  ' + 'b'.repeat(150), resultCount: 3 } });
    expect(v?.props?.query).toBe('b'.repeat(100));
  });
});

describe('resolveTenant', () => {
  it('keeps a tenant the user belongs to', () => expect(resolveTenant('t1', ['t1', 't2'])).toBe('t1'));
  it('drops a tenant the user does not belong to', () => expect(resolveTenant('t9', ['t1'])).toBeNull());
  it('drops any tenant when signed out', () => expect(resolveTenant('t1', null)).toBeNull());
  it('returns null when none requested', () => expect(resolveTenant(undefined, ['t1'])).toBeNull());
});

describe('toStoredEvent', () => {
  it('requires anonId when signed out', () => {
    expect(toStoredEvent({ event: 'page_view' }, { userId: null, memberTenantIds: null })).toBeNull();
  });
  it('drops anonId when signed in', () => {
    const row = toStoredEvent({ event: 'page_view', anonId: 'a1' }, { userId: 'u1', memberTenantIds: [] });
    expect(row).toMatchObject({ userId: 'u1', anonId: null });
  });
  it('strips all identity from bill_search', () => {
    const row = toStoredEvent(
      { event: 'bill_search', tenantId: 't1', anonId: 'a1', props: { query: 'poi' } },
      { userId: 'u1', memberTenantIds: ['t1'] },
    );
    expect(row).toMatchObject({ userId: null, tenantId: null, anonId: null, props: { query: 'poi' } });
  });
  it('whitelists bill_search props and nulls path', () => {
    const row = toStoredEvent(
      { event: 'bill_search', path: '/find-bills', props: { query: 'poi', resultCount: 3, extra: 'x', userEmail: 'a@b.c' } },
      { userId: 'u1', memberTenantIds: ['t1'] },
    );
    expect(row?.props).toEqual({ query: 'poi', resultCount: 3 });
    expect(row?.path).toBeNull();
  });
  it('drops wrongly-typed bill_search props', () => {
    const row = toStoredEvent(
      { event: 'bill_search', props: { query: 5, resultCount: 'many' } },
      { userId: null, memberTenantIds: null },
    );
    expect(row?.props).toEqual({});
  });
  it('truncates bill_search createdAt to the UTC hour', () => {
    const row = toStoredEvent(
      { event: 'bill_search', props: { query: 'poi' } },
      { userId: null, memberTenantIds: null, now: new Date('2026-11-20T13:47:21.123Z') },
    );
    expect(row?.createdAt?.toISOString()).toBe('2026-11-20T13:00:00.000Z');
  });
  it('normalizes path for non-search events', () => {
    const row = toStoredEvent(
      { event: 'page_view', anonId: 'a1', path: '/bills/abc123?x=1' },
      { userId: null, memberTenantIds: null },
    );
    expect(row?.path).toBe('/bills/[id]');
  });
});
