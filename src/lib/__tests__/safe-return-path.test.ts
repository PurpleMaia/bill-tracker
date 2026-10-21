import { describe, it, expect } from 'vitest';
import { safeReturnPath } from '../core/safe-return-path';

describe('safeReturnPath', () => {
  it('accepts relative app paths with queries', () => {
    expect(safeReturnPath('/your-bills?bill=123')).toBe('/your-bills?bill=123');
    expect(safeReturnPath('/discover?stages=a&bill=9')).toBe('/discover?stages=a&bill=9');
    expect(safeReturnPath('/')).toBe('/');
  });

  it('rejects empty / missing', () => {
    expect(safeReturnPath(null)).toBeNull();
    expect(safeReturnPath(undefined)).toBeNull();
    expect(safeReturnPath('')).toBeNull();
  });

  it('rejects protocol-relative and backslash tricks', () => {
    expect(safeReturnPath('//evil.example')).toBeNull();
    expect(safeReturnPath('/\\evil.example')).toBeNull();
    expect(safeReturnPath('/%2Fevil.example')).toBeNull();
    expect(safeReturnPath('/%5Cevil.example')).toBeNull();
  });

  it('rejects absolute URLs and schemes', () => {
    expect(safeReturnPath('https://evil.example')).toBeNull();
    expect(safeReturnPath('javascript:alert(1)')).toBeNull();
    expect(safeReturnPath('evil.example/path')).toBeNull();
  });

  it('rejects control characters', () => {
    expect(safeReturnPath('/\t/evil.example')).toBeNull();
    expect(safeReturnPath('/ok\n')).toBeNull();
  });
});
