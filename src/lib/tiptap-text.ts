// ==============================================
// TIPTAP TEXT — pure extraction of plain text from
// a Tiptap document JSON ({ type: 'doc', content: [...] })
// ==============================================

interface TiptapNode {
  type?: string;
  text?: string;
  content?: TiptapNode[];
}

function collectText(node: TiptapNode, parts: string[]): void {
  if (typeof node.text === 'string') parts.push(node.text);
  if (Array.isArray(node.content)) {
    for (const child of node.content) collectText(child, parts);
    // Block boundaries become spaces so paragraphs don't run together.
    if (node.type === 'doc') return;
  }
}

/**
 * Flattens a Tiptap document into a single plain-text string, truncated to
 * `maxLength` on a word boundary with an ellipsis. Returns '' for empty or
 * malformed documents (e.g. the DB default '{}').
 */
export function tiptapExcerpt(doc: unknown, maxLength = 180): string {
  if (!doc || typeof doc !== 'object') return '';

  const parts: string[] = [];
  const root = doc as TiptapNode;
  if (Array.isArray(root.content)) {
    for (const block of root.content) {
      const blockParts: string[] = [];
      collectText(block, blockParts);
      const text = blockParts.join('').trim();
      if (text) parts.push(text);
    }
  }

  const full = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (full.length <= maxLength) return full;

  const cut = full.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLength).trimEnd()}…`;
}
