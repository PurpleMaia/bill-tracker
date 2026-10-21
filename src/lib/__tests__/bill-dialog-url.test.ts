import { describe, it, expect } from 'vitest';
import { withBillParam, billActionHref, hasNonBillParams, stripBillParam } from '../bills/bill-dialog-url';

describe('withBillParam', () => {
  it('adds bill to an empty query', () => {
    expect(withBillParam('', '123')).toBe('?bill=123');
  });

  it('keeps other params when adding', () => {
    expect(withBillParam('?stages=a&tracked=untracked', '9')).toBe('?stages=a&tracked=untracked&bill=9');
  });

  it('replaces an existing bill', () => {
    expect(withBillParam('stages=a&bill=1', '2')).toBe('?stages=a&bill=2');
  });

  it('removes bill and keeps the rest', () => {
    expect(withBillParam('?stages=a&bill=1', null)).toBe('?stages=a');
  });

  it('returns empty string when nothing remains', () => {
    expect(withBillParam('?bill=1', null)).toBe('');
  });
});

describe('billActionHref', () => {
  it('builds an encoded returnTo link', () => {
    expect(billActionHref('123', 'testimony', '/your-bills?bill=123'))
      .toBe('/bills/123/testimony?returnTo=%2Fyour-bills%3Fbill%3D123');
    expect(billActionHref('123', 'contact', '/discover?stages=a&bill=123'))
      .toBe('/bills/123/contact?returnTo=%2Fdiscover%3Fstages%3Da%26bill%3D123');
  });

  it('omits returnTo when there is none', () => {
    expect(billActionHref('123', 'testimony')).toBe('/bills/123/testimony');
  });
});

describe('stripBillParam', () => {
  it('removes bill from a path and keeps other params', () => {
    expect(stripBillParam('/discover?stages=a&bill=9')).toBe('/discover?stages=a');
  });

  it('drops the query entirely when only bill was set', () => {
    expect(stripBillParam('/your-bills?bill=9')).toBe('/your-bills');
  });

  it('leaves paths without bill alone', () => {
    expect(stripBillParam('/testimonies')).toBe('/testimonies');
    expect(stripBillParam('/')).toBe('/');
  });
});

describe('hasNonBillParams', () => {
  it('ignores bill', () => {
    expect(hasNonBillParams('?bill=1')).toBe(false);
    expect(hasNonBillParams('')).toBe(false);
  });

  it('detects other params', () => {
    expect(hasNonBillParams('?bill=1&stages=a')).toBe(true);
    expect(hasNonBillParams('tracked=untracked')).toBe(true);
  });
});
