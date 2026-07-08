import { describe, it, expect } from 'vitest';
import { tiptapExcerpt } from '@/lib/tiptap-text';

function doc(...paragraphs: string[]) {
  return {
    type: 'doc',
    content: paragraphs.map((text) => ({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    })),
  };
}

describe('tiptapExcerpt', () => {
  it('returns empty string for null, non-objects, and empty docs', () => {
    expect(tiptapExcerpt(null)).toBe('');
    expect(tiptapExcerpt(undefined)).toBe('');
    expect(tiptapExcerpt('not a doc')).toBe('');
    expect(tiptapExcerpt({})).toBe('');
    expect(tiptapExcerpt({ type: 'doc', content: [] })).toBe('');
  });

  it('flattens a single paragraph', () => {
    expect(tiptapExcerpt(doc('Aloha Chair and Members,'))).toBe('Aloha Chair and Members,');
  });

  it('joins paragraphs with a space', () => {
    expect(tiptapExcerpt(doc('First.', 'Second.'))).toBe('First. Second.');
  });

  it('skips empty paragraphs (blank lines)', () => {
    const d = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'One.' }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'Two.' }] },
      ],
    };
    expect(tiptapExcerpt(d)).toBe('One. Two.');
  });

  it('reads text through nested marks/nodes', () => {
    const d = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'I ' },
            { type: 'text', text: 'strongly', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' support this.' },
          ],
        },
      ],
    };
    expect(tiptapExcerpt(d)).toBe('I strongly support this.');
  });

  it('truncates on a word boundary with an ellipsis', () => {
    const excerpt = tiptapExcerpt(doc('The quick brown fox jumps over the lazy dog'), 20);
    expect(excerpt).toBe('The quick brown fox…');
    expect(excerpt.length).toBeLessThanOrEqual(21);
  });

  it('does not truncate text at exactly maxLength', () => {
    expect(tiptapExcerpt(doc('12345'), 5)).toBe('12345');
  });
});
