import { describe, it, expect } from 'vitest';
import { escapeHtml } from '@/services/email';

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('a&b')).toBe('a&amp;b');
  });

  it('escapes less-than signs', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes greater-than signs', () => {
    expect(escapeHtml('a>b')).toBe('a&gt;b');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe("it&#039;s");
  });

  it('returns empty string unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('returns plain text unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });

  it('escapes multiple special characters in one string', () => {
    expect(escapeHtml('<img src="x" onerror=\'alert(1)\'>')).toBe(
      '&lt;img src=&quot;x&quot; onerror=&#039;alert(1)&#039;&gt;'
    );
  });

  it('handles a realistic XSS username', () => {
    const malicious = '<script>document.cookie</script>';
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('>');
    expect(escaped).toBe('&lt;script&gt;document.cookie&lt;/script&gt;');
  });

  it('escapes ampersands before other entities (correct order)', () => {
    // If & were escaped after < or >, we'd double-escape
    expect(escapeHtml('&<')).toBe('&amp;&lt;');
  });
});
