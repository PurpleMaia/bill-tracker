import { describe, it, expect } from 'vitest';
import { isProfileIncomplete, normalizeName } from '../auth/profile';

describe('isProfileIncomplete', () => {
  it('is false when signed out', () => {
    expect(isProfileIncomplete(null)).toBe(false);
  });

  it('is true when either name is missing or blank', () => {
    expect(isProfileIncomplete({ firstName: null, lastName: null })).toBe(true);
    expect(isProfileIncomplete({ firstName: 'Jane', lastName: null })).toBe(true);
    expect(isProfileIncomplete({ firstName: '  ', lastName: 'Doe' })).toBe(true);
  });

  it('is false when both names are present', () => {
    expect(isProfileIncomplete({ firstName: 'Jane', lastName: 'Doe' })).toBe(false);
  });
});

describe('normalizeName', () => {
  it('trims and collapses blanks to null', () => {
    expect(normalizeName('  Jane ')).toBe('Jane');
    expect(normalizeName('   ')).toBeNull();
    expect(normalizeName(undefined)).toBeNull();
  });
});
