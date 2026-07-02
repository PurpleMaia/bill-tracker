import { describe, it, expect } from 'vitest';
import {
  tiptapToBlocks,
  composeHeaderLines,
  positionLabel,
} from '@/lib/testimony-export/blocks';

const doc = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Aloha Chair and Members' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'I ' },
        { type: 'text', marks: [{ type: 'bold' }], text: 'strongly' },
        {
          type: 'text',
          marks: [
            { type: 'italic' },
            { type: 'textStyle', attrs: { fontFamily: 'Georgia, serif' } },
          ],
          text: ' support',
        },
        { type: 'text', text: ' this bill.' },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Food security' }] },
          ],
        },
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Local farms' }] },
          ],
        },
      ],
    },
  ],
};

describe('tiptapToBlocks', () => {
  it('converts headings with level and text', () => {
    const blocks = tiptapToBlocks(doc);
    expect(blocks[0]).toEqual({
      type: 'heading',
      level: 2,
      runs: [{ text: 'Aloha Chair and Members' }],
    });
  });

  it('maps bold/italic/fontFamily marks onto runs', () => {
    const blocks = tiptapToBlocks(doc);
    expect(blocks[1]).toEqual({
      type: 'paragraph',
      runs: [
        { text: 'I ' },
        { text: 'strongly', bold: true },
        { text: ' support', italic: true, font: 'Georgia, serif' },
        { text: ' this bill.' },
      ],
    });
  });

  it('flattens bullet lists into items of runs', () => {
    const blocks = tiptapToBlocks(doc);
    expect(blocks[2]).toEqual({
      type: 'list',
      ordered: false,
      items: [[{ text: 'Food security' }], [{ text: 'Local farms' }]],
    });
  });

  it('marks ordered lists as ordered', () => {
    const blocks = tiptapToBlocks({
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }],
            },
          ],
        },
      ],
    });
    expect(blocks[0]).toEqual({ type: 'list', ordered: true, items: [[{ text: 'One' }]] });
  });

  it('maps underline and strike marks', () => {
    const blocks = tiptapToBlocks({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', marks: [{ type: 'underline' }], text: 'u' },
            { type: 'text', marks: [{ type: 'strike' }], text: 's' },
          ],
        },
      ],
    });
    expect(blocks[0]).toEqual({
      type: 'paragraph',
      runs: [
        { text: 'u', underline: true },
        { text: 's', strike: true },
      ],
    });
  });

  it('clamps heading levels to 1–3 and keeps empty paragraphs', () => {
    const blocks = tiptapToBlocks({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 6 }, content: [{ type: 'text', text: 'Deep' }] },
        { type: 'paragraph' },
      ],
    });
    expect(blocks[0]).toEqual({ type: 'heading', level: 3, runs: [{ text: 'Deep' }] });
    expect(blocks[1]).toEqual({ type: 'paragraph', runs: [] });
  });

  it('returns [] for null, non-doc, or empty input', () => {
    expect(tiptapToBlocks(null)).toEqual([]);
    expect(tiptapToBlocks({})).toEqual([]);
    expect(tiptapToBlocks('nope')).toEqual([]);
  });

  it('skips unknown node types', () => {
    const blocks = tiptapToBlocks({
      type: 'doc',
      content: [{ type: 'horizontalRule' }, { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
    });
    expect(blocks).toEqual([{ type: 'paragraph', runs: [{ text: 'hi' }] }]);
  });

  it('emits a break run for hardBreak nodes inside a paragraph', () => {
    const blocks = tiptapToBlocks({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'first line' },
            { type: 'hardBreak' },
            { type: 'text', text: 'second line' },
          ],
        },
      ],
    });
    expect(blocks[0]).toEqual({
      type: 'paragraph',
      runs: [{ text: 'first line' }, { text: '', break: true }, { text: 'second line' }],
    });
  });

  it('flattens nested lists into items of the parent list block', () => {
    const blocks = tiptapToBlocks({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'parent item' }] },
                {
                  type: 'bulletList',
                  content: [
                    {
                      type: 'listItem',
                      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'nested one' }] }],
                    },
                    {
                      type: 'listItem',
                      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'nested two' }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(blocks[0]).toEqual({
      type: 'list',
      ordered: false,
      items: [
        [{ text: 'parent item' }],
        [{ text: 'nested one' }],
        [{ text: 'nested two' }],
      ],
    });
  });
});

describe('positionLabel', () => {
  it('labels each position', () => {
    expect(positionLabel('support')).toBe('Testimony in SUPPORT of');
    expect(positionLabel('oppose')).toBe('Testimony in OPPOSITION to');
    expect(positionLabel('comments')).toBe('Comments on');
  });
});

describe('composeHeaderLines', () => {
  it('composes the full header', () => {
    expect(
      composeHeaderLines({
        billNumber: 'HB123',
        billTitle: 'Relating to Food Security',
        committee: 'AGR, FIN',
        position: 'support',
        authorName: 'Jane Doe',
        organization: 'Food+ Hui',
        dateStr: 'July 2, 2026',
      }),
    ).toEqual([
      'Testimony in SUPPORT of HB123',
      'Relating to Food Security',
      'Committee: AGR, FIN',
      'Submitted by: Jane Doe, Food+ Hui',
      'July 2, 2026',
    ]);
  });

  it('omits committee line and organization suffix when absent', () => {
    expect(
      composeHeaderLines({
        billNumber: 'SB55',
        billTitle: 'Relating to Agriculture',
        committee: null,
        position: 'comments',
        authorName: 'Jane Doe',
        organization: '',
        dateStr: 'July 2, 2026',
      }),
    ).toEqual([
      'Comments on SB55',
      'Relating to Agriculture',
      'Submitted by: Jane Doe',
      'July 2, 2026',
    ]);
  });
});
